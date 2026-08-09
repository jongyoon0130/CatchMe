import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { AlarmSettingsContent } from './AlarmSettingsContent'
import { AlarmAlertModeSettingsSection } from './AlarmAlertModeSettingsSection'
import { ChatApiSettingsSection } from './ChatApiSettingsSection'

interface Props {
  onClose: () => void
  onChanged?: () => void
}

export function GlobalSettingsSheet({ onClose, onChanged }: Props) {
  useBodyScrollLock(true)

  const sheet = (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center overscroll-none touch-none"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-ink/30" aria-hidden />

      <div
        className="relative z-10 flex w-full max-w-lg max-h-[92vh] flex-col rounded-t-[28px] bg-surface shadow-[0_-12px_40px_rgba(20,22,28,0.12)] animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="설정"
      >
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border/40">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <div className="w-10" />
            <h2 className="text-[15px] font-bold text-ink">설정</h2>
            <button type="button" onClick={onClose} className="text-sm font-bold text-ink px-1 py-1">
              닫기
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-5 py-4 pb-8">
          <section className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">AI</p>
            <ChatApiSettingsSection onChanged={onChanged} />
          </section>

          <AlarmAlertModeSettingsSection onChanged={onChanged} />

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">알람</p>
            <AlarmSettingsContent onChanged={onChanged} />
          </section>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}
