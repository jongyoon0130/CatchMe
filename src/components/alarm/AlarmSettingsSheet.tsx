import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { bootstrapAlarmDelivery } from '../../lib/alarmBootstrap'
import {
  loadAlarmSettingsSnapshot,
  type AlarmSettingItem,
  type AlarmSettingStatus,
  type AlarmSettingsSnapshot,
} from '../../lib/alarmSettingsStatus'
import { enableAlarmNotifications } from '../../lib/notify'
import { autoSyncAlarmsToNative, isNativeAlarmAvailable, requestNativeNotificationPermission } from '../../lib/nativeAlarm'
import { scheduleTaskReminderSync } from '../../lib/taskReminderSync'

interface Props {
  onClose: () => void
  onChanged?: () => void
}

function statusDot(status: AlarmSettingStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-status-ok'
    case 'error':
      return 'bg-status-error'
    case 'warn':
      return 'bg-status-warn'
    default:
      return 'bg-border'
  }
}

function openDeviceSettings() {
  window.location.href = 'app-settings:'
}

export function AlarmSettingsSheet({ onClose, onChanged }: Props) {
  useBodyScrollLock(true)

  const [snapshot, setSnapshot] = useState<AlarmSettingsSnapshot | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setSnapshot(await loadAlarmSettingsSnapshot())
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh])

  const handleRequestPermissions = async () => {
    setBusy(true)
    try {
      await enableAlarmNotifications()
      if (isNativeAlarmAvailable()) {
        await requestNativeNotificationPermission()
      }
      await bootstrapAlarmDelivery({ askPermission: false, forceRenew: true })
      await autoSyncAlarmsToNative(true)
      scheduleTaskReminderSync()
      await refresh()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  const items = snapshot?.items ?? []
  const nativeIos = snapshot?.isNativeIos ?? isNativeAlarmAvailable()
  const needsPerm = items.some(
    (item) =>
      (item.id === 'alarmkit' || item.id === 'notify') &&
      (item.status === 'warn' || item.status === 'error'),
  )

  const sheet = (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center overscroll-none touch-none"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-ink/30" aria-hidden />

      <div
        className="relative z-10 flex w-full max-w-lg max-h-[92vh] flex-col rounded-t-[28px] bg-surface shadow-[0_-12px_40px_rgba(20,22,28,0.12)] animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="알람 설정"
      >
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border/40">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <div className="w-10" />
            <h2 className="text-[15px] font-bold text-ink">알람 설정</h2>
            <button type="button" onClick={onClose} className="text-sm font-bold text-ink px-1 py-1">
              닫기
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-5 py-4 pb-8">
          <p className="text-[11px] text-muted leading-relaxed mb-4">
            {nativeIos
              ? '잠금 화면 알람 권한을 관리해요. 홈 할 일 시간 알림은 시간을 저장하면 자동으로 예약돼요.'
              : '알람 탭 알람과 알림 권한을 관리해요. 웹에서는 홈 할 일 시간 저장 + 알림 허용이 필요해요.'}
          </p>

          <ul className="space-y-2 mb-5">
            {items.map((item) => (
              <SettingRow key={item.id} item={item} />
            ))}
          </ul>

          {needsPerm ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRequestPermissions()}
              className="w-full rounded-xl bg-ink py-3 text-sm font-bold text-surface disabled:opacity-50 mb-2"
            >
              {busy ? '요청 중…' : nativeIos ? '알람·알림 권한 허용' : '알림 허용하기'}
            </button>
          ) : null}

          {nativeIos ? (
            <button
              type="button"
              onClick={openDeviceSettings}
              className="w-full rounded-xl border border-border bg-surface py-3 text-sm font-medium text-muted"
            >
              iPhone 설정 열기
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}

function SettingRow({ item }: { item: AlarmSettingItem }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDot(item.status)}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{item.label}</p>
        <p className="text-[11px] text-muted leading-relaxed mt-0.5">{item.detail}</p>
      </div>
    </li>
  )
}
