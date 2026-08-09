export interface AlarmSettings {
  /** 알람 기능 전체 켜기 */
  enabled: boolean
  /** 홈 할 일 시간 알림 */
  taskRemindersEnabled: boolean
  /** 잠금 화면 AlarmKit 알람 (iOS) / 앱 알람 (웹) */
  lockScreenAlarmEnabled: boolean
  /** 앱에서 다짐 문구 따라치기로 해제 */
  typeToDismissEnabled: boolean
}

const SETTINGS_KEY = 'futureme-alarm-settings'
const FIRED_PREFIX = 'futureme-alarm-fired-'

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  enabled: true,
  taskRemindersEnabled: true,
  lockScreenAlarmEnabled: true,
  typeToDismissEnabled: true,
}

export function loadAlarmSettings(): AlarmSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_ALARM_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<
      AlarmSettings & { startAlarms?: boolean; endAlarms?: boolean }
    >
    return {
      enabled: parsed.enabled ?? DEFAULT_ALARM_SETTINGS.enabled,
      taskRemindersEnabled: parsed.taskRemindersEnabled ?? DEFAULT_ALARM_SETTINGS.taskRemindersEnabled,
      lockScreenAlarmEnabled:
        parsed.lockScreenAlarmEnabled ?? DEFAULT_ALARM_SETTINGS.lockScreenAlarmEnabled,
      typeToDismissEnabled: parsed.typeToDismissEnabled ?? DEFAULT_ALARM_SETTINGS.typeToDismissEnabled,
    }
  } catch {
    return { ...DEFAULT_ALARM_SETTINGS }
  }
}

export function saveAlarmSettings(next: AlarmSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('futureme-alarm-settings-change'))
  } catch {
    /* ignore */
  }
}

function firedStorageKey(dateKey: string): string {
  return `${FIRED_PREFIX}${dateKey}`
}

export function loadFiredAlarmKeys(dateKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(firedStorageKey(dateKey))
    if (!raw) return new Set()
    const list = JSON.parse(raw) as string[]
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

export function markAlarmFired(dateKey: string, dedupKey: string): void {
  try {
    const set = loadFiredAlarmKeys(dateKey)
    set.add(dedupKey)
    localStorage.setItem(firedStorageKey(dateKey), JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

export function pruneOldFiredKeys(todayKey: string): void {
  try {
    const today = new Date(`${todayKey}T12:00:00`)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith(FIRED_PREFIX)) continue
      const dateKey = key.slice(FIRED_PREFIX.length)
      const d = new Date(`${dateKey}T12:00:00`)
      if (Number.isNaN(d.getTime())) continue
      const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000)
      if (diffDays > 2) localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

export const ALARM_SETTINGS_CHANGE = 'futureme-alarm-settings-change'
