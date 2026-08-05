/** 사용자가 직접 만드는 알람 — 핸드폰 시계 앱처럼 */
export interface UserAlarm {
  id: string
  /** 24h HH:mm */
  time: string
  label: string
  enabled: boolean
  /** 0=일 … 6=토. 비어 있으면 매일 */
  repeatDays: number[]
  /**
   * 밤에 적어두는 "내일 아침의 다짐". 아침에 알람을 끄려면 이 문장을 따라 써야 한다
   * (해제 문구가 된다 — alarmDismissPhrase.loadDismissPhrase). 밤의 의지를 아침까지 잇는 장치.
   * 비어 있으면 기존 폴백 문구로 해제된다.
   */
  resolve?: string
  createdAt: number
  updatedAt: number
}

/** 24h HH:mm — 항상 2자리 시·분 */
export function normalizeAlarmTime(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) return value.trim()
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const min = Math.min(59, Math.max(0, Number(m[2])))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export const USER_ALARMS_CHANGE = 'futureme-user-alarms-change'

const STORAGE_KEY = 'futureme-user-alarms'

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function describeRepeatDays(days: number[]): string {
  if (!days.length || days.length === 7) return '매일'
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return '평일'
  if (sorted.length === 2 && sorted.join(',') === '0,6') return '주말'
  return sorted.map((d) => DOW_LABELS[d] ?? '?').join(' ')
}

export function formatAlarmClockTime(time24: string): string {
  const [hStr, mStr] = time24.split(':')
  const h24 = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h24) || !Number.isFinite(m)) return time24
  const period = h24 >= 12 ? '오후' : '오전'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${period} ${h12}:${String(m).padStart(2, '0')}`
}

export function loadUserAlarms(): UserAlarm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as UserAlarm[]
    if (!Array.isArray(list)) return []
    return list
      .filter((a) => a?.id && a?.time)
      .map((a) => ({
        ...a,
        enabled: a.enabled !== false,
        time: normalizeAlarmTime(a.time),
      }))
      .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

function saveAll(alarms: UserAlarm[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms))
  window.dispatchEvent(new CustomEvent(USER_ALARMS_CHANGE))
  void import('./alarmDataSync').then(({ scheduleAlarmDataSync }) => scheduleAlarmDataSync())
  // 네이티브가 따라치기 대기 중인 체인을 스스로 보호하므로 바로 동기화해도 안전하다
  void import('./nativeAlarm').then(({ autoSyncAlarmsToNative }) => {
    void autoSyncAlarmsToNative(true)
  })
  void import('./alarmBootstrap').then(({ bootstrapAlarmDelivery }) =>
    bootstrapAlarmDelivery({ askPermission: true }),
  )
  void import('./alarmSwSync').then(({ syncAlarmsToServiceWorker }) => syncAlarmsToServiceWorker())
}

export function addUserAlarm(
  partial?: Partial<Pick<UserAlarm, 'time' | 'label' | 'repeatDays' | 'resolve'>>,
): UserAlarm {
  const now = Date.now()
  const alarm: UserAlarm = {
    id: crypto.randomUUID(),
    time: normalizeAlarmTime(partial?.time ?? defaultNewAlarmTime()),
    label: partial?.label?.trim() || '알람',
    enabled: true,
    repeatDays: partial?.repeatDays ?? [0, 1, 2, 3, 4, 5, 6],
    resolve: partial?.resolve?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const next = [...loadUserAlarms(), alarm]
  saveAll(next)
  return alarm
}

export function updateUserAlarm(id: string, patch: Partial<Omit<UserAlarm, 'id' | 'createdAt'>>): UserAlarm | null {
  const list = loadUserAlarms()
  const idx = list.findIndex((a) => a.id === id)
  if (idx < 0) return null
  const next: UserAlarm = {
    ...list[idx]!,
    ...patch,
    time: patch.time !== undefined ? normalizeAlarmTime(patch.time) : list[idx]!.time,
    label: patch.label !== undefined ? patch.label.trim() || '알람' : list[idx]!.label,
    resolve: patch.resolve !== undefined ? patch.resolve.trim() || undefined : list[idx]!.resolve,
    updatedAt: Date.now(),
  }
  list[idx] = next
  saveAll(list)
  return next
}

export function deleteUserAlarm(id: string): void {
  saveAll(loadUserAlarms().filter((a) => a.id !== id))
}

export function toggleUserAlarm(id: string, enabled: boolean): void {
  updateUserAlarm(id, { enabled })
}

function defaultNewAlarmTime(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 2)
  d.setSeconds(0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export { DOW_LABELS }
