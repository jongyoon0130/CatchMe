import { dateKeyFrom, userAlarmActiveOnDate } from './clockAlarmEngine'
import {
  buildAlarmDismissContext,
  formatAlarmDismissContextForPrompt,
  type AlarmDismissContext,
} from './alarmDismissContext'
import {
  loadDismissPhrase,
  normalizeDismissPhrase,
  saveDismissPhrase,
  PINNED_DATE_KEY,
  type AlarmDismissPhrase,
} from './alarmDismissPhrase'
import { resolveEffectiveApiKey } from './geminiApiKey'
import { loadModel } from './storage'
import { DEFAULT_GEMINI_MODEL, geminiGenerateContent, resolveModel } from './selfEngine'
import { loadUserAlarms, type UserAlarm } from './userAlarms'

function extractGeminiText(data: Record<string, unknown>): string {
  const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  return candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

function clipLine(text: string, max = 32): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** API 키·목표 정보가 없을 때 — 저장된 데이터만으로 3~4줄 구성 */
export function buildFallbackDismissPhrase(ctx: AlarmDismissContext): string {
  const lines: string[] = []

  if (ctx.alarmResolve) {
    lines.push(clipLine(ctx.alarmResolve, 36))
  }

  if (ctx.futureIdentity) {
    lines.push(clipLine(`나는 ${ctx.futureIdentity.replace(/\.$/, '')}가 되기 위해 오늘도 한 걸음 낸다`, 40))
  }

  const primary = ctx.goals[0]
  if (primary?.title) {
    if (primary.whyTruth) {
      lines.push(clipLine(`${primary.title} — ${primary.whyTruth}`, 40))
    } else {
      lines.push(clipLine(`오늘도 ${primary.title}을(를) 향해 나아간다`, 36))
    }
  }

  if (ctx.futureAdvice) {
    lines.push(clipLine(ctx.futureAdvice, 40))
  } else if (primary?.successBoth) {
    lines.push(clipLine(primary.successBoth, 40))
  } else if (ctx.futureAchievement) {
    lines.push(clipLine(`미래의 나처럼, ${ctx.futureAchievement}`, 40))
  }

  if (lines.length < 3) {
    lines.push('오늘도 미래의 나를 선택한다')
  }

  return normalizeDismissPhrase(lines.join('\n'))
}

async function generateDismissPhraseFromGemini(
  ctx: AlarmDismissContext,
  apiKey: string,
  model: string,
): Promise<string | null> {
  const prompt = `너는 아침 알람 해제용 다짐 문장 작성자다.
사용자가 앱에 적어둔 목표·미래의 나 정보를 바탕으로, 아침에 따라 쳐야 하는 다짐 3~4줄을 작성하라.

## 사용자 정보
${formatAlarmDismissContextForPrompt(ctx)}

## 규칙
- 한국어, 1인칭("나는"), 아침에 읽고 따라 치기 좋은 다짐
- 정확히 3~4줄. 각 줄 10~32자 정도
- 위 정보에 나온 목표명·미래 정체성·이유·조언을 **구체적으로** 반영할 것
- 정보가 부족하면 희망적이지만 추상적이지 않게 (너무 뻔한 "화이팅"만 쓰지 말 것)
- 번호, 불릿, 따옴표, 이모지, JSON, 설명 문장 금지
- 출력은 다짐 줄만 — 줄바꿈으로 구분`

  const data = await geminiGenerateContent(
    apiKey,
    resolveModel(model),
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 220,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    'alarmDismissPhrase',
  )

  const raw = extractGeminiText(data)
  const phrase = normalizeDismissPhrase(raw)
  const lineCount = phrase.split('\n').filter(Boolean).length
  if (lineCount < 2 || phrase.replace(/\s/g, '').length < 12) return null
  return phrase
}

function alarmById(alarmId: string): UserAlarm | undefined {
  return loadUserAlarms().find((a) => a.id === alarmId)
}

/** 저장된 문장 → 없으면 목표·미래상 기반 폴백 (동기). 없을 때는 백그라운드 생성도 시도 */
export function resolveDismissPhraseSync(opts: {
  alarmId: string
  dateKey: string
  alarmLabel: string
}): string {
  const stored = loadDismissPhrase(opts.alarmId, opts.dateKey)
  if (stored?.phrase) return stored.phrase

  const alarm = alarmById(opts.alarmId)
  const ctx = buildAlarmDismissContext({
    alarmLabel: opts.alarmLabel,
    alarmResolve: alarm?.resolve,
  })
  void generateDismissPhraseWithAI({
    alarmId: opts.alarmId,
    dateKey: opts.dateKey,
    alarmLabel: opts.alarmLabel,
  })
  return buildFallbackDismissPhrase(ctx)
}

/** 목표·미래상 기반 따라치기 문장 생성 (Gemini → 실패 시 폴백) */
export async function generateDismissPhraseWithAI(opts: {
  alarmId: string
  dateKey: string
  alarmLabel: string
  force?: boolean
}): Promise<AlarmDismissPhrase> {
  const existing = loadDismissPhrase(opts.alarmId, opts.dateKey)
  if (existing && !opts.force) return existing

  const alarm = alarmById(opts.alarmId)
  const ctx = buildAlarmDismissContext({
    alarmLabel: opts.alarmLabel,
    alarmResolve: alarm?.resolve,
  })

  const apiKey = resolveEffectiveApiKey()
  const model = loadModel() ?? DEFAULT_GEMINI_MODEL

  let phrase: string | null = null
  let source: AlarmDismissPhrase['source'] = 'fallback'

  if (apiKey) {
    try {
      phrase = await generateDismissPhraseFromGemini(ctx, apiKey, model)
      if (phrase) source = 'ai'
    } catch {
      /* fallback below */
    }
  }

  if (!phrase) {
    phrase = buildFallbackDismissPhrase(ctx)
  }

  const record: AlarmDismissPhrase = {
    alarmId: opts.alarmId,
    // AI 버튼(force)으로 만든 문구는 알람에 고정 — 직접 쓴 문구를 대체하고 계속 유지된다.
    // 자동 생성(force 아님)은 날짜별 기본값으로만 저장돼 고정 문구를 건드리지 않는다.
    dateKey: opts.force ? PINNED_DATE_KEY : opts.dateKey,
    phrase,
    generatedAt: Date.now(),
    source,
  }
  saveDismissPhrase(record)
  return record
}

/** 오늘·내일 알람용 다짐 문장이 없으면 미리 만든다 */
export async function ensureDismissPhrasesForAlarms(alarms: UserAlarm[], now = new Date()): Promise<void> {
  for (let offset = 0; offset <= 1; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    for (const alarm of alarms) {
      if (!userAlarmActiveOnDate(alarm, day)) continue
      const dateKey = dateKeyFrom(day)
      if (loadDismissPhrase(alarm.id, dateKey)) continue
      await generateDismissPhraseWithAI({
        alarmId: alarm.id,
        dateKey,
        alarmLabel: alarm.label,
      })
    }
  }
}
