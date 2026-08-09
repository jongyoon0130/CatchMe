// ---------------------------------------------------------------------------
// 할 일 시간 알림 — 홈에서 시간 저장하면 예약.
//
// • iOS 네이티브: UNUserNotificationCenter 로컬 예약 (로그인·웹 푸시 불필요)
// • 웹/PWA: 기존 Supabase push-tick 경로 (syncRemindersToCloud)
// ---------------------------------------------------------------------------

import type { GoalPlan } from '../types/goalPlan'
import type { MiscTodoItem } from './goalMiscTodos'
import { deriveReminders } from './notifyReminders'
import { syncRemindersToCloud } from './reminderSync'
import { loadLocalGoalDataBundle } from './goalDataSync'
import { isIosNative } from './platform'
import { loadAlarmSettings } from './alarmStore'
import {
  getNativeAlarmStatus,
  getNativeTaskReminderCount,
  requestNativeNotificationPermission,
  syncNativeTaskReminders,
} from './nativeAlarm/plugin'

const HORIZON_DAYS = 7
let syncTimer: ReturnType<typeof setTimeout> | null = null

/** 할 일 저장 후 debounce — 클라우드 없어도 네이티브는 예약 */
export function scheduleTaskReminderSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncTaskRemindersFromLocal().catch(() => {})
  }, 400)
}

export async function syncTaskRemindersFromLocal(now = new Date()): Promise<void> {
  const bundle = loadLocalGoalDataBundle()
  await syncTaskReminders(bundle.plans, bundle.miscTodos, now)
}

export async function syncTaskReminders(
  plans: GoalPlan[],
  misc: MiscTodoItem[],
  now = new Date(),
): Promise<void> {
  if (!loadAlarmSettings().taskRemindersEnabled) {
    if (isIosNative()) {
      await syncNativeTaskReminders([])
    } else {
      await syncRemindersToCloud([], [], now)
    }
    return
  }

  const rows = deriveReminders(plans, misc, now, HORIZON_DAYS)

  if (isIosNative()) {
    await syncTaskRemindersNative(rows)
    return
  }

  await syncRemindersToCloud(plans, misc, now)
}

async function syncTaskRemindersNative(
  rows: ReturnType<typeof deriveReminders>,
): Promise<void> {
  let status = await getNativeAlarmStatus()
  if (status.notificationPermission === 'prompt' || status.notificationPermission === 'unknown') {
    await requestNativeNotificationPermission()
    status = await getNativeAlarmStatus()
  }
  if (status.notificationPermission !== 'granted') return

  await syncNativeTaskReminders(
    rows.map((r) => ({
      fire_date: r.fire_date,
      fire_time: r.fire_time,
      kind: r.kind,
      item_id: r.item_id,
      label: r.label,
    })),
  )
}

export async function loadTaskReminderStatus(): Promise<{
  native: boolean
  permission: string
  scheduledCount: number
}> {
  if (!isIosNative()) {
    return { native: false, permission: 'n/a', scheduledCount: 0 }
  }
  const status = await getNativeAlarmStatus()
  const scheduledCount = await getNativeTaskReminderCount()
  return {
    native: true,
    permission: status.notificationPermission,
    scheduledCount,
  }
}
