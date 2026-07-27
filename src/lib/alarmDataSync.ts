import type { AlarmDismissPhrase } from './alarmDismissPhrase'
import { applyDismissPhrases, loadAllDismissPhrases, phraseRecordKey } from './alarmDismissPhrase'
import {
  fetchRemoteAlarmData,
  isCloudSyncAvailable,
  pushAlarmDataToCloud,
  type RemoteAlarmDataRow,
} from './cloudSync'
import { loadAlarmSettings, type AlarmSettings } from './alarmStore'
import { loadUserAlarms, type UserAlarm } from './userAlarms'

const REVISION_KEY = 'futureme-alarm-data-revision'
export const ALARM_DATA_SYNC_EVENT = 'futureme-alarm-data-synced'

export type AlarmDataBundle = {
  alarms: UserAlarm[]
  dismissPhrases: AlarmDismissPhrase[]
  settings: AlarmSettings
  updatedAt: number
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

export function getAlarmDataRevision(): number {
  try {
    return Number(localStorage.getItem(REVISION_KEY) || 0)
  } catch {
    return 0
  }
}

export function markAlarmDataRevision(ts = Date.now()): number {
  try {
    localStorage.setItem(REVISION_KEY, String(ts))
  } catch {
    /* ignore */
  }
  return ts
}

export function loadLocalAlarmDataBundle(): AlarmDataBundle {
  return {
    alarms: loadUserAlarms(),
    dismissPhrases: loadAllDismissPhrases(),
    settings: loadAlarmSettings(),
    updatedAt: getAlarmDataRevision(),
  }
}

export function hasLocalAlarmData(): boolean {
  const bundle = loadLocalAlarmDataBundle()
  return bundle.alarms.length > 0 || bundle.dismissPhrases.length > 0
}

export function applyLocalAlarmDataBundle(bundle: AlarmDataBundle): void {
  localStorage.setItem('futureme-user-alarms', JSON.stringify(bundle.alarms))
  localStorage.setItem('futureme-alarm-settings', JSON.stringify(bundle.settings))
  applyDismissPhrases(bundle.dismissPhrases)
  markAlarmDataRevision(bundle.updatedAt)
  window.dispatchEvent(new CustomEvent('futureme-user-alarms-change'))
  window.dispatchEvent(new CustomEvent('futureme-alarm-settings-change'))
  window.dispatchEvent(new CustomEvent(ALARM_DATA_SYNC_EVENT))
}

function mergeAlarms(local: UserAlarm[], remote: UserAlarm[], preferLocal: boolean): UserAlarm[] {
  const byId = new Map<string, UserAlarm>()
  for (const alarm of remote) byId.set(alarm.id, alarm)
  for (const alarm of local) {
    const existing = byId.get(alarm.id)
    if (!existing || preferLocal || alarm.updatedAt >= existing.updatedAt) {
      byId.set(alarm.id, alarm)
    }
  }
  return [...byId.values()].sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt)
}

function mergeDismissPhrases(
  local: AlarmDismissPhrase[],
  remote: AlarmDismissPhrase[],
  preferLocal: boolean,
): AlarmDismissPhrase[] {
  const byKey = new Map<string, AlarmDismissPhrase>()
  for (const record of remote) byKey.set(phraseRecordKey(record.alarmId, record.dateKey), record)
  for (const record of local) {
    const key = phraseRecordKey(record.alarmId, record.dateKey)
    const existing = byKey.get(key)
    if (!existing || preferLocal || record.generatedAt >= existing.generatedAt) {
      byKey.set(key, record)
    }
  }
  return [...byKey.values()]
}

export function mergeAlarmDataBundles(local: AlarmDataBundle, remote: AlarmDataBundle): AlarmDataBundle {
  const preferLocal = local.updatedAt >= remote.updatedAt
  const updatedAt = Math.max(local.updatedAt, remote.updatedAt, Date.now())
  return {
    alarms: mergeAlarms(local.alarms, remote.alarms, preferLocal),
    dismissPhrases: mergeDismissPhrases(local.dismissPhrases, remote.dismissPhrases, preferLocal),
    settings: preferLocal ? local.settings : remote.settings,
    updatedAt,
  }
}

export function remoteRowToAlarmBundle(row: RemoteAlarmDataRow): AlarmDataBundle {
  return {
    alarms: Array.isArray(row.alarms) ? (row.alarms as UserAlarm[]) : [],
    dismissPhrases: Array.isArray(row.dismiss_phrases) ? (row.dismiss_phrases as AlarmDismissPhrase[]) : [],
    settings:
      row.alarm_settings && typeof row.alarm_settings === 'object'
        ? (row.alarm_settings as AlarmSettings)
        : { enabled: true },
    updatedAt: row.updated_at,
  }
}

export async function pushLocalAlarmData(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const bundle = loadLocalAlarmDataBundle()
  const updatedAt = markAlarmDataRevision()
  await pushAlarmDataToCloud({
    alarms: bundle.alarms,
    dismissPhrases: bundle.dismissPhrases,
    settings: bundle.settings,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
    updatedAt,
  })
}

export function scheduleAlarmDataSync(): void {
  if (!isCloudSyncAvailable()) return
  markAlarmDataRevision()
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushLocalAlarmData().catch(() => {})
  }, 800)
}

export async function syncAlarmDataOnLogin(userId: string): Promise<'uploaded' | 'downloaded' | 'merged' | 'empty'> {
  const local = loadLocalAlarmDataBundle()
  const remoteRow = await fetchRemoteAlarmData(userId)
  const localHas = hasLocalAlarmData()
  const remoteHas = remoteRow != null

  if (localHas && !remoteHas) {
    await pushLocalAlarmData()
    return 'uploaded'
  }

  if (!localHas && remoteHas) {
    applyLocalAlarmDataBundle(remoteRowToAlarmBundle(remoteRow))
    return 'downloaded'
  }

  if (localHas && remoteHas) {
    const remote = remoteRowToAlarmBundle(remoteRow)
    const merged = mergeAlarmDataBundles(local, remote)
    applyLocalAlarmDataBundle(merged)
    await pushAlarmDataToCloud({
      alarms: merged.alarms,
      dismissPhrases: merged.dismissPhrases,
      settings: merged.settings,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
      updatedAt: merged.updatedAt,
    })
    return 'merged'
  }

  return 'empty'
}
