import { useAppSettings } from '../../contexts/AppSettingsContext'
import { SettingsIcon } from './SettingsIcon'

type Props = {
  className?: string
}

export function SettingsGearButton({ className = '' }: Props) {
  const { openSettings, needsAttention } = useAppSettings()

  return (
    <button
      type="button"
      onClick={openSettings}
      className={`relative inline-flex items-center justify-center text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5 transition-colors shrink-0 ${className}`.trim()}
      title={needsAttention ? '설정 — 확인 필요' : '설정'}
      aria-label="설정"
    >
      <SettingsIcon />
      {needsAttention ? (
        <span
          className="absolute top-1 right-1 h-2 w-2 rounded-full border border-void bg-status-warn"
          aria-hidden
        />
      ) : null}
    </button>
  )
}
