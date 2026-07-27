import type { ClockAlarmTrigger } from './clockAlarmEngine'
import { loadDismissPhrase } from './alarmDismissPhrase'
import { startRingingAlarm } from './alarmRingingStore'
import { startAlarmSoundLoop } from './alarmSound'

export type AlarmDeepLink = ClockAlarmTrigger

export function buildAlarmDeepLinkUrl(trigger: ClockAlarmTrigger): string {
  const params = new URLSearchParams({
    alarm: '1',
    alarmId: trigger.alarmId,
    dateKey: trigger.dateKey,
    time: trigger.time,
    label: trigger.label || '알람',
  })
  const base = typeof window !== 'undefined' ? window.location.pathname || '/index.html' : '/index.html'
  return `${base}?${params.toString()}`
}

export function parseAlarmDeepLink(search = typeof window !== 'undefined' ? window.location.search : ''): AlarmDeepLink | null {
  const params = new URLSearchParams(search)
  if (params.get('alarm') !== '1') return null
  const alarmId = params.get('alarmId')?.trim()
  const dateKey = params.get('dateKey')?.trim()
  const time = params.get('time')?.trim()
  if (!alarmId || !dateKey || !time) return null
  return {
    alarmId,
    dateKey,
    time,
    label: params.get('label')?.trim() || '알람',
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
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next || url.pathname)
}

/** 알림 탭·푸시로 열렸을 때 따라치기 화면을 띄운다 */
export function openAlarmDismissFromDeepLink(search?: string): boolean {
  const trigger = parseAlarmDeepLink(search)
  if (!trigger) return false
  const record = loadDismissPhrase(trigger.alarmId, trigger.dateKey)
  if (!record?.phrase) return false
  startRingingAlarm(trigger, record.phrase)
  startAlarmSoundLoop()
  clearAlarmDeepLinkFromUrl()
  return true
}
