import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addUserAlarm,
  deleteUserAlarm,
  deleteUserAlarms,
  describeRepeatDays,
  formatAlarmClockTime,
  loadUserAlarms,
  toggleUserAlarm,
  updateUserAlarm,
  USER_ALARMS_CHANGE,
  type UserAlarm,
} from '../../lib/userAlarms'
import { pullAlarmDataOnForeground } from '../../lib/alarmDataSync'
import { getNextAlarmPreview } from '../../lib/alarmScheduler'
import type { ClockAlarmTrigger } from '../../lib/clockAlarmEngine'
import {
  describeDismissPhraseSource,
  loadDismissPhrase,
  type AlarmDismissPhrase,
} from '../../lib/alarmDismissPhrase'
import { ensureDismissPhrasesForAlarms, resolveDismissPhraseSync } from '../../lib/alarmDismissPhraseEngine'
import { bootstrapAlarmDelivery } from '../../lib/alarmBootstrap'
import { loadAlarmSettingsSnapshot } from '../../lib/alarmSettingsStatus'
import { autoSyncAlarmsToNative } from '../../lib/nativeAlarm'
import {
  loadAlarmAlertMode,
  saveAlarmAlertMode,
  ALARM_ALERT_MODE_CHANGE,
  type AlarmAlertMode,
} from '../../lib/alarmAlertMode'
import { useAuth } from '../../contexts/AuthContext'
import { AlarmEditSheet } from './AlarmEditSheet'
import { DismissPhraseEditSheet } from './DismissPhraseEditSheet'
import { AlarmSettingsSheet } from './AlarmSettingsSheet'
import { AlarmAlertModePicker } from './AlarmAlertModePicker'

/** 핸드폰 시계 앱처럼 — 알람 목록 + 토글 + 추가 */
export function AlarmClockPanel() {
  const { user } = useAuth()
  const [alarms, setAlarms] = useState<UserAlarm[]>(() => loadUserAlarms())
  const [editing, setEditing] = useState<UserAlarm | null | 'new'>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [nextLabel, setNextLabel] = useState<string | null>(null)
  const [nextTarget, setNextTarget] = useState<ClockAlarmTrigger | null>(null)
  const [nextPhrase, setNextPhrase] = useState<string | null>(null)
  const [nextPhraseSource, setNextPhraseSource] = useState<AlarmDismissPhrase['source'] | null>(null)
  const [phraseEditing, setPhraseEditing] = useState(false)
  const [alertMode, setAlertMode] = useState<AlarmAlertMode>(() => loadAlarmAlertMode())
  // 길게 눌러 여러 개 골라 지우기
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const refresh = useCallback(() => {
    setAlarms(loadUserAlarms())
    void loadAlarmSettingsSnapshot().then((snap) => setNeedsSetup(snap.needsAttention))
    const next = getNextAlarmPreview()
    setNextTarget(next)
    setNextLabel(next ? `${formatAlarmClockTime(next.time)} · ${next.label}` : null)
    if (next) {
      const stored = loadDismissPhrase(next.alarmId, next.dateKey)
      if (stored?.phrase) {
        setNextPhrase(stored.phrase)
        setNextPhraseSource(stored.source ?? 'fallback')
      } else {
        setNextPhraseSource(null)
        setNextPhrase(
          resolveDismissPhraseSync({
            alarmId: next.alarmId,
            dateKey: next.dateKey,
            alarmLabel: next.label,
          }),
        )
        void ensureDismissPhrasesForAlarms(loadUserAlarms()).then(() => {
          const generated = loadDismissPhrase(next.alarmId, next.dateKey)
          if (generated?.phrase) {
            setNextPhrase(generated.phrase)
            setNextPhraseSource(generated.source ?? 'fallback')
          }
        })
      }
    } else {
      setNextPhrase(null)
      setNextPhraseSource(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(USER_ALARMS_CHANGE, refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener(USER_ALARMS_CHANGE, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    const onModeChange = () => setAlertMode(loadAlarmAlertMode())
    window.addEventListener(ALARM_ALERT_MODE_CHANGE, onModeChange)
    return () => window.removeEventListener(ALARM_ALERT_MODE_CHANGE, onModeChange)
  }, [])

  useEffect(() => {
    void bootstrapAlarmDelivery({ askPermission: false, forceRenew: true })
  }, [alarms, user])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void bootstrapAlarmDelivery({ askPermission: false, forceRenew: false })
        // 같은 계정 다른 기기의 알람 추가·삭제를 끌어온다
        void pullAlarmDataOnForeground()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    void pullAlarmDataOnForeground()
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const clearPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }, [])

  const startPress = useCallback(
    (id: string) => {
      clearPress()
      longPressed.current = false
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null
        longPressed.current = true
        setSelectMode(true)
        setSelectedIds(new Set([id]))
      }, 480)
    },
    [clearPress],
  )

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDeleteSelected = () => {
    if (!selectedIds.size) return
    deleteUserAlarms([...selectedIds])
    exitSelectMode()
    refresh()
  }

  const handleAlertModeChange = (mode: AlarmAlertMode) => {
    if (mode === alertMode) return
    saveAlarmAlertMode(mode)
    setAlertMode(mode)
    void autoSyncAlarmsToNative(true)
  }

  const handleSave = (draft: Pick<UserAlarm, 'time' | 'label' | 'repeatDays' | 'resolve'>) => {
    if (editing === 'new') {
      addUserAlarm(draft)
    } else if (editing) {
      updateUserAlarm(editing.id, { ...draft, enabled: true })
    }
    refresh()
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.035em] text-ink">알람</h1>
        {selectMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exitSelectMode}
              className="rounded-full border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-muted"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedIds.size}
              className="rounded-full bg-status-error px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
            >
              삭제{selectedIds.size ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="relative rounded-full border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink/85"
              aria-label="알람 설정"
            >
              설정
              {needsSetup ? (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-status-warn" aria-hidden />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="nb-btn nb-btn--accent rounded-full px-4 py-2 text-[13px] active:scale-100"
            >
              + 추가
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted/75 mb-3 leading-relaxed">
        알람을 켜두면 <strong className="font-medium text-ink/80">설정한 시간</strong>에 울려요.
        앱을 닫거나 잠금 화면에서도 울립니다.
      </p>

      <AlarmAlertModePicker value={alertMode} onChange={handleAlertModeChange} />

      {nextLabel ? (
        <p className="text-[11px] text-ink/70 mb-3">
          다음 알람 · <span className="font-semibold">{nextLabel}</span>
        </p>
      ) : null}

      {nextPhrase && nextTarget ? (
        <div className="nb-card nb-card--soft rounded-xl px-3.5 py-3 mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">다음 알람 다짐</p>
              {nextPhraseSource ? (
                <p className="text-[10px] text-muted/70 mt-0.5">{describeDismissPhraseSource(nextPhraseSource)}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setPhraseEditing(true)}
              className="shrink-0 text-[11px] font-semibold text-ink/80 underline underline-offset-2"
            >
              편집
            </button>
          </div>
          <p className="font-serif text-[13px] leading-relaxed text-muted/80 whitespace-pre-wrap">{nextPhrase}</p>
        </div>
      ) : null}

      {alarms.length === 0 ? (
        <div className="nb-card nb-card--soft rounded-2xl px-4 py-10 text-center">
          <p className="text-sm text-muted mb-1">등록된 알람이 없어요</p>
          <p className="text-[12px] text-muted/70 mb-4">
            위 <strong className="font-medium">+ 추가</strong>로 첫 알람을 만들어보세요
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="nb-btn nb-btn--accent rounded-full px-5 py-2.5 text-sm"
          >
            알람 추가
          </button>
        </div>
      ) : (
        <>
          {selectMode ? (
            <p className="text-[11px] text-muted mb-2">지울 알람을 골라주세요</p>
          ) : (
            <p className="text-[11px] text-muted/60 mb-2">길게 누르면 여러 개를 한 번에 지울 수 있어요</p>
          )}
          <ul className="space-y-2.5">
            {alarms.map((alarm) => {
              const checked = selectedIds.has(alarm.id)
              return (
                <li key={alarm.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // 길게 눌러 선택 모드에 진입한 그 터치의 click은 무시
                      if (longPressed.current) {
                        longPressed.current = false
                        return
                      }
                      if (selectMode) toggleSelected(alarm.id)
                      else setEditing(alarm)
                    }}
                    onTouchStart={() => startPress(alarm.id)}
                    onTouchEnd={clearPress}
                    onTouchMove={clearPress}
                    onTouchCancel={clearPress}
                    onMouseDown={() => startPress(alarm.id)}
                    onMouseUp={clearPress}
                    onMouseLeave={clearPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`nb-card nb-card-interactive w-full rounded-2xl px-4 py-3.5 text-left transition-transform select-none [-webkit-touch-callout:none] ${
                      alarm.enabled ? '' : 'nb-card--soft opacity-75'
                    } ${selectMode && checked ? 'ring-2 ring-status-error/70' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[34px] font-light tracking-[-0.04em] leading-none tabular-nums ${
                            alarm.enabled ? 'text-ink' : 'text-muted'
                          }`}
                        >
                          {formatAlarmClockTime(alarm.time).replace(/^오전 |^오후 /, '')}
                        </p>
                        <p className="text-[11px] text-muted mt-1">
                          {formatAlarmClockTime(alarm.time).startsWith('오전') ? '오전' : '오후'} · {alarm.label}
                        </p>
                        <p className="text-[11px] text-muted/70 mt-0.5">{describeRepeatDays(alarm.repeatDays)}</p>
                      </div>
                      {selectMode ? (
                        <span
                          aria-hidden
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold transition-colors ${
                            checked
                              ? 'border-status-error bg-status-error text-white'
                              : 'border-border bg-surface text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={alarm.enabled}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleUserAlarm(alarm.id, !alarm.enabled)
                            refresh()
                          }}
                          onTouchStart={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`relative shrink-0 h-8 w-[52px] rounded-full transition-colors ${
                            alarm.enabled ? 'bg-status-ok' : 'bg-border/80'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform ${
                              alarm.enabled ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {settingsOpen ? (
        <AlarmSettingsSheet
          onClose={() => setSettingsOpen(false)}
          onChanged={refresh}
        />
      ) : null}

      {phraseEditing && nextTarget && nextPhrase ? (
        <DismissPhraseEditSheet
          alarmId={nextTarget.alarmId}
          dateKey={nextTarget.dateKey}
          alarmLabel={nextTarget.label}
          initialPhrase={nextPhrase}
          onSaved={refresh}
          onClose={() => setPhraseEditing(false)}
        />
      ) : null}

      {editing !== null ? (
        <AlarmEditSheet
          alarm={editing === 'new' ? null : editing}
          onSave={handleSave}
          onDelete={
            editing !== 'new' && editing
              ? () => {
                  deleteUserAlarm(editing.id)
                  refresh()
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
