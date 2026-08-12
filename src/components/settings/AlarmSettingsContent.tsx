import { useCallback, useEffect, useMemo, useState } from 'react'
import { bootstrapAlarmDelivery } from '../../lib/alarmBootstrap'
import {
  loadAlarmSettingsSnapshot,
  type AlarmSettingItem,
  type AlarmSettingStatus,
  type AlarmSettingsSnapshot,
} from '../../lib/alarmSettingsStatus'
import {
  ALARM_SETTINGS_CHANGE,
  loadAlarmSettings,
  saveAlarmSettings,
  type AlarmSettings,
} from '../../lib/alarmStore'
import { enableAlarmNotifications } from '../../lib/notify'
import { autoSyncAlarmsToNative, isNativeAlarmAvailable, requestNativeNotificationPermission } from '../../lib/nativeAlarm'
import { scheduleTaskReminderSync, syncTaskRemindersFromLocal } from '../../lib/taskReminderSync'

type FeatureToggleKey = 'taskRemindersEnabled' | 'lockScreenAlarmEnabled' | 'typeToDismissEnabled'

type FeatureCardConfig = {
  key: FeatureToggleKey
  label: string
  detailNative: string
  detailWeb: string
  permissionId?: 'notify' | 'alarmkit'
  permissionLabelNative?: string
  permissionLabelWeb?: string
  footnote?: string
  webExtraIds?: string[]
}

const FEATURE_CARDS: FeatureCardConfig[] = [
  {
    key: 'taskRemindersEnabled',
    label: '할 일 시간 알림',
    detailNative: '홈에서 시간을 저장하면 알림을 예약해요',
    detailWeb: '홈에서 시간을 저장하면 알림을 예약해요',
    permissionId: 'notify',
    permissionLabelNative: 'iPhone 알림',
    permissionLabelWeb: '브라우저 알림',
    webExtraIds: ['push-local', 'push-server', 'login', 'pwa', 'delivery'],
  },
  {
    key: 'lockScreenAlarmEnabled',
    label: '잠금 화면 알람',
    detailNative: '알람 탭 알람이 잠금 화면에서 울려요',
    detailWeb: '앱이 열려 있을 때 알람 탭 알람이 울려요',
    permissionId: 'alarmkit',
    permissionLabelNative: 'iPhone 알람 (AlarmKit)',
    permissionLabelWeb: '브라우저 알림',
  },
  {
    key: 'typeToDismissEnabled',
    label: '앱 따라치기',
    detailNative: '앱에서 알람을 끌 때 다짐 문구를 따라 쳐요',
    detailWeb: '앱에서 알람을 끌 때 다짐 문구를 따라 쳐요',
    footnote: 'iPhone 설정과 무관 · 앱 안에서만 적용',
  },
]

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

function findPermissionItem(items: AlarmSettingItem[], id: string): AlarmSettingItem | undefined {
  return items.find((item) => item.id === id)
}

function openDeviceSettings() {
  window.location.href = 'app-settings:'
}

export function AlarmSettingsContent({ onChanged }: { onChanged?: () => void }) {
  const [snapshot, setSnapshot] = useState<AlarmSettingsSnapshot | null>(null)
  const [settings, setSettings] = useState<AlarmSettings>(() => loadAlarmSettings())
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setSnapshot(await loadAlarmSettingsSnapshot())
    setSettings(loadAlarmSettings())
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(ALARM_SETTINGS_CHANGE, refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(ALARM_SETTINGS_CHANGE, refresh)
    }
  }, [refresh])

  const handleToggle = (key: FeatureToggleKey, next: boolean) => {
    const updated = { ...loadAlarmSettings(), [key]: next }
    saveAlarmSettings(updated)
    setSettings(updated)

    if (key === 'taskRemindersEnabled') {
      if (next) {
        scheduleTaskReminderSync()
      } else {
        void syncTaskRemindersFromLocal()
      }
    }

    if (key === 'lockScreenAlarmEnabled') {
      void autoSyncAlarmsToNative(true)
    }

    onChanged?.()
  }

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

  const permissionItems = snapshot?.items ?? []
  const nativeIos = snapshot?.isNativeIos ?? isNativeAlarmAvailable()
  const needsPerm = permissionItems.some(
    (item) =>
      (item.id === 'alarmkit' || item.id === 'notify') &&
      (item.status === 'warn' || item.status === 'error'),
  )

  const cards = useMemo(() => {
    return FEATURE_CARDS.map((card) => {
      const permissionId =
        card.key === 'lockScreenAlarmEnabled' && !nativeIos ? 'notify' : card.permissionId
      const permission =
        permissionId != null ? findPermissionItem(permissionItems, permissionId) : undefined
      const permissionLabel = nativeIos ? card.permissionLabelNative : card.permissionLabelWeb

      const webExtras =
        !nativeIos && card.webExtraIds
          ? card.webExtraIds
              .map((id) => findPermissionItem(permissionItems, id))
              .filter((item): item is AlarmSettingItem => item != null && item.status !== 'ok')
          : []

      return { card, permission, permissionLabel, webExtras }
    })
  }, [nativeIos, permissionItems])

  return (
    <div>
      <p className="text-[11px] text-muted leading-relaxed mb-3">
        토글은 Catch Me에서 쓸 기능이에요. 각 카드 아래 iPhone 허용 상태도 함께 확인하세요.
      </p>

      <ul className="space-y-2 mb-4">
        {cards.map(({ card, permission, permissionLabel, webExtras }) => (
          <FeatureSettingCard
            key={card.key}
            label={card.label}
            detail={nativeIos ? card.detailNative : card.detailWeb}
            checked={settings[card.key]}
            onChange={(next) => handleToggle(card.key, next)}
            permission={permission}
            permissionLabel={permissionLabel}
            extraPermissions={webExtras}
            footnote={card.footnote}
            nativeIos={nativeIos}
          />
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
  )
}

function FeatureSettingCard({
  label,
  detail,
  checked,
  onChange,
  permission,
  permissionLabel,
  extraPermissions,
  footnote,
  nativeIos,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: (next: boolean) => void
  permission?: AlarmSettingItem
  permissionLabel?: string
  extraPermissions?: AlarmSettingItem[]
  footnote?: string
  nativeIos: boolean
}) {
  const permissionBlocked =
    checked && permission != null && permission.status !== 'ok' && permission.status !== 'unknown'

  return (
    <li className="rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">{label}</p>
          <p className="text-[11px] text-muted leading-relaxed mt-0.5">{detail}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={`relative shrink-0 h-8 w-[52px] rounded-full transition-colors ${
            checked ? 'bg-status-ok' : 'bg-border/80'
          }`}
        >
          <span
            className={`absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform ${
              checked ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {permission && permissionLabel ? (
        <PermissionStatusLine
          label={permissionLabel}
          item={permission}
          showSettingsLink={nativeIos && permission.status === 'error'}
        />
      ) : null}

      {extraPermissions?.map((item) => (
        <PermissionStatusLine
          key={item.id}
          label={item.label}
          item={item}
          showSettingsLink={false}
          compact
        />
      ))}

      {permissionBlocked && permissionLabel ? (
        <p className="text-[11px] text-status-warn mt-2 leading-relaxed">
          켜져 있지만 {permissionLabel}이(가) 없어요. 아래에서 허용하거나 iPhone 설정을 열어주세요.
        </p>
      ) : null}

      {footnote ? (
        <p className="text-[11px] text-muted/80 mt-2.5 pt-2.5 border-t border-border/50 leading-relaxed">
          {footnote}
        </p>
      ) : null}
    </li>
  )
}

function PermissionStatusLine({
  label,
  item,
  showSettingsLink,
  compact = false,
}: {
  label: string
  item: AlarmSettingItem
  showSettingsLink: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`flex items-start gap-2 ${compact ? 'mt-1.5' : 'mt-2.5 pt-2.5 border-t border-border/50'}`}
    >
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(item.status)}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-relaxed text-ink/85">
          <span className="text-muted">{label}: </span>
          {item.detail}
        </p>
        {showSettingsLink ? (
          <button
            type="button"
            onClick={openDeviceSettings}
            className="text-[11px] font-semibold text-ink mt-0.5"
          >
            iPhone 설정 열기
          </button>
        ) : null}
      </div>
    </div>
  )
}
