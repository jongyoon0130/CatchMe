// ---------------------------------------------------------------------------
// 온보딩 — 4페이지.
//
// 예전엔 질문 하나에 화면 하나(총 39개)였다. 대화처럼 흐르긴 했지만 첫 대화에
// 닿으려면 39번을 넘겨야 했고, 이름과 나이를 따로 묻느라 두 화면을 썼다.
// 유저는 내용보다 **넘기는 동작**을 더 많이 겪었다.
//
// 지금은 주제별 4장이고, 한 장의 질문은 **한 번에 다 보인다** — 끝이 보이는 게
// 이 화면의 목적이다. 대화 말풍선은 없앴지만 대화체 안내 문구는 각 질문 위에 남겼다.
//
// 페이지 구성은 onboardingConfig.ts의 ONBOARDING_PAGES.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react'
import type { AdviceTone, LifeDomain, SelfProfile } from '../../types/self'
import { emptyProfile, LIFE_DOMAIN_LABELS, ADVICE_TONE_LABELS } from '../../types/self'
import { collectStyleSamples, extractStyleRules } from '../../lib/selfEngine'
import {
  saveOnboardingProgress,
  loadOnboardingProgress,
  clearOnboardingProgress,
  ONBOARDING_PROGRESS_VERSION,
  loadModel,
  type OnboardingProgressHead,
} from '../../lib/storage'
import { resolveEffectiveApiKey } from '../../lib/geminiApiKey'
import { generateFutureMemories } from '../../lib/futureMemory'
import { APP_TAGLINE } from '../../lib/brand'
import { splitBold } from '../../lib/chatDisplay'
import { CatchMeLogo } from '../brand/CatchMeLogo'
import { Button } from '../ui'
import {
  ADVICE_PRESETS,
  LIFE_DOMAIN_ORDER,
  ONBOARDING_PAGES,
  onboardingProgress,
  SPEECH_TONE_OPTIONS,
  WEEKLY_ACTION_OPTIONS,
  type FutureField,
  type OnboardingStep,
  type ProfileField,
} from '../../lib/onboardingConfig'

const ONBOARDING_VERSION = ONBOARDING_PROGRESS_VERSION

/** App의 "이어서 만들기?" 확인과 같은 모양을 읽는다 — OnboardingProgressHead 주석 참고 */
interface SavedProgress extends OnboardingProgressHead {
  pageIdx: number
  draft: SelfProfile
}

interface Props {
  onComplete: (profile: SelfProfile) => void
  onExitToList: () => void
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 홀수 조각만 굵게 — splitBold 참고. 이게 없으면 안내 문구의 `**`가 글자로 보인다 */
function renderBold(text: string) {
  return splitBold(text).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))
}

export function ChatOnboarding({ onComplete, onExitToList }: Props) {
  const restored = useRef<SavedProgress | null>(
    (() => {
      const s = loadOnboardingProgress<SavedProgress>()
      return s && s.version === ONBOARDING_VERSION && s.pageIdx > 0 ? s : null
    })(),
  )
  const [pageIdx, setPageIdx] = useState(() => restored.current?.pageIdx ?? 0)
  const [draft, setDraft] = useState<SelfProfile>(() => restored.current?.draft ?? emptyProfile())
  /** 마지막 장을 넘긴 뒤의 기억 화면. memories가 null이면 아직 만드는 중. */
  const [reveal, setReveal] = useState<{ profile: SelfProfile; memories: string[] | null } | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const page = ONBOARDING_PAGES[pageIdx]!
  const isLast = pageIdx === ONBOARDING_PAGES.length - 1
  // 이름만 필수다. 나머지는 전부 건너뛸 수 있다 —
  // 미래의 나를 만드는 건 솔직한 몇 문장이지 모든 빈칸을 채우는 게 아니다.
  const canAdvance = draft.name.trim().length > 0

  useEffect(() => {
    saveOnboardingProgress({ version: ONBOARDING_VERSION, pageIdx, draft })
  }, [pageIdx, draft])

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pageIdx])

  const patch = (fn: (d: SelfProfile) => void) =>
    setDraft((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })

  const exitToList = () => {
    if (draft.name.trim() || pageIdx > 0) {
      const ok = window.confirm(
        '목록으로 나갈까요?\n진행 중인 내용은 이 기기에 저장돼 있어요. (+ 만들기에서 이어서 할 수 있어요)',
      )
      if (!ok) return
    }
    onExitToList()
  }

  const finish = () => {
    const p = clone(draft)
    // 요즘 하루하루를 건너뛰었으면, 1페이지에서 고른 관심 영역으로라도 채운다.
    // (예전엔 관심 영역을 고르는 순간 넣었는데, 그러면 2페이지 입력칸이 미리 채워져 보인다)
    if (!p.lifeContext?.trim() && p.concernDomains?.length) {
      p.lifeContext = p.concernDomains.map((d) => LIFE_DOMAIN_LABELS[d]).join(', ')
    }
    if (p.future.adviceLine?.trim()) p.comfortTarget = p.future.adviceLine
    p.styleSamples = collectStyleSamples(p)
    p.styleRules = extractStyleRules(p.styleSamples)
    p.completedAt = new Date().toISOString()
    if (!p.id) p.id = crypto.randomUUID()
    clearOnboardingProgress()

    // 완주 보상 — 방금 쓴 답으로 "미래의 나의 기억"을 한 번 만들어 보여준다.
    // 기억은 대화에 필수가 아니다. 그래서 **막지 않는다**:
    //   키가 없으면(= 만들 수 없으면) 화면을 세우지 않고 바로 대화로 넘긴다.
    //   만들다 실패해도 마찬가지다. 여기서 벽을 세우면 다 채워놓고 못 들어간다.
    const key = resolveEffectiveApiKey()
    if (!key) {
      onComplete(p)
      return
    }
    setReveal({ profile: p, memories: null })
    void generateFutureMemories(p, key, loadModel() ?? undefined).then((list) => {
      if (!list.length) {
        onComplete(p)
        return
      }
      p.future.memories = list
      setReveal({ profile: p, memories: list })
    })
  }

  const { label: progressLabel, percent: progress } = onboardingProgress(pageIdx)

  if (reveal) {
    return (
      <MemoryReveal
        memories={reveal.memories}
        onStart={() => onComplete(reveal.profile)}
      />
    )
  }

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto">
      <div className="px-5 pt-5 pb-3 border-b border-border/40 bg-surface/80">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 shrink-0">
              <CatchMeLogo size={40} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-medium text-ink">미래의 나 만들기</h1>
              <p className="text-[11px] text-muted mt-0.5 truncate">{APP_TAGLINE}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={exitToList}
            className="text-xs text-muted hover:text-ink whitespace-nowrap px-2 py-1 rounded-lg hover:bg-ink/5 transition-colors shrink-0"
          >
            ← 목록
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] text-muted">{progressLabel}</span>
              <span className="text-xs text-muted shrink-0">{progress}%</span>
            </div>
            <div className="h-[3px] bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-700 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
            disabled={pageIdx === 0}
            className="text-xs text-muted hover:text-accent whitespace-nowrap px-2 py-1 rounded-lg hover:bg-ink/5 transition-colors disabled:opacity-30 disabled:hover:text-muted disabled:hover:bg-transparent disabled:cursor-not-allowed shrink-0"
          >
            이전 장
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div ref={topRef} />
        <h2 className="text-lg font-semibold text-ink">{page.title}</h2>
        <p className="text-[13px] text-muted mt-1 mb-5">{page.lead}</p>

        <div className="space-y-7">
          {page.steps.map((step, i) => (
            <Question key={`${pageIdx}-${i}`} step={step} name={draft.name} >
              <StepField step={step} draft={draft} patch={patch} />
            </Question>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-surface/80 backdrop-blur-md p-4">
        <Button className="w-full" onClick={() => (isLast ? finish() : setPageIdx((i) => i + 1))} disabled={!canAdvance}>
          {!canAdvance ? '이름부터 알려줘' : isLast ? '미래의 나 만나기' : '다음'}
        </Button>
      </div>
    </div>
  )
}

/**
 * 완주 보상 — 방금 쓴 답으로 만든 "미래의 나의 기억"을 보여준다.
 *
 * **고르게 하지 않는다.** 체크박스로 맞는 기억을 고르게 하는 안은 접었다(지웅님:
 * "유저가 그걸 하는 게 안 귀찮고 흥미로울까?"). 틀린 기억은 나중에 대화 중에
 * "그런 적 없는데ㅋㅋ" 하면 지우는 쪽으로 간다. 여기선 그냥 보여주고 시작한다.
 */
function MemoryReveal({ memories, onStart }: { memories: string[] | null; onStart: () => void }) {
  const loading = memories === null
  return (
    <div className="h-full flex flex-col max-w-lg mx-auto">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="flex justify-center mb-5">
          <CatchMeLogo size={56} />
        </div>
        <h2 className="text-lg font-semibold text-ink text-center">미래의 나의 기억</h2>
        <p className="text-[13px] text-muted text-center mt-1.5 mb-7 leading-relaxed">
          네가 쓴 답으로 만든, 내가 지나온 장면들이야.
          <br />
          앞으로 대화할 때 여기서 꺼내 쓸게.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-1.5 py-10">
            <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
            <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
            <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {memories.map((m, i) => (
              <li
                key={i}
                className="px-4 py-3 rounded-2xl bg-surface-2 border border-border text-[14px] leading-relaxed text-ink/85"
              >
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border bg-surface/80 backdrop-blur-md p-4">
        <Button className="w-full" onClick={onStart} disabled={loading}>
          {loading ? '기억을 꺼내는 중…' : '미래의 나 만나기'}
        </Button>
      </div>
    </div>
  )
}

/** 안내 문구(대화체) + 입력 하나. 마지막 줄이 질문이고 앞줄들은 곁말이다. */
function Question({
  step,
  name,
  children,
}: {
  step: OnboardingStep
  name: string
  children: React.ReactNode
}) {
  const lines = step.lines.map((l) => l.replace('{name}', name || '너'))
  const lead = lines.slice(0, -1)
  const ask = lines[lines.length - 1] ?? ''
  return (
    <div>
      {lead.map((l, i) => (
        <p key={i} className="text-[12px] text-muted leading-relaxed mb-0.5">
          {renderBold(l)}
        </p>
      ))}
      <p className="text-[15px] text-ink leading-snug mb-2.5">{renderBold(ask)}</p>
      {children}
    </div>
  )
}

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-ink placeholder:text-muted/60 text-sm'

function StepField({
  step,
  draft,
  patch,
}: {
  step: OnboardingStep
  draft: SelfProfile
  patch: (fn: (d: SelfProfile) => void) => void
}) {
  switch (step.kind) {
    case 'name':
      return (
        <input
          value={draft.name}
          maxLength={16}
          onChange={(e) => patch((d) => (d.name = e.target.value))}
          placeholder="예: 민수 / 지은"
          className={inputClass}
        />
      )

    case 'age':
      return (
        <div>
          <p className="text-center text-2xl font-semibold text-glow mb-2">
            {draft.age}
            <span className="text-sm text-muted ml-1">살</span>
          </p>
          <input
            type="range"
            min={14}
            max={70}
            value={draft.age}
            onChange={(e) => patch((d) => (d.age = Number(e.target.value)))}
            className="w-full accent-accent"
          />
        </div>
      )

    case 'profile-text':
      return (
        <LongText
          value={readProfile(draft, step.field)}
          onChange={(v) => patch((d) => setProfileField(d, step.field, v))}
          placeholder={step.placeholder}
          maxLength={step.maxLength}
          starters={step.starters}
          rows={step.maxLength > 250 ? 4 : 2}
        />
      )

    case 'future-text':
      return (
        <LongText
          value={draft.future[step.field] ?? ''}
          onChange={(v) => patch((d) => setFutureField(d, step.field, v))}
          placeholder={step.placeholder}
          maxLength={step.maxLength}
          starters={step.starters}
          rows={step.maxLength > 300 ? 5 : 3}
        />
      )

    case 'concerns':
      return (
        <DomainChips
          selected={draft.concernDomains ?? []}
          max={step.max}
          onToggle={(d) => patch((x) => (x.concernDomains = toggle(x.concernDomains ?? [], d, step.max)))}
        />
      )

    case 'thriving-domains':
      return (
        <DomainChips
          selected={draft.future.thrivingDomains ?? []}
          max={step.max}
          onToggle={(d) =>
            patch((x) => (x.future.thrivingDomains = toggle(x.future.thrivingDomains ?? [], d, step.max)))
          }
        />
      )

    case 'speech-tone':
      return (
        <div className="flex flex-wrap gap-2">
          {SPEECH_TONE_OPTIONS.map((o) => (
            <Chip
              key={o}
              label={o}
              active={draft.speechTone === o}
              onClick={() => patch((d) => (d.speechTone = d.speechTone === o ? '' : o))}
            />
          ))}
        </div>
      )

    case 'advice':
      return (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ADVICE_TONE_LABELS) as AdviceTone[]).map((t) => (
              <Chip
                key={t}
                label={ADVICE_TONE_LABELS[t]}
                active={draft.future.adviceTone === t}
                onClick={() => patch((d) => (d.future.adviceTone = t))}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted">예시를 누르면 편집할 수 있어:</p>
            {ADVICE_PRESETS[draft.future.adviceTone ?? 'comfort'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => patch((d) => (d.future.adviceLine = p))}
                className="block w-full text-left text-xs leading-relaxed px-3 py-2 rounded-xl border border-border/70 bg-surface-2/60 text-ink/75 hover:border-accent/50 hover:text-ink transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
          <LongText
            value={draft.future.adviceLine ?? ''}
            onChange={(v) => patch((d) => (d.future.adviceLine = v))}
            placeholder="미래의 네가 지금의 너한테 보내는 편지"
            maxLength={360}
            rows={4}
          />
        </div>
      )

    case 'weekly-action':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {WEEKLY_ACTION_OPTIONS.map((o) => {
              const value = o === '잘 모르겠어' ? '아직 정하지 않았어' : o
              return (
                <Chip
                  key={o}
                  label={o}
                  active={draft.future.weeklyAction === value}
                  onClick={() => patch((d) => (d.future.weeklyAction = value))}
                />
              )
            })}
          </div>
          <input
            value={draft.future.weeklyAction ?? ''}
            maxLength={80}
            onChange={(e) => patch((d) => (d.future.weeklyAction = e.target.value))}
            placeholder="직접 입력해도 돼"
            className={inputClass}
          />
        </div>
      )

    default:
      // 심화 코스 전용 단계들 — 4페이지 온보딩에는 실리지 않는다
      return null
  }
}

function LongText({
  value,
  onChange,
  placeholder,
  maxLength,
  rows,
  starters,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  maxLength: number
  rows: number
  starters?: string[]
}) {
  return (
    <div>
      {/* 막막함 해소 — 뼈대 문장을 골라 시작하고 내 얘기로 고치게 한다 (쓰기 전에만) */}
      {starters && starters.length > 0 && !value && (
        <div className="mb-2 space-y-1.5">
          <p className="text-[10px] text-muted">막막하면 골라서 시작하고, 네 얘기로 고쳐줘:</p>
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="block w-full text-left text-xs leading-relaxed px-3 py-2 rounded-xl border border-border/70 bg-surface-2/60 text-ink/75 hover:border-accent/50 hover:text-ink transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${inputClass} resize-none`}
      />
      <div className="text-right text-[10px] text-muted mt-1">
        {value.trim().length}/{maxLength}
      </div>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 rounded-full border text-sm transition-all ${
        active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 hover:border-accent/40'
      }`}
    >
      {label}
    </button>
  )
}

function DomainChips({
  selected,
  max,
  onToggle,
}: {
  selected: LifeDomain[]
  max: number
  onToggle: (d: LifeDomain) => void
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {LIFE_DOMAIN_ORDER.map((d) => (
          <Chip
            key={d}
            label={LIFE_DOMAIN_LABELS[d]}
            active={selected.includes(d)}
            onClick={() => onToggle(d)}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted mt-1.5">
        {selected.length}/{max}개 선택
      </p>
    </div>
  )
}

/** 이미 있으면 빼고, 없으면 넣는다. 상한을 넘으면 그대로 둔다. */
function toggle(list: LifeDomain[], d: LifeDomain, max: number): LifeDomain[] {
  if (list.includes(d)) return list.filter((x) => x !== d)
  if (list.length >= max) return list
  return [...list, d]
}

function readProfile(p: SelfProfile, field: ProfileField): string {
  return p[field] ?? ''
}

function setProfileField(draft: SelfProfile, field: ProfileField, value: string) {
  draft[field] = value
}

function setFutureField(draft: SelfProfile, field: FutureField, value: string) {
  draft.future[field] = value
}
