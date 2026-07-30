import { useMemo, useState } from 'react'
import type { SelfProfile } from '../../types/self'
import {
  buildProfileDetailSections,
  type ProfileDetailGroup,
  type ProfileDetailRow,
  type ProfileDetailSection,
} from '../../lib/profileDetail'

interface Props {
  profile: SelfProfile
  onClose: () => void
}

function DetailChip({ children, tone }: { children: string; tone?: 'future' }) {
  return (
    <span
      className={`text-[11px] px-2.5 py-1 rounded-full border-2 border-border font-bold ${
        tone === 'future' ? 'bg-accent/40 text-ink shadow-[2px_2px_0_0_rgba(20,22,28,1)]' : 'bg-surface text-ink/85 shadow-[2px_2px_0_0_rgba(20,22,28,0.15)]'
      }`}
    >
      {children}
    </span>
  )
}

function ExpandableText({ text, tone }: { text: string; tone?: 'future' }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 140 || text.split('\n').length > 3

  return (
    <div className="space-y-2">
      <p
        className={`text-[15px] leading-relaxed whitespace-pre-wrap text-ink ${
          !open && long ? 'line-clamp-4' : ''
        }`}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`text-[11px] font-bold ${tone === 'future' ? 'text-ink/70' : 'text-accent'}`}
        >
          {open ? '접기 ↑' : '더 보기 ↓'}
        </button>
      ) : null}
    </div>
  )
}

function StatCard({ row, tone }: { row: ProfileDetailRow; tone?: 'future' }) {
  return (
    <article
      className={`rounded-[14px] border-2 border-border p-3 min-h-[72px] flex flex-col justify-between shadow-[3px_3px_0_0_rgba(20,22,28,1)] ${
        tone === 'future' ? 'bg-accent/30' : 'bg-surface'
      }`}
    >
      <p className="text-[10px] font-bold text-muted leading-tight">{row.label}</p>
      <p className="text-sm font-bold text-ink leading-snug mt-1">{row.value}</p>
    </article>
  )
}

function QuoteCard({ row, tone }: { row: ProfileDetailRow; tone?: 'future' }) {
  return (
    <article
      className={`rounded-[18px] border-2 border-border p-4 shadow-[4px_4px_0_0_rgba(20,22,28,1)] ${
        tone === 'future' ? 'bg-accent/35' : 'bg-surface'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted mb-2">{row.label}</p>
      <p className="text-[17px] font-extrabold leading-snug tracking-[-0.02em] text-ink">
        {row.value}
      </p>
    </article>
  )
}

function DilemmaCard({ row }: { row: ProfileDetailRow }) {
  const [choice, reason] = (row.value ?? '').split('\n\n')
  return (
    <article className="rounded-[18px] border-2 border-border bg-surface p-4 shadow-[4px_4px_0_0_rgba(20,22,28,1)] space-y-3">
      <p className="text-[11px] font-bold text-muted leading-snug">{row.label}</p>
      {choice ? (
        <p className="inline-block rounded-full border-2 border-border bg-accent/25 px-3 py-1.5 text-sm font-bold text-ink">
          {choice}
        </p>
      ) : null}
      {reason ? <p className="text-sm text-ink/80 leading-relaxed">{reason}</p> : null}
    </article>
  )
}

function StoryCard({ row, tone }: { row: ProfileDetailRow; tone?: 'future' }) {
  return (
    <article
      className={`rounded-[18px] border-2 border-border p-4 shadow-[3px_3px_0_0_rgba(20,22,28,1)] ${
        tone === 'future' ? 'bg-accent/20' : 'bg-surface'
      }`}
    >
      <p className="text-xs font-bold text-muted mb-2">{row.label}</p>
      {row.value ? <ExpandableText text={row.value} tone={tone} /> : null}
    </article>
  )
}

function ChipsCard({ row, tone }: { row: ProfileDetailRow; tone?: 'future' }) {
  return (
    <article
      className={`rounded-[18px] border-2 border-border p-4 shadow-[3px_3px_0_0_rgba(20,22,28,1)] ${
        tone === 'future' ? 'bg-accent/25' : 'bg-surface'
      }`}
    >
      <p className="text-xs font-bold text-muted mb-2.5">{row.label}</p>
      <div className="flex flex-wrap gap-1.5">
        {row.chips?.map((chip) => (
          <DetailChip key={chip} tone={tone}>
            {chip}
          </DetailChip>
        ))}
      </div>
    </article>
  )
}

function RowView({ row, tone }: { row: ProfileDetailRow; tone?: 'future' }) {
  if (row.kind === 'chips') return <ChipsCard row={row} tone={tone} />
  if (row.kind === 'quote') return <QuoteCard row={row} tone={tone} />
  if (row.kind === 'dilemma') return <DilemmaCard row={row} />
  if (row.kind === 'story') return <StoryCard row={row} tone={tone} />
  return <StatCard row={row} tone={tone} />
}

function GroupBlock({ group, tone }: { group: ProfileDetailGroup; tone?: 'future' }) {
  const stats = group.rows.filter((r) => r.kind === 'stat')
  const rest = group.rows.filter((r) => r.kind !== 'stat')

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-base leading-none" aria-hidden>
          {group.emoji}
        </span>
        <h3 className="text-sm font-extrabold text-ink tracking-[-0.02em]">{group.title}</h3>
        <span className="text-[10px] font-bold text-muted/60 ml-auto">{group.rows.length}</span>
      </div>

      {stats.length > 0 ? (
        <div className={`grid gap-2 ${stats.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {stats.map((row) => (
            <StatCard key={row.id} row={row} tone={tone} />
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {rest.map((row) => (
          <RowView key={row.id} row={row} tone={tone} />
        ))}
      </div>
    </section>
  )
}

function SectionPanel({ section }: { section: ProfileDetailSection }) {
  return (
    <div className="space-y-5">
      {section.groups.map((group) => (
        <GroupBlock key={group.id} group={group} tone={section.tone} />
      ))}
    </div>
  )
}

export function ProfileDetailSheet({ profile, onClose }: Props) {
  const sections = useMemo(() => buildProfileDetailSections(profile), [profile])
  const [tab, setTab] = useState<'present' | 'future'>(() => sections[0]?.id ?? 'present')

  const active = sections.find((s) => s.id === tab) ?? sections[0]
  const presentCount = sections.find((s) => s.id === 'present')?.groups.reduce((n, g) => n + g.rows.length, 0) ?? 0
  const futureCount = sections.find((s) => s.id === 'future')?.groups.reduce((n, g) => n + g.rows.length, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void/40 backdrop-blur-sm animate-fade-up">
      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto bg-void min-h-0">
        <header className="flex items-center justify-between px-5 py-4 border-b-2 border-border bg-surface shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-ink/5"
          >
            ← 돌아가기
          </button>
          <h2 className="text-base font-bold text-ink">프로필 설정</h2>
          <div className="w-[72px]" />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 pb-24 space-y-5">
          <div className="rounded-[22px] border-2 border-border bg-surface p-4 shadow-[5px_5px_0_0_rgba(20,22,28,1)]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl border-2 border-border chat-avatar flex items-center justify-center text-lg font-bold shrink-0 shadow-[3px_3px_0_0_rgba(20,22,28,0.2)]">
                {profile.name[0] ?? '나'}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-extrabold tracking-[-0.03em] text-ink truncate">
                  {profile.name || '이름 없음'}
                </h1>
                <p className="text-[11px] font-bold text-muted mt-0.5">
                  {presentCount + futureCount}개의 답변
                </p>
              </div>
            </div>
          </div>

          {sections.length > 1 ? (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-[18px] border-2 border-border bg-surface shadow-[3px_3px_0_0_rgba(20,22,28,1)]">
              {sections.map((section) => {
                const on = tab === section.id
                const count =
                  section.id === 'present'
                    ? presentCount
                    : futureCount
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setTab(section.id)}
                    className={`rounded-[14px] px-3 py-2.5 text-left transition-all ${
                      on
                        ? section.tone === 'future'
                          ? 'bg-accent/40 border-2 border-border shadow-[2px_2px_0_0_rgba(20,22,28,1)]'
                          : 'bg-surface border-2 border-border shadow-[2px_2px_0_0_rgba(20,22,28,1)]'
                        : 'border-2 border-transparent text-muted'
                    }`}
                  >
                    <p className={`text-sm font-extrabold ${on ? 'text-ink' : ''}`}>{section.title}</p>
                    <p className="text-[10px] font-bold mt-0.5 opacity-70">{count}개</p>
                  </button>
                )
              })}
            </div>
          ) : null}

          {!active ? (
            <p className="text-sm text-muted text-center py-8">아직 저장된 설정이 없어요.</p>
          ) : (
            <SectionPanel section={active} />
          )}
        </div>
      </div>
    </div>
  )
}
