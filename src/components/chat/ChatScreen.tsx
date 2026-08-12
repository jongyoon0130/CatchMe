import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SelfProfile, ChatMessage, StyleSample } from '../../types/self'
import { INSIGHT_LABELS } from '../../types/self'
import { Button } from '../ui'
import { ProfileSheet } from '../profile/ProfileSheet'
import { ChatMessageList } from './ChatMessageList'
import { splitMessageParagraphs, stripApiTurnTimestampFromContent } from '../../lib/chatDisplay'
import {
  buildReplyPlan,
  insertReplyAfterUser,
  planSend,
  type SendPlan,
} from '../../lib/chatReplyPlan'
import {
  fetchAIResponse,
  detectRegister,
  extractStyleRules,
  accumulateInsights,
  analyzeInsightsWithAI,
  mergeInsight,
  updateConversationSummary,
  AI_ANALYZE_EVERY,
  geminiErrorUserMessage,
  shouldUpdateConversationSummary,
  isBackgroundApiPaused,
  getActiveModel,
  GeminiApiError,
  resetProfilePromptBulk,
  shouldUseLitePrompt,
} from '../../lib/selfEngine'
import type { ApiCheckResult } from '../../lib/selfEngine'
import {
  loadChatAsync,
  saveChat,
  saveChatAsync,
  loadModel,
  saveProfileRecord,
  deleteProfileRecord,
  downloadBackup,
  parseBackup,
  applyBackup,
  resolveCachedApiStatus,
} from '../../lib/storage'
import { generateFutureMemories, findDeniedMemory } from '../../lib/futureMemory'
import {
  isDeveloperMode,
  registerDeveloperModeUnlockTap,
  resolveEffectiveApiKey,
} from '../../lib/geminiApiKey'
import { ChatApiSettingsSection } from '../settings/ChatApiSettingsSection'
import { addMiscTodo, loadMiscTodos } from '../../lib/goalMiscTodos'
import { getGoalAppOwnerId } from '../../lib/goalAppOwner'
import { GOAL_DATA_SYNC_EVENT } from '../../lib/goalDataSync'
import { dateKeyOf, shiftDateKey, todoDraftFromMessage, type PendingTodo } from '../../lib/chatToPlan'

function readInitialApiStatus(): 'idle' | ApiCheckResult {
  const key = resolveEffectiveApiKey()
  const mdl = getActiveModel(loadModel())
  const cached = resolveCachedApiStatus(key, mdl)
  return cached === 'idle' ? 'idle' : cached
}

const TODO_DATE_CHIPS = [
  { label: '오늘', offset: 0 },
  { label: '내일', offset: 1 },
  { label: '모레', offset: 2 },
] as const

/** 일정 확인 카드용 날짜 표기 — "내일 (7/18 토)" */
function formatTodoDate(date: string, now = new Date()): string {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return date
  const base = new Date(now)
  base.setHours(12, 0, 0, 0)
  const diff = Math.round((d.getTime() - base.getTime()) / 86400000)
  const label = `${d.getMonth() + 1}/${d.getDate()} ${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}`
  if (diff === 0) return `오늘 (${label})`
  if (diff === 1) return `내일 (${label})`
  if (diff === 2) return `모레 (${label})`
  return label
}


interface Props {
  profileId: string
  profile: SelfProfile
  onBack: () => void
  onProfileDeleted: () => void
  onProfileUpdate: (p: SelfProfile) => void
  onOpenPlanner: () => void
  initialPrompt?: string | null
  onInitialPromptUsed?: () => void
}

const MAX_SAMPLES = 60
/** 연속 전송 간격 (burst → 503/RPM 완화) */
const SEND_COOLDOWN_MS = 8000
/** chatReply 503 후 재시도 대기 */
const POST_503_COOLDOWN_MS = 90_000
/** chatReply 후 대화 요약 API — 동시 호출 방지 */
const CONVERSATION_SUMMARY_DELAY_MS = 20_000

/** 예전 버전: 대화 시작 시 자동으로 넣던 인사만 있으면 빈 채팅으로 취급 */
function stripLegacyIntro(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length !== 1) return messages
  const m = messages[0]
  if (m.role === 'self' && m.content.startsWith('안녕, 나야.')) return []
  return messages
}

export function ChatScreen({ profileId, profile, onBack, onProfileDeleted, onProfileUpdate, onOpenPlanner, initialPrompt, onInitialPromptUsed }: Props) {
  const [self, setSelf] = useState<SelfProfile>(profile)

  const persistSelf = (next: SelfProfile) => {
    setSelf(next)
    onProfileUpdate(next)
    saveProfileRecord(next)
  }

  /**
   * 항상 최신 self — 배경 작업(요약·인사이트 분석)은 await 뒤에 실행돼서
   * 클로저의 self가 낡을 수 있다. setSelf 업데이터 안에서 저장·부모 알림을 하면
   * React가 렌더 중 실행해 경고를 내므로, ref로 최신값을 읽고 밖에서 persistSelf 한다.
   */
  const selfRef = useRef(self)
  selfRef.current = self
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatReady, setChatReady] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!initialPrompt) return
    setInput(initialPrompt)
    onInitialPromptUsed?.()
  }, [initialPrompt, onInitialPromptUsed])
  const [revealProgress, setRevealProgress] = useState<{ msgId: string; shown: number } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [devMode, setDevMode] = useState(isDeveloperMode())
  const [showProfile, setShowProfile] = useState(false)
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | ApiCheckResult>(readInitialApiStatus)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const msgSinceAnalyze = useRef(0)
  const analyzing = useRef(false)
  const lastSendAt = useRef(0)
  const last503At = useRef(0)
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  /** 이번 채팅 세션에서 API 실패 직후에만 표시 (나갔다 들어오면 안 뜸) */
  const [retryBannerMsgId, setRetryBannerMsgId] = useState<string | null>(null)
  /** 계획표로 보낼 메시지 — user가 "추가"를 눌러야 실제로 들어간다 */
  const [pendingTodo, setPendingTodo] = useState<PendingTodo | null>(null)

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const enterSelectMode = (msgId: string) => {
    if (typing) return
    setShowSettings(false)
    setShowProfile(false)
    setSelectMode(true)
    setSelectedIds(new Set([msgId]))
  }

  const toggleSelect = (msgId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)))
    }
  }

  /** 고른 메시지 하나를 계획표 확인 카드로 — 저장은 카드에서 "추가"를 눌러야 일어난다 */
  const sendSelectedToPlan = () => {
    if (selectedIds.size !== 1) return
    const picked = messages.find((m) => selectedIds.has(m.id))
    const draft = picked ? todoDraftFromMessage(picked.content) : null
    if (!draft) return
    exitSelectMode()
    setPendingTodo(draft)
  }

  const deleteSelectedMessages = async () => {
    if (!selectedIds.size) return
    const n = selectedIds.size
    if (!window.confirm(`선택한 ${n}개의 메시지를 삭제할까요?`)) return
    const next = messages.filter((m) => !selectedIds.has(m.id))
    setMessages(next)
    exitSelectMode()
    await saveChatAsync(profileId, next)
  }

  useEffect(() => {
    setRetryBannerMsgId(null)
  }, [profileId])

  useEffect(() => {
    let cancelled = false
    loadChatAsync(profileId).then((saved) => {
      if (cancelled) return
      setMessages(stripLegacyIntro(saved))
      setChatReady(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const handleDeleteProfile = async () => {
        if (
      !window.confirm(
        `'${self.name}' 프로필과 대화를 삭제할까요?\n다른 프로필은 그대로 남아요.`,
      )
    ) {
      return
    }
    await deleteProfileRecord(profileId)
    onProfileDeleted()
  }

  const handleImportFile = async (file: File) => {
    setImportStatus('idle')
    try {
      const backup = parseBackup(await file.text())
      if (!backup) {
        setImportStatus('fail')
        return
      }
      const ok = window.confirm(
        `'${backup.profile.name}' 백업 (${backup.messages.length}개 메시지)을 가져올까요?\n지금 프로필·대화를 덮어씁니다.`,
      )
      if (!ok) return
      await applyBackup(backup, profileId)
      const p = { ...backup.profile, id: profileId }
      persistSelf(p)
      setMessages(backup.messages)
      setChatReady(true)
      setImportStatus('ok')
    } catch {
      setImportStatus('fail')
    }
  }

  // 몇 메시지마다 AI가 최근 대화를 읽고 지속적 성격·가치관을 추론해 반영 (조심스럽게)
  const runAIAnalysis = async (history: ChatMessage[]) => {
    const key = resolveEffectiveApiKey()
    if (!key || analyzing.current || isBackgroundApiPaused()) return
    analyzing.current = true
    try {
      const recent = history.slice(-14).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }))
      const found = await analyzeInsightsWithAI(recent, key, getActiveModel(loadModel()))
      if (found.length) {
        let ins = selfRef.current.insights ?? []
        for (const c of found) ins = mergeInsight(ins, { ...c, source: 'ai' })
        persistSelf({ ...selfRef.current, insights: ins })
      }
    } catch {
      /* 분석 실패는 조용히 무시 */
    } finally {
      analyzing.current = false
    }
  }

  const scheduleDeferredSummary = (
    profile: SelfProfile,
    history: { role: 'user' | 'assistant'; content: string; timestamp?: number }[],
    key: string,
    mdl: string,
  ) => {
    if (isBackgroundApiPaused()) return
    if (!shouldUpdateConversationSummary(history.length, profile.summarizedMessageCount ?? 0)) {
      return
    }
    if (summaryTimer.current) clearTimeout(summaryTimer.current)
    summaryTimer.current = setTimeout(() => {
      void (async () => {
        if (isBackgroundApiPaused()) return
        try {
          const sumResult = await updateConversationSummary(profile, history, key, mdl)
          if (!sumResult) return
          persistSelf({
            ...selfRef.current,
            conversationSummary: sumResult.summary,
            summarizedMessageCount: sumResult.summarizedMessageCount,
          })
        } catch {
          /* 요약 실패는 조용히 무시 */
        }
      })()
    }, CONVERSATION_SUMMARY_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (summaryTimer.current) clearTimeout(summaryTimer.current)
    }
  }, [])

  // 카톡처럼 입력이 최대 4줄까지 늘어나고, 그 이상은 최근 줄만 보이며 스크롤
  const autoGrow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const paddingY = 24 // py-3 (위아래 12px씩)
    const maxHeight = lineHeight * 4 + paddingY
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    autoGrow()
  }, [input])

  // 설정 열 때 API 자동 ping 하지 않음 (429 유발 방지) — '저장' 버튼으로만 확인

  useEffect(() => {
    if (!chatReady) return
    saveChat(profileId, messages)
  }, [messages, chatReady, profileId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing, revealProgress])

  // 미래의 나의 기억 뒤늦게 채우기 — 온보딩 때 API 키가 없었거나 생성이 실패했으면 비어 있다.
  // (이 기능이 생기기 전에 만든 프로필도 마찬가지다.) 키가 생긴 첫 순간에 한 번만 만든다.
  // 실패하면 generateFutureMemories가 빈 배열을 주므로 그냥 다음 기회에 다시 시도한다.
  const memoryFillTried = useRef(false)
  useEffect(() => {
    if (memoryFillTried.current) return
    if (selfRef.current.future.memories?.length) return
    const key = resolveEffectiveApiKey()
    if (!key || isBackgroundApiPaused()) return
    memoryFillTried.current = true
    void generateFutureMemories(selfRef.current, key, loadModel() ?? undefined).then((list) => {
      if (!list.length) return
      persistSelf({
        ...selfRef.current,
        future: { ...selfRef.current.future, memories: list },
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  // 대화에서 자동축적: 말투(즉시) + 가치관·상황 인사이트(조심스럽게, 반복 시 신뢰↑)
  const learnFromMessage = (text: string, lastSelfReply: string) => {
    if (text.trim().length < 3) return
    const sample: StyleSample = {
      register: detectRegister(text),
      text: text.trim(),
      source: 'chat',
      at: Date.now(),
    }
    // 저장·부모 알림을 setSelf 업데이터 안에서 하면 React가 렌더 중에 실행해
    // 경고를 내고(StrictMode에선 두 번 저장된다) — 밖에서 계산하고 persistSelf로 한 번에.
    const samples = [...selfRef.current.styleSamples, sample].slice(-MAX_SAMPLES)

    // 미래의 나가 방금 꺼낸 기억을 user가 아니라고 하면 그 줄을 버린다.
    // 알림은 띄우지 않는다 — "기억을 삭제했습니다"가 뜨면 몰입이 깨진다.
    // 다시 안 꺼내는 게 유일한 표시다. (판별 기준은 lib/futureMemory.ts)
    const memories = selfRef.current.future.memories ?? []
    const denied = findDeniedMemory(memories, text, lastSelfReply)
    const future =
      denied === null
        ? selfRef.current.future
        : { ...selfRef.current.future, memories: memories.filter((_, i) => i !== denied) }

    persistSelf({
      ...selfRef.current,
      future,
      styleSamples: samples,
      styleRules: extractStyleRules(samples),
      insights: accumulateInsights(selfRef.current.insights ?? [], text),
    })
  }

  const appendSelfReply = async (focusMessageId: string, reply: string) => {
    const selfMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'self',
      content: stripApiTurnTimestampFromContent(reply.trim()),
      timestamp: Date.now(),
    }
    const segments = splitMessageParagraphs(reply)

    if (segments.length > 1) {
      setMessages((m) => insertReplyAfterUser(m, focusMessageId, selfMsg))
      setTyping(false)
      setRevealProgress({ msgId: selfMsg.id, shown: 1 })
      for (let i = 2; i <= segments.length; i++) {
        await new Promise((r) => setTimeout(r, 380 + Math.random() * 420))
        setRevealProgress({ msgId: selfMsg.id, shown: i })
      }
      setRevealProgress(null)
    } else {
      setMessages((m) => insertReplyAfterUser(m, focusMessageId, selfMsg))
      setTyping(false)
    }

    return selfMsg
  }

  const requestReply = async (workingMessages: ChatMessage[], focusMessageId?: string) => {
    const plan = buildReplyPlan(workingMessages, focusMessageId)
    if (!plan) return { ok: false as const, reason: 'no_plan' as const }

    const key = resolveEffectiveApiKey()
    const mdl = getActiveModel(loadModel())
    const profileForAI = self

    if (!key) {
      setTyping(true)
      await appendSelfReply(
        plan.focusMessageId,
        '(⚙️ AI 연결 설정이 없어서 답할 수 없어. 잠시 후 다시 시도해줘.)',
      )
      return { ok: false as const, reason: 'no_key' as const, plan }
    }

    setTyping(true)
    let reply: string
    let chatOk = false
    try {
      const history = workingMessages.map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
        timestamp: m.timestamp,
      }))
      const res = await fetchAIResponse(profileForAI, history, key, mdl, {
        contextMessages: plan.contextMessages,
        focusContent: plan.focusContent,
        focusTimestamp: plan.focusTimestamp,
        focusInstruction: plan.focusInstruction,
      })
      reply = res.text
      chatOk = true
    } catch (e) {
      if (e instanceof GeminiApiError && e.code === 'HTTP' && e.httpStatus === 503) {
        last503At.current = Date.now()
      }
      reply = geminiErrorUserMessage(e)
    }

    const selfMsg = await appendSelfReply(plan.focusMessageId, reply)

    if (chatOk) {
      if (focusMessageId == null) {
        msgSinceAnalyze.current += 1
      }
      if (msgSinceAnalyze.current >= AI_ANALYZE_EVERY) {
        msgSinceAnalyze.current = 0
        void runAIAnalysis(workingMessages.concat(selfMsg))
      }

      const history = insertReplyAfterUser(workingMessages, plan.focusMessageId, selfMsg).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
        timestamp: m.timestamp,
      }))
      scheduleDeferredSummary(self, history, key, mdl)
    }

    return { ok: chatOk, selfMsg, plan }
  }

  const hideRetryBanner = () => {
    setRetryBannerMsgId(null)
  }

  const showRetryBannerForFailure = (messageId: string) => {
    setRetryBannerMsgId(messageId)
  }

  const getFailedMessageId = (
    result: Awaited<ReturnType<typeof requestReply>> | undefined,
    fallbackId: string,
  ): string | null => {
    if (!result || result.ok) return null
    if ('reason' in result && result.reason === 'no_plan') return null
    if ('plan' in result && result.plan) return result.plan.focusMessageId
    return fallbackId
  }

  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null)
  const flashToast = (text: string, warn = false) => {
    setToast({ text, warn })
    setTimeout(() => setToast(null), warn ? 2600 : 1600)
  }

  const currentSendPlan = () =>
    planSend(Date.now(), lastSendAt.current, last503At.current, SEND_COOLDOWN_MS, POST_503_COOLDOWN_MS)

  /** 'wait'면 그만큼 입력 중 표시를 띄운 채 기다린다. typing이 send를 막아 큐는 항상 1개 */
  const awaitSendSlot = async (plan: SendPlan) => {
    if (plan.kind !== 'wait') return
    setTyping(true)
    await new Promise((r) => setTimeout(r, plan.ms))
  }

  const send = async () => {
    const text = input.trim()
    if (!text || typing || !chatReady) return

    const plan = currentSendPlan()
    if (plan.kind === 'blocked') {
      // 말풍선을 만들지 않는다 — 입력창에 글이 그대로 남아 그냥 다시 보내면 된다
      flashToast(`Google 서버가 막혔어 — ${plan.waitSec}초 뒤에 다시 보내줘`, true)
      return
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() }
    const workingMessages = [...messages, userMsg]
    setMessages(workingMessages)
    setInput('')
    hideRetryBanner()
    // 정정은 **방금 꺼낸 기억**에 대해서만 일어난다 — 직전 답을 같이 넘긴다
    const lastSelfReply = [...messages].reverse().find((m) => m.role === 'self')?.content ?? ''
    learnFromMessage(text, lastSelfReply)

    await awaitSendSlot(plan)
    lastSendAt.current = Date.now()

    const result = await requestReply(workingMessages)
    const failedId = getFailedMessageId(result, userMsg.id)
    if (failedId) showRetryBannerForFailure(failedId)
  }

  const retryReplyForMessage = async (userMessageId: string) => {
    if (typing || !chatReady) return

    const plan = currentSendPlan()
    if (plan.kind === 'blocked') {
      flashToast(`Google 서버가 막혔어 — ${plan.waitSec}초 뒤에 다시 시도해줘`, true)
      return
    }

    hideRetryBanner()
    await awaitSendSlot(plan)
    lastSendAt.current = Date.now()

    const result = await requestReply(messages, userMessageId)
    const failedId = getFailedMessageId(result, userMessageId)
    if (failedId) showRetryBannerForFailure(failedId)
  }

  const handleResetPromptBulk = () => {
    if (
      !window.confirm(
        '저장된 대화 요약을 지울까요?\n\n채팅 메시지는 그대로 두고, API에 실리는 맥락만 가벼워져요. (503 완화)',
      )
    ) {
      return
    }
    persistSelf(resetProfilePromptBulk(self))
  }

  /** 제안된 일정을 실제 계획표(홈)에 넣는다 */
  const confirmPendingTodo = () => {
    if (!pendingTodo) return
    const owner = getGoalAppOwnerId()
    addMiscTodo(
      owner,
      loadMiscTodos(owner),
      'daily',
      new Date(`${pendingTodo.date}T12:00:00`),
      pendingTodo.title,
    )
    // 홈 탭이 이미 떠 있어도 새로 읽도록 알림
    window.dispatchEvent(new Event(GOAL_DATA_SYNC_EVENT))
    setPendingTodo(null)
    flashToast('계획표에 추가됨 📅')
  }

  const todayKey = dateKeyOf(new Date())
  const apiHeavyProfile = shouldUseLitePrompt(self, messages.length)
  const retryBannerMessage =
    retryBannerMsgId != null
      ? messages.find((m) => m.id === retryBannerMsgId && m.role === 'user') ?? null
      : null
  const showRetryBanner = retryBannerMessage != null && !typing

  const dismissRetryBanner = () => {
    hideRetryBanner()
  }

  const suggestions = [
    '요즘 좀 지치는데 어떡하지',
    '이 선택 맞는 걸까?',
    '그냥 오늘 있었던 일 얘기할래',
  ]

  const insightsAll = self.insights ?? []
  const surfacedInsights = [
    ...insightsAll.filter((i) => i.kind === 'state').sort((a, b) => b.lastAt - a.lastAt).slice(0, 2),
    ...insightsAll
      .filter((i) => i.kind !== 'state' && (i.source === 'ai' || i.count >= 2))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
  ]

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-void">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-surface shrink-0 min-h-[52px]">
        {selectMode ? (
          <>
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-[15px] text-ink px-1 py-2 -ml-1 hover:bg-ink/5 rounded-lg transition-colors"
            >
              취소
            </button>
            <span className="text-[15px] font-medium text-ink">
              {selectedIds.size > 0 ? `${selectedIds.size}개 선택` : '메시지 선택'}
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={messages.length === 0}
              className="text-[13px] text-accent px-1 py-2 -mr-1 hover:bg-accent/5 rounded-lg transition-colors disabled:opacity-40"
            >
              {selectedIds.size === messages.length && messages.length > 0 ? '전체 해제' : '전체 선택'}
            </button>
          </>
        ) : (
          <>
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2.5 text-left rounded-lg -ml-0.5 pl-0.5 pr-2 py-0.5 hover:bg-ink/[0.04] transition-colors"
        >
          <div className="w-8 h-8 rounded-full chat-avatar flex items-center justify-center text-xs font-medium">
            {self.name[0] ?? '나'}
          </div>
          <div>
            <h1 className="text-[15px] font-normal leading-tight text-ink">5년 뒤 {self.name}</h1>
            <p className="text-[11px] text-muted">미래의 나</p>
          </div>
        </button>
        <div className="flex gap-1 items-center">
          <button
            type="button"
            onClick={onOpenPlanner}
            className="inline-flex items-center justify-center text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5"
            title="홈"
            aria-label="홈"
          >
            <HomeNavIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!devMode && registerDeveloperModeUnlockTap()) setDevMode(true)
              setShowSettings(!showSettings)
            }}
            className="relative inline-flex items-center justify-center text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5"
            title={
              apiStatus === 'ok'
                ? 'AI 정상 연결됨'
                : apiStatus === 'bad_key'
                ? '키 오류'
                : apiStatus === 'rate_limit' || apiStatus === 'error'
                ? '연결 주의'
                : '설정'
            }
            aria-label="설정"
          >
            <SettingsIcon />
            {apiStatus !== 'idle' && apiStatus !== 'testing' && (
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full border border-surface ${
                  apiStatus === 'ok'
                    ? 'bg-status-ok'
                    : apiStatus === 'bad_key'
                    ? 'bg-status-error'
                    : 'bg-status-warn'
                }`}
              />
            )}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5 text-xs whitespace-nowrap"
          >
            ← 목록
          </button>
        </div>
          </>
        )}
      </header>

      {showProfile && (
        <ProfileSheet
          profile={self}
          onClose={() => setShowProfile(false)}
          onDelete={handleDeleteProfile}
          onUpdate={(next) => persistSelf(next)}
        />
      )}

      {showSettings && !selectMode && (
        <div className="px-5 py-4 bg-surface-2 border-b border-border animate-fade-up space-y-4">
          {devMode ? (
            <ChatApiSettingsSection
              onChanged={() => {
                setApiStatus(readInitialApiStatus())
              }}
            />
          ) : null}
          <div>
            <p className="text-xs text-muted mb-2">대화에서 알게 된 것 (잠정)</p>
            {surfacedInsights.length ? (
              <div className="space-y-1">
                {surfacedInsights.map((i) => (
                  <div key={i.id} className="text-xs text-ink/80 flex items-start gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-ink border border-accent/20 whitespace-nowrap mt-0.5">
                      {INSIGHT_LABELS[i.kind]}
                    </span>
                    <span className="leading-relaxed">{i.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted">
                아직 없음 · 대화가 쌓이면 조심스럽게 반영돼요{insightsAll.length ? ` (관찰 ${insightsAll.length}개 모으는 중)` : ''}
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-muted mb-2">데이터 보관</p>
            <p className="text-[11px] text-muted/70 mb-2">
              대화 {messages.length}개 · IndexedDB 저장
              {self.conversationSummary
                ? ` · 요약 ${self.summarizedMessageCount ?? 0}개까지 압축`
                : messages.length >= 36
                ? ' · 곧 대화 요약 시작'
                : ''}
              {apiHeavyProfile ? ' · API 경량 모드' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {self.conversationSummary ? (
                <Button size="sm" variant="secondary" onClick={handleResetPromptBulk}>
                  대화 요약 초기화
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => downloadBackup(self, messages)}>
                내보내기 (.json)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}>
                가져오기
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void handleImportFile(f)
                }}
              />
            </div>
            {importStatus === 'ok' && (
              <p className="text-[11px] text-status-ok mt-1.5">✓ 백업을 가져왔어요</p>
            )}
            {importStatus === 'fail' && (
              <p className="text-[11px] text-status-error mt-1.5">✕ 파일 형식이 맞지 않아요</p>
            )}
            <p className="text-[11px] text-muted/50 mt-1.5">
              다른 기기·브라우저로 옮기거나, 혹시 모를 분실 대비용이에요.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {!chatReady ? (
          <div className="flex justify-center py-12 text-sm text-muted">대화 불러오는 중…</div>
        ) : (
          <>
        {messages.length > 0 && (
          <ChatMessageList
            messages={messages}
            selfName={self.name}
            revealProgress={revealProgress}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEnterSelectMode={enterSelectMode}
          />
        )}
        {typing && (
          <div className="flex items-end gap-1.5">
            <div className="w-7 h-7 rounded-full chat-avatar flex items-center justify-center text-[11px] font-medium shrink-0">
              {self.name[0] ?? '나'}
            </div>
            <div className="chat-bubble-them px-3.5 py-3 flex gap-1">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
          </>
        )}
      </div>

      {chatReady && messages.length === 0 && !selectMode && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-[13px] px-3 py-2 rounded-full bg-bubble-me text-ink/90 hover:brightness-[1.03] whitespace-nowrap flex-shrink-0 transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {selectMode ? (
        <div className="px-4 py-3 border-t border-border/60 bg-surface shrink-0 flex gap-2">
          <button
            type="button"
            onClick={sendSelectedToPlan}
            disabled={selectedIds.size !== 1}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed bg-surface-2 text-ink hover:bg-accent/10 border border-border/50"
          >
            계획표에 넣기
          </button>
          <button
            type="button"
            onClick={deleteSelectedMessages}
            disabled={selectedIds.size === 0}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed bg-surface-2 text-status-error hover:bg-status-error/10 border border-border/50"
          >
            삭제
          </button>
        </div>
      ) : (
      <div className="border-t border-border/60 bg-surface shrink-0">
        {showRetryBanner && retryBannerMessage ? (
          <div className="px-3 pt-2.5 pb-1.5 border-b border-border/40 bg-status-warn/5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void retryReplyForMessage(retryBannerMessage.id)}
              className="flex-1 min-w-0 flex items-center gap-1.5 text-[12px] px-2.5 py-2 rounded-xl bg-surface border border-status-warn/30 text-ink/90 hover:bg-status-warn/10 transition-colors text-left"
              title={retryBannerMessage.content}
            >
              <span className="shrink-0 text-status-warn">↻</span>
              <span className="truncate">{retryBannerMessage.content}</span>
            </button>
            <button
              type="button"
              onClick={dismissRetryBanner}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
              aria-label="답 못 받은 말 배너 닫기"
            >
              ✕
            </button>
          </div>
        ) : null}
        {pendingTodo ? (
          <div className="px-3 pt-2.5 pb-2 border-b border-border/40 bg-accent/5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] text-muted">계획표에 넣을 내용 (고쳐도 돼)</p>
              <button
                type="button"
                onClick={() => setPendingTodo(null)}
                className="w-6 h-6 -mr-1 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
                aria-label="계획표에 넣기 취소"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={pendingTodo.title}
              onChange={(e) => setPendingTodo({ ...pendingTodo, title: e.target.value })}
              className="w-full px-2.5 py-2 rounded-xl bg-surface border border-accent/30 text-[13px] text-ink focus:outline-none focus:border-accent/60"
              aria-label="할 일 제목"
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex gap-1 flex-1 min-w-0">
                {TODO_DATE_CHIPS.map((chip) => {
                  const key = shiftDateKey(todayKey, chip.offset)
                  const active = pendingTodo.date === key
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setPendingTodo({ ...pendingTodo, date: key })}
                      className={`px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                        active
                          ? 'bg-accent text-ink font-medium'
                          : 'bg-surface border border-border/50 text-ink/80 hover:border-accent/40'
                      }`}
                    >
                      {chip.label}
                    </button>
                  )
                })}
                <input
                  type="date"
                  value={pendingTodo.date}
                  onChange={(e) => e.target.value && setPendingTodo({ ...pendingTodo, date: e.target.value })}
                  className="min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-surface border border-border/50 text-[12px] text-ink/80 focus:outline-none focus:border-accent/40"
                  aria-label="날짜 고르기"
                />
              </div>
              <button
                type="button"
                onClick={confirmPendingTodo}
                disabled={!pendingTodo.title.trim()}
                className="shrink-0 px-3.5 py-1.5 rounded-lg bg-accent text-ink text-[12px] font-medium disabled:opacity-40"
              >
                추가
              </button>
            </div>
            <p className="text-[11px] text-muted mt-1">{formatTodoDate(pendingTodo.date)}에 들어가요</p>
          </div>
        ) : null}
      {toast && (
        <div className="px-3 pt-2 -mb-0.5">
          <span className={`text-[11px] ${toast.warn ? 'text-status-warn' : 'text-status-ok'}`}>
            {toast.text}
          </span>
        </div>
      )}
      <div className="chat-composer-bar px-3 pt-2.5">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="나에게 말 걸어봐..."
            className="chat-composer-input flex-1 px-3.5 py-2.5 rounded-2xl bg-surface text-ink placeholder:text-muted/60 text-[15px] resize-none leading-[1.45] overflow-y-auto focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || typing || !chatReady}
            className="chat-composer-send shrink-0 px-4 h-[42px] rounded-2xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
      </div>
      </div>
      )}
    </div>
  )
}

function HeaderIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function HomeNavIcon() {
  return (
    <HeaderIcon>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
    </HeaderIcon>
  )
}

function SettingsIcon() {
  return (
    <HeaderIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </HeaderIcon>
  )
}
