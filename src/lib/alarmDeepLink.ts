import type { ClockAlarmTrigger } from './clockAlarmEngine'
import {
  loadDismissPhrase,
  saveDismissPhrase,
  normalizeDismissPhrase,
  type AlarmDismissPhrase,
} from './alarmDismissPhrase'
import { resolveDismissPhraseSync } from './alarmDismissPhraseEngine'
import { startRingingAlarm } from './alarmRingingStore'
import { startAlarmSoundLoop } from './alarmSound'

export type AlarmDeepLink = ClockAlarmTrigger & { phrase?: string }

export function buildAlarmDeepLinkUrl(trigger: ClockAlarmTrigger, phrase?: string): string {
  const resolved =
    phrase?.trim() ||
    loadDismissPhrase(trigger.alarmId, trigger.dateKey)?.phrase ||
    resolveDismissPhraseSync({
      alarmId: trigger.alarmId,
      dateKey: trigger.dateKey,
      alarmLabel: trigger.label,
    })

  const params = new URLSearchParams({
    alarm: '1',
    alarmId: trigger.alarmId,
    dateKey: trigger.dateKey,
    time: trigger.time,
    label: trigger.label || '알람',
    phrase: resolved,
  })
  const base = typeof window !== 'undefined' ? window.location.pathname || '/index.html' : '/index.html'
  return `${base}?${params.toString()}`
}

export function parseAlarmDeepLink(
  search = typeof window !== 'undefined' ? window.location.search : '',
): AlarmDeepLink | null {
  const params = new URLSearchParams(search)
  if (params.get('alarm') !== '1') return null
  const alarmId = params.get('alarmId')?.trim()
  const dateKey = params.get('dateKey')?.trim()
  const time = params.get('time')?.trim()
  if (!alarmId || !dateKey || !time) return null
  const phrase = params.get('phrase')?.trim()
  return {
    alarmId,
    dateKey,
    time,
    label: params.get('label')?.trim() || '알람',
    phrase: phrase ? normalizeDismissPhrase(phrase) : undefined,
  }
}

export function clearAlarmDeepLinkFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('alarm')) return
  url.searchParams.delete('alarm')
  url.searchParams.delete('alarmId')
  url.searchParams.delete('dateKey')
  url.searchParams.delete('time')
  url.searchParams.delete('label')
  url.searchParams.delete('phrase')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next || url.pathname)
}

async function fetchDismissPhraseFromCloud(
  alarmId: string,
  dateKey: string,
): Promise<AlarmDismissPhrase | null> {
  try {
    const { fetchRemoteAlarmData, isCloudSyncAvailable } = await import('./cloudSync')
    if (!isCloudSyncAvailable()) return null
    const { getActiveSyncUser } = await import('./cloudSync')
    const userId = getActiveSyncUser()
    if (!userId) return null
    const row = await fetchRemoteAlarmData(userId)
    if (!row?.dismiss_phrases || !Array.isArray(row.dismiss_phrases)) return null
    const hit = (row.dismiss_phrases as AlarmDismissPhrase[]).find(
      (p) => p.alarmId === alarmId && p.dateKey === dateKey && p.phrase?.trim(),
    )
    return hit ?? null
  } catch {
    return null
  }
}

/** 로컬 → URL → 클라우드 순으로 다짐 문장을 찾는다 */
export async function resolvePhraseForTrigger(
  trigger: ClockAlarmTrigger,
  phraseFromUrl?: string,
): Promise<string | null> {
  if (phraseFromUrl?.trim()) {
    const phrase = normalizeDismissPhrase(phraseFromUrl)
    saveDismissPhrase({
      alarmId: trigger.alarmId,
      dateKey: trigger.dateKey,
      phrase,
      generatedAt: Date.now(),
      source: 'fallback',
    })
    return phrase
  }

  const local = loadDismissPhrase(trigger.alarmId, trigger.dateKey)
  if (local?.phrase) return local.phrase

  const remote = await fetchDismissPhraseFromCloud(trigger.alarmId, trigger.dateKey)
  if (remote?.phrase) {
    saveDismissPhrase(remote)
    return remote.phrase
  }

  return resolveDismissPhraseSync({
    alarmId: trigger.alarmId,
    dateKey: trigger.dateKey,
    alarmLabel: trigger.label,
  })
}

/** 알림 탭·푸시로 열렸을 때 따라치기 화면을 띄운다 */
export async function openAlarmDismissFromDeepLink(search?: string): Promise<boolean> {
  const trigger = parseAlarmDeepLink(search)
  if (!trigger) return false

  const phrase = await resolvePhraseForTrigger(trigger, trigger.phrase)
  if (!phrase) return false

  startRingingAlarm(trigger, phrase)
  startAlarmSoundLoop()
  clearAlarmDeepLinkFromUrl()
  return true
}
