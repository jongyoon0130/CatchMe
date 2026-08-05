import { WebPlugin } from '@capacitor/core'
import type {
  FutureMeAlarmPlugin,
  NativeAlarmFiredEvent,
  NativeAlarmRecord,
  NativeAlarmStatus,
  AlarmAlertMode,
} from './types'
import { NATIVE_ALARM_FIRED_EVENT } from './types'

/** 브라우저·승인 전 — in-memory mock + 따라치기 시뮬레이션 */
export class FutureMeAlarmWeb extends WebPlugin implements FutureMeAlarmPlugin {
  private stored: NativeAlarmRecord[] = []

  async getStatus(): Promise<NativeAlarmStatus> {
    return {
      platform: 'web',
      mode: 'mock',
      alarmKitEntitled: false,
      notificationPermission: typeof Notification !== 'undefined' ? mapWebPermission(Notification.permission) : 'unknown',
      scheduledCount: this.stored.filter((a) => a.enabled).length,
      hasAwaitingPhrase: false,
      message: '웹 Mock — 「알람 울림 시뮬레이션」으로 따라치기 UX 테스트',
    }
  }

  async syncAlarms(options: { alarms: NativeAlarmRecord[]; alertMode?: AlarmAlertMode }): Promise<{ ok: boolean; count: number; mode?: string }> {
    this.stored = options.alarms
    return { ok: true, count: options.alarms.length, mode: 'mock' }
  }

  async simulateAlarm(options: {
    alarmId: string
    label: string
    time: string
    phrase: string
  }): Promise<{ ok: boolean }> {
    const detail: NativeAlarmFiredEvent = {
      alarmId: options.alarmId,
      label: options.label,
      time: options.time,
      phrase: options.phrase,
      dateKey: todayDateKey(),
      source: 'mock',
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NATIVE_ALARM_FIRED_EVENT, { detail }))
    }
    return { ok: true }
  }

  async requestNotificationPermission(): Promise<{ permission: string }> {
    if (typeof Notification === 'undefined') return { permission: 'unknown' }
    const result = await Notification.requestPermission()
    return { permission: result === 'granted' ? 'granted' : 'denied' }
  }

  async scheduleTestNotification(options: {
    seconds?: number
    alarmId?: string
    label?: string
    time?: string
    phrase?: string
  }): Promise<{ ok: boolean; seconds?: number }> {
    const seconds = options.seconds ?? 5
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return { ok: false, seconds }
    }
    window.setTimeout(() => {
      const n = new Notification(options.label ?? 'Future Me 테스트', {
        body: `탭하면 따라치기 — ${options.phrase ?? '안녕'}`,
        tag: 'futureme-test',
      })
      n.onclick = () => {
        window.focus()
        void this.simulateAlarm({
          alarmId: options.alarmId ?? 'test',
          label: options.label ?? '알람',
          time: options.time ?? '07:00',
          phrase: options.phrase ?? '안녕',
        })
        n.close()
      }
    }, seconds * 1000)
    return { ok: true, seconds }
  }

  async stopActiveAlarm(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  async getPendingDismiss(): Promise<{ pending: false }> {
    return { pending: false }
  }

  async cancelAllPending(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  async refillChain(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  async getDebugInfo(): Promise<{ plans: []; log: string[] }> {
    return { plans: [], log: ['웹 Mock — 네이티브 알람 로그 없음'] }
  }

  async pulseAlarmHaptic(): Promise<{ ok: boolean }> {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 120, 200])
    }
    return { ok: true }
  }

  async setAlertMode(options: { mode: AlarmAlertMode }): Promise<{ ok: boolean; mode?: AlarmAlertMode }> {
    return { ok: true, mode: options.mode }
  }
}

function todayDateKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapWebPermission(p: NotificationPermission): NativeAlarmStatus['notificationPermission'] {
  if (p === 'granted') return 'granted'
  if (p === 'denied') return 'denied'
  return 'prompt'
}
