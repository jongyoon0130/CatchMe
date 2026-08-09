import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAlarmSettingsSnapshot } from '../lib/alarmSettingsStatus'
import { ALARM_SETTINGS_CHANGE } from '../lib/alarmStore'
import { getActiveModel } from '../lib/selfEngine'
import { loadApiKey, loadModel, resolveCachedApiStatus } from '../lib/storage'
import { GlobalSettingsSheet } from '../components/settings/GlobalSettingsSheet'

type AppSettingsContextValue = {
  openSettings: () => void
  closeSettings: () => void
  needsAttention: boolean
  refreshAttention: () => void
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

async function computeNeedsAttention(): Promise<boolean> {
  const key = loadApiKey()?.trim() ?? ''
  const mdl = getActiveModel(loadModel())
  const api = resolveCachedApiStatus(key, mdl)
  const apiBad = api === 'bad_key' || api === 'rate_limit' || api === 'error'

  try {
    const snap = await loadAlarmSettingsSnapshot()
    return apiBad || snap.needsAttention
  } catch {
    return apiBad
  }
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [needsAttention, setNeedsAttention] = useState(false)

  const refreshAttention = useCallback(() => {
    void computeNeedsAttention().then(setNeedsAttention)
  }, [])

  useEffect(() => {
    refreshAttention()
    window.addEventListener('focus', refreshAttention)
    document.addEventListener('visibilitychange', refreshAttention)
    window.addEventListener(ALARM_SETTINGS_CHANGE, refreshAttention)
    return () => {
      window.removeEventListener('focus', refreshAttention)
      document.removeEventListener('visibilitychange', refreshAttention)
      window.removeEventListener(ALARM_SETTINGS_CHANGE, refreshAttention)
    }
  }, [refreshAttention])

  const value = useMemo(
    () => ({
      openSettings: () => setOpen(true),
      closeSettings: () => setOpen(false),
      needsAttention,
      refreshAttention,
    }),
    [needsAttention, refreshAttention],
  )

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
      {open ? (
        <GlobalSettingsSheet
          onClose={() => setOpen(false)}
          onChanged={refreshAttention}
        />
      ) : null}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return ctx
}
