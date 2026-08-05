import { readGoalPlansLite } from './goalPlanBridge'
import { buildFutureSummaryLine } from './profilePhrases'
import { loadProfile } from './storage'
import type { GoalPlan } from '../types/goalPlan'
import type { SelfProfile } from '../types/self'

export interface AlarmDismissGoalSnippet {
  title: string
  successCriteria?: string
  whyTruth?: string
  successBoth?: string
  failurePattern?: string
}

export interface AlarmDismissContext {
  alarmLabel: string
  alarmResolve?: string
  futureIdentity: string
  futureAdvice: string
  futureTypicalDay: string
  futureAchievement: string
  futureThroughline: string
  currentRole: string
  goals: AlarmDismissGoalSnippet[]
  hasPersonalData: boolean
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function goalSnippet(plan: GoalPlan): AlarmDismissGoalSnippet {
  return {
    title: clip(plan.title, 48),
    successCriteria: clip(plan.intake?.successCriteria ?? '', 100) || undefined,
    whyTruth: clip(plan.motivation?.['why-truth'] ?? '', 100) || undefined,
    successBoth: clip(plan.motivation?.['success-both'] ?? '', 100) || undefined,
    failurePattern: clip(plan.motivation?.['failure-pattern'] ?? '', 100) || undefined,
  }
}

/** 알람 따라치기 AI·폴백용 — 앱에 저장된 목표·미래의 나 정보만 사용 */
export function buildAlarmDismissContext(opts: {
  alarmLabel: string
  alarmResolve?: string
  profile?: SelfProfile | null
}): AlarmDismissContext {
  const profile = opts.profile ?? loadProfile()
  const future = profile?.future
  const goals = readGoalPlansLite()
    .slice(0, 5)
    .map(goalSnippet)
    .filter((g) => g.title)

  const futureIdentity =
    buildFutureSummaryLine(future ?? {}) ||
    clip(future?.identityLine ?? '', 80) ||
    clip(future?.career ?? '', 80)

  const context: AlarmDismissContext = {
    alarmLabel: clip(opts.alarmLabel, 40) || '알람',
    alarmResolve: clip(opts.alarmResolve ?? '', 120) || undefined,
    futureIdentity,
    futureAdvice: clip(future?.adviceLine ?? '', 120),
    futureTypicalDay: clip(future?.typicalDay ?? '', 120),
    futureAchievement: clip(future?.achievement ?? '', 100),
    futureThroughline: clip(future?.throughline ?? '', 120),
    currentRole: clip(profile?.currentRole ?? profile?.lifeContext ?? '', 80),
    goals,
    hasPersonalData: Boolean(
      opts.alarmResolve?.trim() ||
        futureIdentity ||
        future?.adviceLine?.trim() ||
        future?.typicalDay?.trim() ||
        future?.achievement?.trim() ||
        future?.throughline?.trim() ||
        goals.length,
    ),
  }

  return context
}

/** Gemini 프롬프트용 텍스트 블록 */
export function formatAlarmDismissContextForPrompt(ctx: AlarmDismissContext): string {
  const lines: string[] = []

  if (ctx.futureIdentity) lines.push(`5년 뒤 정체성: ${ctx.futureIdentity}`)
  if (ctx.futureAdvice) lines.push(`미래의 나 조언: ${ctx.futureAdvice}`)
  if (ctx.futureTypicalDay) lines.push(`미래의 하루: ${ctx.futureTypicalDay}`)
  if (ctx.futureAchievement) lines.push(`자랑스러운 성취: ${ctx.futureAchievement}`)
  if (ctx.futureThroughline) lines.push(`지금→미래 이야기: ${ctx.futureThroughline}`)
  if (ctx.currentRole) lines.push(`현재 상황: ${ctx.currentRole}`)
  if (ctx.alarmResolve) lines.push(`이 알람에 적어둔 다짐: ${ctx.alarmResolve}`)

  for (const goal of ctx.goals) {
    const bits = [`목표 "${goal.title}"`]
    if (goal.whyTruth) bits.push(`이유: ${goal.whyTruth}`)
    if (goal.successBoth) bits.push(`이뤘을 때: ${goal.successBoth}`)
    if (goal.failurePattern) bits.push(`미루면: ${goal.failurePattern}`)
    if (goal.successCriteria) bits.push(`성공 기준: ${goal.successCriteria}`)
    lines.push(bits.join(' · '))
  }

  if (!lines.length) {
    lines.push('(사용자 목표·미래 정보 없음 — 일반적이지만 희망적인 아침 다짐으로 작성)')
  }

  return lines.join('\n')
}
