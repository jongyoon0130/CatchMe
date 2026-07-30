import type { SelfProfile } from '../types/self'
import { ADVICE_TONE_LABELS, DILEMMA_SPECS, LIFE_DOMAIN_LABELS } from '../types/self'
import { FUTURE_YEARS_AHEAD } from './brand'
import { CONTINUITY_LABELS } from './onboardingConfig'
import { PERSONA_FIELDS } from './personaModel'

export type ProfileDetailRowKind = 'stat' | 'chips' | 'quote' | 'story' | 'dilemma'

export interface ProfileDetailRow {
  id: string
  label: string
  value?: string
  chips?: string[]
  kind: ProfileDetailRowKind
}

export interface ProfileDetailGroup {
  id: string
  title: string
  emoji: string
  rows: ProfileDetailRow[]
}

export interface ProfileDetailSection {
  id: 'present' | 'future'
  title: string
  tone?: 'future'
  groups: ProfileDetailGroup[]
}

const PRESENT_GROUPS: { id: string; title: string; emoji: string; keys: string[] }[] = [
  { id: 'snapshot', title: '한눈에', emoji: '👤', keys: ['age', 'mbti', 'currentRole', 'speechTone'] },
  { id: 'rhythm', title: '하루·리듬', emoji: '🌤', keys: ['lifeContext', 'stressMoment'] },
  { id: 'focus', title: '신경 쓰이는 것', emoji: '🎯', keys: ['concernDomains'] },
  { id: 'voice', title: '말투', emoji: '💬', keys: ['styleSample'] },
  { id: 'values', title: '가치·방향', emoji: '🧭', keys: ['corePriority', 'successDef', 'growthDirection'] },
  { id: 'mind', title: '속마음', emoji: '🫧', keys: ['fear', 'desire', 'avoidance', 'comfortTarget'] },
  { id: 'memory', title: '기억', emoji: '✨', keys: ['turningPoint', 'proudMoment'] },
  { id: 'choices', title: '선택의 기준', emoji: '⚖️', keys: [] },
]

const FUTURE_GROUPS: { id: string; title: string; emoji: string; keys: string[] }[] = [
  { id: 'identity', title: '한 줄 정의', emoji: '🪞', keys: ['identityLine'] },
  { id: 'domains', title: '잘 풀렸으면', emoji: '🌱', keys: ['thrivingDomains'] },
  { id: 'day', title: '평범한 하루', emoji: '📅', keys: ['typicalDay', 'careerDaily'] },
  { id: 'message', title: '미래의 한마디', emoji: '💌', keys: ['futureVoiceSample', 'adviceLine', 'adviceTone'] },
  { id: 'action', title: '이번 주', emoji: '👣', keys: ['weeklyAction'] },
  { id: 'life', title: '삶의 단면', emoji: '🏠', keys: ['career', 'income', 'relationship', 'health', 'homeLife'] },
  { id: 'path', title: '도달 이야기', emoji: '🛤', keys: ['throughline', 'achievement', 'obstacleOvercome', 'lesson'] },
  { id: 'shadow', title: '피한 길', emoji: '🌑', keys: ['fearedSelves', 'avoidedPath', 'regretThatWasnt'] },
  { id: 'shift', title: '변한 나', emoji: '🦋', keys: ['traitsShift', 'continuityScore', 'askAbout'] },
]

function fieldSpec(key: string) {
  return PERSONA_FIELDS.find((f) => f.key === key)
}

function rowKind(value: string, chips?: string[]): ProfileDetailRowKind {
  if (chips?.length) return 'chips'
  if (value.length <= 48) return 'stat'
  if (value.length <= 100) return 'quote'
  return 'story'
}

function makeRow(id: string, label: string, value: string, kind?: ProfileDetailRowKind): ProfileDetailRow {
  const trimmed = value.trim()
  return { id, label, value: trimmed, kind: kind ?? rowKind(trimmed) }
}

function makeChipRow(id: string, label: string, chips: string[]): ProfileDetailRow | null {
  const clean = chips.map((c) => c.trim()).filter(Boolean)
  if (!clean.length) return null
  return { id, label, chips: clean, kind: 'chips' }
}

function pushFieldRow(
  bucket: Map<string, ProfileDetailRow[]>,
  groupId: string,
  _key: string,
  row: ProfileDetailRow | null,
) {
  if (!row) return
  const list = bucket.get(groupId) ?? []
  list.push(row)
  bucket.set(groupId, list)
}

function pushTextField(
  bucket: Map<string, ProfileDetailRow[]>,
  groupId: string,
  key: string,
  value: string,
  kind?: ProfileDetailRowKind,
) {
  const spec = fieldSpec(key)
  if (!spec || !value.trim()) return
  pushFieldRow(bucket, groupId, key, makeRow(key, spec.label, value, kind))
}

function groupsFromBucket(
  defs: typeof PRESENT_GROUPS,
  bucket: Map<string, ProfileDetailRow[]>,
): ProfileDetailGroup[] {
  const out: ProfileDetailGroup[] = []
  for (const def of defs) {
    const rows = bucket.get(def.id) ?? []
    if (!rows.length) continue
    out.push({ id: def.id, title: def.title, emoji: def.emoji, rows })
  }
  return out
}

function groupForKey(section: 'present' | 'future', key: string): string {
  const defs = section === 'present' ? PRESENT_GROUPS : FUTURE_GROUPS
  for (const def of defs) {
    if (def.keys.includes(key)) return def.id
  }
  return section === 'present' ? 'snapshot' : 'life'
}

export function buildProfileDetailSections(profile: SelfProfile): ProfileDetailSection[] {
  const presentBucket = new Map<string, ProfileDetailRow[]>()

  if (profile.age > 0) {
    const ageVal = profile.ageBand?.trim()
      ? `${profile.age}세 · ${profile.ageBand.trim()}`
      : `${profile.age}세`
    pushFieldRow(presentBucket, 'snapshot', 'age', makeRow('age', '나이', ageVal, 'stat'))
  }
  if (profile.mbti?.trim()) {
    pushFieldRow(presentBucket, 'snapshot', 'mbti', makeRow('mbti', 'MBTI', profile.mbti, 'stat'))
  }

  for (const key of PRESENT_GROUPS.flatMap((g) => g.keys)) {
    if (key === 'age' || key === 'mbti') continue
    const groupId = groupForKey('present', key)
    if (key === 'concernDomains') {
      pushFieldRow(
        presentBucket,
        groupId,
        key,
        makeChipRow(
          key,
          fieldSpec(key)?.label ?? key,
          (profile.concernDomains ?? []).map((d) => LIFE_DOMAIN_LABELS[d] ?? d),
        ),
      )
      continue
    }
    if (key === 'styleSample') {
      const v = fieldSpec(key)?.get(profile) ?? ''
      pushTextField(presentBucket, groupId, key, v, 'quote')
      continue
    }
    const spec = fieldSpec(key)
    if (!spec) continue
    pushTextField(presentBucket, groupId, key, spec.get(profile))
  }

  for (const d of profile.dilemmas) {
    const spec = DILEMMA_SPECS.find((s) => s.id === d.id)
    const parts = [d.choice?.trim(), d.reason?.trim()].filter(Boolean)
    if (!parts.length) continue
    pushFieldRow(
      presentBucket,
      'choices',
      `dilemma-${d.id}`,
      makeRow(`dilemma-${d.id}`, spec?.prompt ?? '선택의 기준', parts.join('\n\n'), 'dilemma'),
    )
  }

  const futureBucket = new Map<string, ProfileDetailRow[]>()
  const f = profile.future

  for (const key of FUTURE_GROUPS.flatMap((g) => g.keys)) {
    const groupId = groupForKey('future', key)

    if (key === 'thrivingDomains') {
      pushFieldRow(
        futureBucket,
        groupId,
        key,
        makeChipRow(
          key,
          fieldSpec(key)?.label ?? key,
          (f.thrivingDomains ?? []).map((d) => LIFE_DOMAIN_LABELS[d] ?? d),
        ),
      )
      continue
    }
    if (key === 'fearedSelves') {
      pushFieldRow(futureBucket, groupId, key, makeChipRow(key, '피하고 싶은 미래', f.fearedSelves ?? []))
      continue
    }
    if (key === 'traitsShift') {
      pushFieldRow(futureBucket, groupId, key, makeChipRow(key, '변한 태도·성격', f.traitsShift ?? []))
      continue
    }
    if (key === 'adviceTone') {
      if (f.adviceTone) {
        pushFieldRow(
          futureBucket,
          groupId,
          key,
          makeRow(key, '조언 톤', ADVICE_TONE_LABELS[f.adviceTone], 'stat'),
        )
      }
      continue
    }
    if (key === 'continuityScore') {
      const score = f.continuityScore
      if (score > 0 && score <= 7) {
        const label = CONTINUITY_LABELS[score - 1]?.trim() || `${score}/7`
        pushFieldRow(
          futureBucket,
          groupId,
          key,
          makeRow(key, '미래 자아 연속성', `${score}/7 · ${label}`, 'stat'),
        )
      }
      continue
    }
    if (key === 'askAbout') {
      if (f.askAbout) {
        pushFieldRow(
          futureBucket,
          groupId,
          key,
          makeRow(key, '자주 묻고 싶은 주제', LIFE_DOMAIN_LABELS[f.askAbout] ?? f.askAbout, 'stat'),
        )
      }
      continue
    }
    if (key === 'identityLine' || key === 'adviceLine' || key === 'futureVoiceSample') {
      const spec = fieldSpec(key)
      if (!spec) continue
      pushTextField(futureBucket, groupId, key, spec.get(profile), 'quote')
      continue
    }
    const spec = fieldSpec(key)
    if (!spec) continue
    pushTextField(futureBucket, groupId, key, spec.get(profile))
  }

  const sections: ProfileDetailSection[] = []
  const presentGroups = groupsFromBucket(PRESENT_GROUPS, presentBucket)
  if (presentGroups.length) {
    sections.push({ id: 'present', title: '지금의 나', groups: presentGroups })
  }
  const futureGroups = groupsFromBucket(FUTURE_GROUPS, futureBucket)
  if (futureGroups.length) {
    sections.push({
      id: 'future',
      title: `${FUTURE_YEARS_AHEAD}년 뒤`,
      tone: 'future',
      groups: futureGroups,
    })
  }
  return sections
}
