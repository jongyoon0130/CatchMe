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
import { useAuth } from '../../contexts/AuthContext'
import { APP_NAME } from '../../lib/brand'
import { BrandMark } from '../brand/BrandMark'
import { AlarmEditSheet } from './AlarmEditSheet'
import { DismissPhraseEditSheet } from './DismissPhraseEditSheet'
import { SettingsGearButton } from '../settings/SettingsGearButton'
import { AppFab } from '../ui/AppFab'

/** 핸드폰 시계 앱처럼 — 알람 목록 + 토글 + 추가 */
export function AlarmClockPanel() {
  const { user } = useAuth()
  const [alarms, setAlarms] = useState<UserAlarm[]>(() => loadUserAlarms())
  const [editing, setEditing] = useState<UserAlarm | null | 'new'>(null)
  const [nextLabel, setNextLabel] = useState<string | null>(null)
  const [nextTarget, setNextTarget] = useState<ClockAlarmTrigger | null>(null)
  const [nextPhrase, setNextPhrase] = useState<string | null>(null)
  const [nextPhraseSource, setNextPhraseSource] = useState<AlarmDismissPhrase['source'] | null>(null)
  const [phraseEditing, setPhraseEditing] = useState(false)
  // 길게 눌러 여러 개 골라 지우기
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const refresh = useCallback(() => {
    const list = loadUserAlarms()
    setAlarms(list)
    const next = getNextAlarmPreview()
    setNextTarget(next)
    if (next) {
      const alarm = list.find((a) => a.id === next.alarmId)
      const suffix = alarm && !alarm.enabled ? ' · 꺼짐' : ''
      setNextLabel(`${formatAlarmClockTime(next.time)} · ${next.label}${suffix}`)
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
        void ensureDismissPhrasesForAlarms(list).then(() => {
          const generated = loadDismissPhrase(next.alarmId, next.dateKey)
          if (generated?.phrase) {
            setNextPhrase(generated.phrase)
            setNextPhraseSource(generated.source ?? 'fallback')
          }
        })
      }
    } else {
      setNextLabel(null)
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

  const handleSave = (draft: Pick<UserAlarm, 'time' | 'label' | 'repeatDays' | 'resolve'>) => {
    if (editing === 'new') {
      addUserAlarm(draft)
    } else if (editing) {
      updateUserAlarm(editing.id, { ...draft, enabled: true })
    }
    refresh()
  }

  return (
    <div className="relative h-full flex flex-col min-h-0">
      <header className="goal-nav sticky top-0 z-10 shrink-0">
        <BrandMark />
        <div className="goal-crumb min-w-0 flex-1">
          <p className="goal-crumb-lv f">알람</p>
          <h1>{APP_NAME}</h1>
        </div>
        {selectMode ? (
          <div className="flex items-center gap-2 shrink-0">
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
          <SettingsGearButton />
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-5 pt-4 pb-28">

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
            오른쪽 아래 <strong className="font-medium">+</strong> 버튼으로 첫 알람을 만들어보세요
          </p>
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
      </div>

      {!selectMode ? (
        <AppFab onClick={() => setEditing('new')} aria-label="알람 추가" />
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
