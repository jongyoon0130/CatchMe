import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import {
  isDeveloperMode,
  registerDeveloperModeUnlockTap,
  setDeveloperMode,
} from '../../lib/geminiApiKey'
import { AlarmSettingsContent } from './AlarmSettingsContent'
import { AlarmAlertModeSettingsSection } from './AlarmAlertModeSettingsSection'
import { AccountSettingsSection } from './AccountSettingsSection'
import { AppPermissionsSection } from './AppPermissionsSection'
import { AiStatusRow } from './AiStatusRow'
import { ChatApiSettingsSection } from './ChatApiSettingsSection'

interface Props {
  onClose: () => void
  onChanged?: () => void
}

export function GlobalSettingsSheet({ onClose, onChanged }: Props) {
  useBodyScrollLock(true)
  const [devMode, setDevMode] = useState(isDeveloperMode())

  const handleTitleTap = () => {
    if (devMode) return
    if (registerDeveloperModeUnlockTap()) {
      setDevMode(true)
    }
  }

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
            <button
              type="button"
              onClick={handleTitleTap}
              className="text-[15px] font-bold text-ink px-2 py-1 -mx-2 select-none"
            >
              설정
            </button>
            <button type="button" onClick={onClose} className="text-sm font-bold text-ink px-1 py-1">
              닫기
            </button>
          </div>
          {devMode ? (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Developer
              </span>
              <button
                type="button"
                onClick={() => {
                  setDeveloperMode(false)
                  setDevMode(false)
                }}
                className="text-[10px] text-muted underline underline-offset-2"
              >
                끄기
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-5 py-4 pb-8">
          <AccountSettingsSection />

          <section className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">AI</p>
            {devMode ? <ChatApiSettingsSection onChanged={onChanged} /> : <AiStatusRow />}
          </section>

          <AlarmAlertModeSettingsSection onChanged={onChanged} />

          <section className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">알람</p>
            <AlarmSettingsContent onChanged={onChanged} />
          </section>

          <AppPermissionsSection />
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}
