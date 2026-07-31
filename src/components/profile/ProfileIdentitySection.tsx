import type { ReactNode } from 'react'
import type { SelfProfile } from '../../types/self'
import { FUTURE_YEARS_AHEAD } from '../../lib/brand'
import { LIFE_DOMAIN_LABELS } from '../../types/self'
import {
  buildFutureHeaderChips,
  buildFutureSummaryLine,
  buildPresentSummaryLine,
  buildProfileHeaderChips,
} from '../../lib/profilePhrases'

export function buildProfileIdentityPanel(profile: SelfProfile) {
  const f = profile.future

  const presentChips = buildProfileHeaderChips({
    age: profile.age,
    currentRole: profile.currentRole,
    lifeContext: profile.lifeContext,
  })

  const futureChips = buildFutureHeaderChips({
    identityLine: f.identityLine,
    typicalDay: f.typicalDay,
    career: f.career,
    achievement: f.achievement,
    traitsShift: f.traitsShift,
    thrivingDomains: (f.thrivingDomains ?? []).map((d) => LIFE_DOMAIN_LABELS[d]),
  })

  const presentLine = buildPresentSummaryLine(profile)
  const futureLine = buildFutureSummaryLine(f)

  const hasContent =
    presentChips.length > 0 ||
    futureChips.length > 0 ||
    presentLine.length > 0 ||
    futureLine.length > 0

  return {
    presentChips,
    futureChips,
    presentLine,
    futureLine,
    hasContent,
    futureLabel: `${FUTURE_YEARS_AHEAD}년 뒤`,
  }
}

function ProfileChip({ children, tone }: { children: ReactNode; tone?: 'future' }) {
  return (
    <span
      className={`nb-pill text-[10px] px-2 py-0.5 rounded-full font-semibold ${
        tone === 'future' ? 'bg-accent/35 text-ink' : 'bg-surface-2 text-muted'
      }`}
    >
      {children}
    </span>
  )
}

function ProfilePane({
  title,
  chips,
  line,
  tone,
}: {
  title: string
  chips: string[]
  line: string
  tone?: 'future'
}) {
  return (
    <div
      className={`nb-card rounded-[20px] p-3.5 flex flex-col min-h-[108px] ${
        tone === 'future' ? 'nb-card--mint bg-accent/25' : ''
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted mb-2">{title}</p>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <ProfileChip key={chip} tone={tone}>
              {chip}
            </ProfileChip>
          ))}
        </div>
      ) : line ? (
        <p className="text-[11px] text-ink/70 leading-snug line-clamp-2">{line}</p>
      ) : (
        <p className="text-[11px] text-muted/70">아직 비어 있어요</p>
      )}
    </div>
  )
}

export function ProfileIdentitySection({ profile }: { profile: SelfProfile }) {
  const panel = buildProfileIdentityPanel(profile)
  if (!panel.hasContent) return null

  return (
    <section className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <ProfilePane title="지금" chips={panel.presentChips} line={panel.presentLine} />
        <ProfilePane
          title={panel.futureLabel}
          chips={panel.futureChips}
          line={panel.futureLine}
          tone="future"
        />
      </div>
    </section>
  )
}
