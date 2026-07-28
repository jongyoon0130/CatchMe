import { WebPlugin } from '@capacitor/core'
import type {
  FutureMeAlarmPlugin,
  NativeAlarmFiredEvent,
  NativeAlarmRecord,
  NativeAlarmStatus,
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
      message: '웹 Mock — 「알람 울림 시뮬레이션」으로 따라치기 UX 테스트',
    }
  }

  async syncAlarms(options: { alarms: NativeAlarmRecord[] }): Promise<{ ok: boolean; count: number; mode?: string }> {
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
