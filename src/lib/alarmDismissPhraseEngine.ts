import { dateKeyFrom, userAlarmActiveOnDate } from './clockAlarmEngine'
import { collectKnownFactCorpus } from './goalPlanBridge'
import { loadApiKey, loadChatAsync, loadModel, loadProfileById, loadProfileSummaries } from './storage'
import { resolveModel } from './selfEngine'
import {
  loadDismissPhrase,
  normalizeDismissPhrase,
  saveDismissPhrase,
  type AlarmDismissPhrase,
} from './alarmDismissPhrase'
import type { UserAlarm } from './userAlarms'

function cleanModelText(raw: string): string {
  return raw.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '')
}

function buildFallbackDismissPhrase(alarmLabel: string): string {
  const corpus = collectKnownFactCorpus().trim()
  const snippet = corpus
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 6)
    .join(' ')
  const goalHint = snippet ? `오늘 ${snippet}에 한 걸음 더 나아가겠다.` : '오늘도 작은 한 걸음을 내딛겠다.'
  const labelLine = alarmLabel && alarmLabel !== '알람'
    ? `${alarmLabel}의 시간, 나를 위해 쓰겠다.`
    : '이 아침, 나를 위해 시간을 쓰겠다.'
  return normalizeDismissPhrase(`${goalHint}\n${labelLine}\n말한 대로, 오늘도 나와의 약속을 지키겠다.`)
}

async function loadRecentChatSnippet(maxLines = 12): Promise<string> {
  const summaries = loadProfileSummaries()
  if (!summaries.length) return ''
  const profileId = summaries[0]!.id
  try {
    const messages = await loadChatAsync(profileId)
    return messages
      .slice(-maxLines)
      .map((m) => `${m.role === 'user' ? '나' : '또다른나'}: ${m.content.trim()}`)
      .join('\n')
  } catch {
    return ''
  }
}

async function loadProfileContext(): Promise<string> {
  const summaries = loadProfileSummaries()
  if (!summaries.length) return ''
  const profile = loadProfileById(summaries[0]!.id)
  if (!profile) return ''
  const parts = [
    profile.future?.identityLine,
    profile.currentRole,
    profile.lifeContext,
    profile.future?.adviceLine,
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  return parts.join('\n')
}

export async function generateDismissPhraseWithAI(opts: {
  alarmId: string
  dateKey: string
  alarmLabel: string
}): Promise<AlarmDismissPhrase> {
  const apiKey = loadApiKey()?.trim() ?? ''
  const model = resolveModel(loadModel())
  const facts = collectKnownFactCorpus().trim()
  const chat = await loadRecentChatSnippet()
  const profileCtx = await loadProfileContext()

  if (!apiKey) {
    const phrase = buildFallbackDismissPhrase(opts.alarmLabel)
    const record: AlarmDismissPhrase = {
      alarmId: opts.alarmId,
      dateKey: opts.dateKey,
      phrase,
      generatedAt: Date.now(),
      source: 'fallback',
    }
    saveDismissPhrase(record)
    return record
  }

  const prompt = `너는 사용자의 '미래의 나' AI다. ${opts.dateKey} 아침 알람을 끄려면 사용자가 **오타 없이 그대로** 따라 쳐야 하는 다짐 문장 3줄을 만든다.

## 맥락
알람 이름: ${opts.alarmLabel}
알고 있는 목표·할 일: ${facts || '없음'}
프로필: ${profileCtx || '없음'}
최근 대화:
${chat || '없음'}

## 규칙
- 정확히 3줄. 줄바꿈으로만 구분한다.
- 각 줄 12~28자, 1인칭 다짐("나는…", "…하겠다").
- 따옴표·이모지·영어·숫자·특수기호 없이 한국어 문장만.
- 대화·목표에서 **실제로 드러난** 내용을 반영하되, 없는 사실을 지어내지 말 것.
- JSON·제목·설명 없이 **3줄 텍스트만** 출력.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 220,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const raw = cleanModelText(
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    )
    const phrase = normalizeDismissPhrase(raw)
    if (phrase.split('\n').length < 2) throw new Error('too short')

    const record: AlarmDismissPhrase = {
      alarmId: opts.alarmId,
      dateKey: opts.dateKey,
      phrase,
      generatedAt: Date.now(),
      source: 'ai',
    }
    saveDismissPhrase(record)
    return record
  } catch {
    const phrase = buildFallbackDismissPhrase(opts.alarmLabel)
    const record: AlarmDismissPhrase = {
      alarmId: opts.alarmId,
      dateKey: opts.dateKey,
      phrase,
      generatedAt: Date.now(),
      source: 'fallback',
    }
    saveDismissPhrase(record)
    return record
  }
}

/** 오늘·내일 알람용 다짐 문장이 없으면 미리 만든다 (전날 밤 준비 포함) */
export async function ensureDismissPhrasesForAlarms(alarms: UserAlarm[], now = new Date()): Promise<void> {
  const targets: { date: Date; alarm: UserAlarm }[] = []
  for (let offset = 0; offset <= 1; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    for (const alarm of alarms) {
      if (!userAlarmActiveOnDate(alarm, day)) continue
      const dateKey = dateKeyFrom(day)
      if (loadDismissPhrase(alarm.id, dateKey)) continue
      targets.push({ date: day, alarm })
    }
  }
  for (const { date, alarm } of targets) {
    await generateDismissPhraseWithAI({
      alarmId: alarm.id,
      dateKey: dateKeyFrom(date),
      alarmLabel: alarm.label,
    })
  }
}
