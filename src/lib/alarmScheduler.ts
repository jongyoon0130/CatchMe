import {
  clockAlarmDedupKey,
  collectClockAlarms,
  dateKeyFrom,
  filterDueClockAlarms,
  findNextClockAlarm,
  type ClockAlarmTrigger,
} from './clockAlarmEngine'
import {
  ALARM_SETTINGS_CHANGE,
  loadAlarmSettings,
  loadFiredAlarmKeys,
  markAlarmFired,
  pruneOldFiredKeys,
} from './alarmStore'
import { startAlarmSoundLoop } from './alarmSound'
import { showAlarmNotification } from './notify'
import { buildAlarmDeepLinkUrl } from './alarmDeepLink'
import { loadUserAlarms, USER_ALARMS_CHANGE } from './userAlarms'
import { dismissPhraseForTrigger } from './alarmDismissPhrase'
import { resolveDismissPhraseSync } from './alarmDismissPhraseEngine'
import { generateDismissPhraseWithAI, ensureDismissPhrasesForAlarms } from './alarmDismissPhraseEngine'
import { startRingingAlarm } from './alarmRingingStore'
import { syncAlarmsToServiceWorker, markAlarmFiredInServiceWorker } from './alarmSwSync'
import { isNativeAlarmAvailable } from './nativeAlarm/plugin'

const VISIBLE_TICK_MS = 3_000
const HIDDEN_TICK_MS = 10_000
const EVENING_PREP_HOUR = 20

let timer: ReturnType<typeof setInterval> | null = null
let nextAlarmTimer: ReturnType<typeof setTimeout> | null = null
let ticking = false
let preparingPhrases = false

export function getNextAlarmPreview(now = new Date()): ClockAlarmTrigger | null {
  const dateKey = dateKeyFrom(now)
  const fired = loadFiredAlarmKeys(dateKey)
  return findNextClockAlarm(loadUserAlarms(), now, fired)
}

async function fireClockAlarm(trigger: ClockAlarmTrigger): Promise<void> {
  // iOS AlarmKit — 잠금 화면 알람·재울림은 네이티브가 담당. 웹 스케줄러는 중복·따라치기 유실 방지
  if (isNativeAlarmAvailable()) return

  const dedup = clockAlarmDedupKey(trigger)
  markAlarmFired(trigger.dateKey, dedup)
  markAlarmFiredInServiceWorker(dedup)

  const phrase =
    dismissPhraseForTrigger(trigger)?.phrase ??
    resolveDismissPhraseSync({
      alarmId: trigger.alarmId,
      dateKey: trigger.dateKey,
      alarmLabel: trigger.label,
    })

  const result = await showAlarmNotification({
    title: trigger.label || '알람',
    body: '다짐을 따라 쳐야 꺼져요 — Future Me',
    tag: dedup,
    url: buildAlarmDeepLinkUrl(trigger, phrase),
  })

  startRingingAlarm(trigger, phrase)
  startAlarmSoundLoop()

  if (!result.ok && result.reason !== 'denied') {
    console.info('[FutureMe/alarm] 알림 표시 실패', result)
  }

  if (!dismissPhraseForTrigger(trigger)) {
    void generateDismissPhraseWithAI({
      alarmId: trigger.alarmId,
      dateKey: trigger.dateKey,
      alarmLabel: trigger.label,
    })
  }
}

async function maybePrepareDismissPhrases(now: Date): Promise<void> {
  if (preparingPhrases) return
  const hour = now.getHours()
  if (hour < EVENING_PREP_HOUR && hour > 6) return

  preparingPhrases = true
  try {
    await ensureDismissPhrasesForAlarms(loadUserAlarms(), now)
  } finally {
    preparingPhrases = false
  }
}

export async function tickAlarms(now = new Date()): Promise<number> {
  if (ticking) return 0
  if (isNativeAlarmAvailable()) {
    planExactAlarmWake(now)
    return 0
  }
  ticking = true
  try {
    const settings = loadAlarmSettings()
    if (!settings.enabled) return 0

    const dateKey = dateKeyFrom(now)
    pruneOldFiredKeys(dateKey)
    const fired = loadFiredAlarmKeys(dateKey)
    const triggers = collectClockAlarms(loadUserAlarms(), now)
    const due = filterDueClockAlarms(triggers, now, fired)

    for (const trigger of due) {
      await fireClockAlarm(trigger)
    }

    void maybePrepareDismissPhrases(now)
    planExactAlarmWake()

    return due.length
  } finally {
    ticking = false
  }
}

/** 다음 알람 시각에 맞춰 setTimeout — PWA 포그라운드에서 정확히 울리게 */
export function planExactAlarmWake(now = new Date()): void {
  if (nextAlarmTimer) {
    window.clearTimeout(nextAlarmTimer)
    nextAlarmTimer = null
  }

  const settings = loadAlarmSettings()
  if (!settings.enabled) return

  const next = getNextAlarmPreview(now)
  if (!next) return

  const [hour, minute] = next.time.split(':').map(Number)
  const [y, mo, d] = next.dateKey.split('-').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(y)) return

  const target = new Date()
  target.setFullYear(y, mo - 1, d)
  target.setHours(hour, minute, 0, 0)

  let ms = target.getTime() - now.getTime()
  if (ms <= 0) {
    if (ms > -59_000) void tickAlarms()
    return
  }

  if (ms > 86_400_000) ms = 86_400_000

  nextAlarmTimer = window.setTimeout(() => {
    nextAlarmTimer = null
    void tickAlarms()
  }, ms)
}

function resetTickInterval(): void {
  if (timer) window.clearInterval(timer)
  const ms = document.visibilityState === 'visible' ? VISIBLE_TICK_MS : HIDDEN_TICK_MS
  timer = window.setInterval(() => {
    void tickAlarms()
  }, ms)
}

function onStorage(e: StorageEvent): void {
  if (!e.key) return
  if (e.key.includes('futureme-alarm') || e.key.includes('futureme-user-alarms')) {
    void tickAlarms()
    planExactAlarmWake()
  }
}

/** 앱이 켜져 있는 동안 사용자 알람을 확인한다 */
export function startAlarmScheduler(): () => void {
  if (typeof window === 'undefined') return () => {}

  void tickAlarms()
  planExactAlarmWake()
  void syncAlarmsToServiceWorker()
  resetTickInterval()

  const onVisible = () => {
    resetTickInterval()
    if (document.visibilityState === 'visible') {
      void tickAlarms()
      planExactAlarmWake()
    }
  }
  const onChange = () => {
    void tickAlarms()
    planExactAlarmWake()
    void syncAlarmsToServiceWorker()
    void ensureDismissPhrasesForAlarms(loadUserAlarms())
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener(ALARM_SETTINGS_CHANGE, onChange)
  window.addEventListener(USER_ALARMS_CHANGE, onChange)
  window.addEventListener('storage', onStorage)

  return () => {
    if (timer) window.clearInterval(timer)
    if (nextAlarmTimer) window.clearTimeout(nextAlarmTimer)
    timer = null
    nextAlarmTimer = null
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener(ALARM_SETTINGS_CHANGE, onChange)
    window.removeEventListener(USER_ALARMS_CHANGE, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** @deprecated 할 일 연동 알람 대신 notifyGoalDataChanged는 no-op */
export function notifyGoalDataChanged(): void {
  /* clock alarms only */
}
