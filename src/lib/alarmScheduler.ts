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
import { loadUserAlarms, USER_ALARMS_CHANGE } from './userAlarms'
import { dismissPhraseForTrigger } from './alarmDismissPhrase'
import { generateDismissPhraseWithAI, ensureDismissPhrasesForAlarms } from './alarmDismissPhraseEngine'
import { startRingingAlarm } from './alarmRingingStore'

const TICK_MS = 15_000
const EVENING_PREP_HOUR = 20

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false
let preparingPhrases = false

export function getNextAlarmPreview(now = new Date()): ClockAlarmTrigger | null {
  const dateKey = dateKeyFrom(now)
  const fired = loadFiredAlarmKeys(dateKey)
  return findNextClockAlarm(loadUserAlarms(), now, fired)
}

async function fireClockAlarm(trigger: ClockAlarmTrigger): Promise<void> {
  const dedup = clockAlarmDedupKey(trigger)
  markAlarmFired(trigger.dateKey, dedup)

  let record = dismissPhraseForTrigger(trigger)
  if (!record) {
    record = await generateDismissPhraseWithAI({
      alarmId: trigger.alarmId,
      dateKey: trigger.dateKey,
      alarmLabel: trigger.label,
    })
  }

  startRingingAlarm(trigger, record.phrase)
  startAlarmSoundLoop()

  const result = await showAlarmNotification({
    title: trigger.label || '알람',
    body: '다짐을 따라 쳐야 꺼져요 — Future Me',
    tag: dedup,
    url: '/index.html',
  })

  if (!result.ok && result.reason !== 'denied') {
    console.info('[FutureMe/alarm] 알림 표시 실패', result)
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

    return due.length
  } finally {
    ticking = false
  }
}

function onStorage(e: StorageEvent): void {
  if (!e.key) return
  if (e.key.includes('futureme-alarm') || e.key.includes('futureme-user-alarms')) {
    void tickAlarms()
  }
}

/** 앱이 켜져 있는 동안 사용자 알람을 확인한다 */
export function startAlarmScheduler(): () => void {
  if (typeof window === 'undefined') return () => {}

  void tickAlarms()

  timer = window.setInterval(() => {
    void tickAlarms()
  }, TICK_MS)

  const onVisible = () => {
    if (document.visibilityState === 'visible') void tickAlarms()
  }
  const onChange = () => {
    void tickAlarms()
    void ensureDismissPhrasesForAlarms(loadUserAlarms())
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener(ALARM_SETTINGS_CHANGE, onChange)
  window.addEventListener(USER_ALARMS_CHANGE, onChange)
  window.addEventListener('storage', onStorage)

  return () => {
    if (timer) window.clearInterval(timer)
    timer = null
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
