import { useMemo, useState } from 'react'
import type { SelfProfile } from '../../types/self'
import {
  PERSONA_FACET_LABELS,
  applyPersonaAnswer,
  personaCompleteness,
  personaGaps,
  type PersonaFacetId,
  type PersonaFieldSpec,
} from '../../lib/personaModel'
import { loadProfileById, saveProfileRecord } from '../../lib/storage'
import { getPrimaryProfileId } from '../../lib/primaryProfile'
import { getGoalAppOwnerId } from '../../lib/goalAppOwner'
import { dayCloseStreak, loadDayCloses } from '../../lib/dayClose'
import { achievedPlans, activeGoalsLite, readGoalPlansLite, totalDoneCount } from '../../lib/goalPlanBridge'

interface Props {
  /** 프로필 채팅 열기 */
  onOpenChat: (profileId: string) => void
  /** 홈(계획표) 탭으로 이동 */
  onOpenHome: () => void
  /** 새 프로필 만들기 (온보딩) */
  onCreate: () => void
  /** 이 값이 바뀌면 다시 읽는다 (탭 활성화·프로필 변경 신호) */
  refreshKey: number
}

function clip(v: string, max: number): string {
  const t = v.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export function ProfileScreen({ onOpenChat, onOpenHome, onCreate, refreshKey }: Props) {
  // 채팅·홈 탭과 같은 사람을 본다 — "미래의 나는 한 명" (primaryProfile.ts)
  const primaryId = getPrimaryProfileId()
  const [profile, setProfile] = useState<SelfProfile | null>(() =>
    primaryId ? loadProfileById(primaryId) : null,
  )

  // refreshKey / primaryId가 바뀌면 최신값으로 다시 읽는다
  const loadedFor = useMemo(() => `${primaryId}:${refreshKey}`, [primaryId, refreshKey])
  const [loadedTag, setLoadedTag] = useState(loadedFor)
  if (loadedTag !== loadedFor) {
    setLoadedTag(loadedFor)
    setProfile(primaryId ? loadProfileById(primaryId) : null)
  }

  const ownerId = getGoalAppOwnerId()
  const streak = dayCloseStreak(loadDayCloses(ownerId))
  const doneTotal = totalDoneCount()
  const achieved = achievedPlans(readGoalPlansLite())
  const active = activeGoalsLite()

  const fill = (field: PersonaFieldSpec, value: string) => {
    if (!profile || !value.trim()) return
    const next = applyPersonaAnswer(profile, field, value.trim())
    saveProfileRecord(next)
    setProfile(next)
  }

  if (!profile) {
    return (
      <div className="h-full overflow-y-auto bg-void">
        <div className="max-w-lg mx-auto px-5 pt-6 pb-24 flex flex-col items-center justify-center min-h-full text-center gap-4">
          <p className="text-sm text-muted leading-relaxed">
            아직 프로필이 없어요.
            <br />
            5년 뒤의 나를 만들면 여기에 정리돼요.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="rounded-full bg-ink px-6 py-3.5 text-sm font-bold text-surface shadow-[0_6px_20px_rgba(20,22,28,0.24)] transition-transform active:scale-[0.97]"
          >
            미래의 나 만들기
          </button>
        </div>
      </div>
    )
  }

  const f = profile.future
  const comp = personaCompleteness(profile)
  const gaps = personaGaps(profile, 2)
  const continuityPct = f.continuityScore ? Math.round(((f.continuityScore - 1) / 6) * 100) : 0

  return (
    <div className="h-full overflow-y-auto bg-void">
      <div className="max-w-lg mx-auto px-5 pt-6 pb-24 space-y-5">
        {/* 1. 정체성 — 지금의 나 → 5년 뒤의 나 */}
        <section>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl chat-avatar flex items-center justify-center text-xl font-semibold shrink-0 shadow-sm">
              {profile.name[0] ?? '나'}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-ink truncate">
                {profile.name || '이름 없음'}
              </h1>
              <p className="text-[13px] font-medium text-muted mt-0.5 truncate">
                {[profile.age ? `${profile.age}세` : null, profile.currentRole?.trim()]
                  .filter(Boolean)
                  .join(' · ') || '지금의 나'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChat(profile.id)}
              className="shrink-0 rounded-full bg-ink px-4 py-2 text-xs font-bold text-surface transition-transform active:scale-95"
            >
              대화하기
            </button>
          </div>

          {f.identityLine?.trim() && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-surface/60 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span>지금의 나</span>
                <span className="flex-1 h-px bg-border/70" />
                <span className="text-accent">5년 뒤의 나</span>
              </div>
              {f.continuityScore ? (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${continuityPct}%` }} />
                  </div>
                  <p className="text-[11px] text-muted mt-1.5">
                    {f.continuityScore >= 6
                      ? '거의 같은 사람 — 방향이 또렷해'
                      : f.continuityScore >= 4
                        ? '조금 달라졌지만 이어진 나'
                        : '꽤 다른 버전을 향해 가는 중'}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* 2. 미래의 나 카드 */}
        {(f.identityLine?.trim() || f.adviceLine?.trim() || f.typicalDay?.trim()) && (
          <section
            className="relative overflow-hidden rounded-[28px] p-6 shadow-[0_8px_28px_rgba(16,18,24,0.22)]"
            style={{ background: 'linear-gradient(150deg, #1b1e26 0%, #14161c 55%, #23283a 100%)' }}
          >
            <div
              className="absolute -top-12 -right-10 h-40 w-40 rounded-full blur-3xl"
              style={{ background: 'rgba(245,197,66,0.22)' }}
              aria-hidden
            />
            <div
              className="absolute -bottom-14 -left-10 h-36 w-36 rounded-full blur-3xl"
              style={{ background: 'rgba(139,92,246,0.2)' }}
              aria-hidden
            />
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-glow">
              5년 뒤의 나
            </p>
            {f.identityLine?.trim() && (
              <h2 className="relative mt-2.5 text-[23px] font-extrabold leading-snug tracking-[-0.03em] text-white">
                {f.identityLine.trim()}
              </h2>
            )}
            {f.typicalDay?.trim() && (
              <p className="font-serif relative mt-3.5 text-[14px] leading-relaxed text-white/60">
                “{clip(f.typicalDay, 90)}”
              </p>
            )}
            {f.adviceLine?.trim() && (
              <div className="relative mt-5 border-l-2 border-glow/60 pl-4">
                <p className="text-[14px] leading-relaxed text-white/85">{f.adviceLine.trim()}</p>
                <p className="mt-2 text-[11px] text-white/40">— 미래의 내가 지금의 너에게</p>
              </div>
            )}
          </section>
        )}

        {/* 3. 여정 — 시간이 만드는 해자 */}
        <section>
          <h3 className="text-[11px] font-bold text-muted/70 uppercase tracking-[0.1em] px-0.5 mb-2.5">여정</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: '마감 연속', value: streak, unit: '일' },
              { label: '해낸 일', value: doneTotal, unit: '개' },
              { label: '이룬 목표', value: achieved.length, unit: '개' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-surface px-3 py-4 text-center shadow-[0_1px_2px_rgba(16,18,24,0.04),0_2px_8px_rgba(16,18,24,0.04)]"
              >
                <p className="text-[28px] font-extrabold tracking-[-0.04em] text-ink tabular-nums leading-none">
                  {s.value}
                </p>
                <p className="mt-2 text-[11px] font-medium text-muted">
                  {s.label} <span className="text-muted/60">{s.unit}</span>
                </p>
              </div>
            ))}
          </div>
          {achieved.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {achieved.slice(0, 6).map((p) => (
                <span
                  key={p.id}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-status-warn/40 bg-status-warn/10 text-status-warn font-medium"
                >
                  🏆 {clip(p.title, 16)}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 4. 지금 향하는 목표 */}
        {active.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <h3 className="text-[11px] font-bold text-muted/70 uppercase tracking-[0.1em]">지금 향하는 목표</h3>
              <button type="button" onClick={onOpenHome} className="text-[11px] text-accent">
                계획표 →
              </button>
            </div>
            <div className="space-y-2">
              {active.slice(0, 4).map((g) => (
                <button
                  key={g.title}
                  type="button"
                  onClick={onOpenHome}
                  className="w-full flex items-center gap-2 rounded-xl border border-border/60 bg-surface/60 px-3.5 py-2.5 text-left"
                >
                  <span className="text-sm text-ink flex-1 min-w-0 truncate">{g.title}</span>
                  {g.dday != null && (
                    <span className="text-[11px] text-muted shrink-0">
                      {g.dday >= 0 ? `D-${g.dday}` : `마감 ${-g.dday}일 지남`}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 5. 나를 이루는 것 — 페르소나 + 성장 여지 */}
        <section>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <h3 className="text-[11px] font-bold text-muted/70 uppercase tracking-[0.1em]">나를 이루는 것</h3>
            <span className="text-[11px] text-muted">미래의 나, {Math.round(comp.overall * 100)}% 또렷</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-3">
            <div className="h-full bg-accent rounded-full" style={{ width: `${Math.round(comp.overall * 100)}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PERSONA_FACET_LABELS) as PersonaFacetId[]).map((facet) => {
              const stat = comp.byFacet[facet]
              const on = stat.filled > 0
              return (
                <span
                  key={facet}
                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${
                    on
                      ? 'bg-accent/12 text-accent border-accent/25'
                      : 'bg-ink/[0.03] text-muted/70 border-border/60'
                  }`}
                >
                  {PERSONA_FACET_LABELS[facet]}
                  {on ? ` ${stat.filled}/${stat.total}` : ''}
                </span>
              )
            })}
          </div>

          {gaps.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border/60 bg-surface/60 p-4 space-y-3">
              <p className="text-xs text-muted leading-relaxed">
                채울수록 대화가 진짜 나 같아져. 지금 가장 도움되는 질문부터:
              </p>
              {gaps.map((g) => (
                <GapField key={g.key} field={g} onSave={(v) => fill(g, v)} />
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

function GapField({ field, onSave }: { field: PersonaFieldSpec; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink/80 hover:border-accent/40"
      >
        {field.question}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-3 space-y-2">
      <p className="text-xs text-muted">{field.question}</p>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={field.placeholder}
        rows={2}
        className="w-full rounded-lg border border-border bg-surface-2/60 p-2.5 text-sm text-ink resize-none focus:outline-none focus:border-accent/50"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted px-2">
          나중에
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(value)
            setOpen(false)
            setValue('')
          }}
          disabled={!value.trim()}
          className="text-xs text-accent font-medium px-3 py-1.5 rounded-lg bg-accent/10 disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </div>
  )
}
