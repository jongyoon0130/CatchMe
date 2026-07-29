/** 온보딩·프로필 원문 → 대시보드용 명사형 짧은 구 */

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

const FILLER_PREFIX = /^(그냥|사실|요즘|맨날|계속|진짜|솔직히|물론|일단|그래도|근데|그런데)\s*/g
const FILLER_SUFFIX =
  /\s*(?:거든|거든요|잖아|네요|어요|아요|이야|야|해|함|중이야|중|니까|는데|지만|하다|할\s*거|했을\s*거|일\s*거)\.?$/g

function stripFillers(text: string): string {
  let s = text.trim().replace(/\s+/g, ' ')
  for (let i = 0; i < 3; i++) {
    const next = s.replace(FILLER_PREFIX, '').replace(FILLER_SUFFIX, '').trim()
    if (next === s) break
    s = next
  }
  return s
}

/** 의미 패턴 → 명사형 라벨 */
const PHRASE_RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /창업|스타트업|1인\s*사업/, label: '창업 집중' },
  { pattern: /앱\s*(개발|구상|만들)|방향성?\s*(을?\s*)?(정|잡)/, label: '앱·방향 설정' },
  { pattern: /헬스|체육관|운동/, label: '운동·헬스' },
  { pattern: /풋살/, label: '풋살' },
  { pattern: /여자친구|남자친구|연애|여친|남친/, label: '연애·관계' },
  { pattern: /스트레스\s*풀|해소/, label: '스트레스 해소' },
  { pattern: /노력.*(따라|부족|못)|실행.*(부족|안)/, label: '목표-실행 갭' },
  { pattern: /목표.*(크|큰)/, label: '큰 목표' },
  { pattern: /워라밸|work.?life/, label: '워라밸 포기' },
  { pattern: /건강.*(먹|식|루틴)|아침.*(일어나|먹)/, label: '건강 루틴' },
  { pattern: /쓸데없.*걱정|걱정.*(시간|줄)/, label: '걱정 ↓ 실행 ↑' },
  { pattern: /머리\s*박|파고\s*들/, label: '깊은 몰입' },
  { pattern: /열심히|열중|몰입|집중/, label: '몰입·집중' },
  { pattern: /미래.*(알\s*수\s*없|모름|불확)/, label: '불확실성 수용' },
  { pattern: /나쁘지\s*않|괜찮/, label: '전반적 안정' },
  { pattern: /대학|학년|학교|취준|구직/, label: '학업·커리어 전환기' },
  { pattern: /돈|수입|경제/, label: '경제·수입' },
  { pattern: /성장|발전/, label: '성장 지향' },
  { pattern: /인정|칭찬|인정받/, label: '인정 욕구' },
  { pattern: /실패|두려|무서/, label: '실패·거절 두려움' },
  { pattern: /번아웃|지침|녹초|힘들/, label: '번아웃·피로' },
  { pattern: /완벽|미루| procrast/, label: '완벽주의·미루기' },
  { pattern: /저축|가계/, label: '재정 관리' },
  { pattern: /창업가|CEO|대표/, label: '창업가' },
  { pattern: /개발자|엔지니어|코딩/, label: '개발·엔지니어링' },
]

function matchPhraseRules(text: string): string | null {
  for (const { pattern, label } of PHRASE_RULES) {
    if (pattern.test(text)) return label
  }
  return null
}

/** 절(clause) → 명사형 2~12자 */
export function toNominalPhrase(text: string | undefined, maxLen = 14): string {
  const raw = text?.trim().replace(/\s+/g, ' ') ?? ''
  if (!raw) return ''

  const ruled = matchPhraseRules(raw)
  if (ruled) return ruled

  let s = stripFillers(raw)
  s = s
    .replace(/\?+$/, '')
    .replace(/(하고|하며|해서|하니까|하는|하려|하다|할|함|해|했|였|였어|이었|였을)\s*$/g, '')
    .replace(/(이|가|을|를|은|는|에|에서|으로|로|와|과|도|만)\s*$/g, '')
    .trim()

  // 남은 동사 stem → 명사형 힌트
  if (/집중|열중/.test(s)) return '집중·몰입'
  if (/걱정/.test(s)) return '걱정'
  if (/노력/.test(s)) return '노력·실행'
  if (/목표/.test(s)) return '목표 지향'

  // 너무 길면 핵심 명사만
  const tokens = s.split(/\s+/).filter((w) => w.length >= 2)
  if (tokens.length >= 2) {
    const short = tokens.slice(0, 2).join(' ')
    return clip(short, maxLen)
  }

  return clip(s, maxLen)
}

/** 텍스트 전체에서 테마 태그 추출 (중복 제거) */
export function extractThemeTags(text: string | undefined, max = 6): string[] {
  const raw = text?.trim() ?? ''
  if (!raw) return []

  const tags: string[] = []
  const add = (label: string) => {
    if (!label) return
    if (tags.some((t) => t === label || t.includes(label) || label.includes(t))) return
    tags.push(label)
  }

  for (const { pattern, label } of PHRASE_RULES) {
    if (pattern.test(raw)) add(label)
  }

  const clauses = raw.split(/[,.\n!?]|(?:\s+고\s+|\s+는데\s+|\s+지만\s+|\s+그리고\s+)/)
  for (const clause of clauses) {
    const phrase = toNominalPhrase(clause, 12)
    if (phrase.length >= 2 && phrase.length <= 14) add(phrase)
    if (tags.length >= max) break
  }

  return tags.slice(0, max)
}

/** 한 줄 요약 — 명사형, 대시보드 stat용 */
export function toDashboardValue(text: string | undefined, maxLen = 20): string {
  const raw = text?.trim().replace(/\s+/g, ' ') ?? ''
  if (!raw) return ''

  const ruled = matchPhraseRules(raw)
  if (ruled) return ruled

  const first = raw.split(/(?<=[.!?…])\s+|\n+/)[0]?.trim() ?? raw
  const nominal = toNominalPhrase(first, maxLen)
  if (nominal.length >= 2) return nominal

  return clip(stripFillers(first), maxLen)
}

/** 편지·조언 → 핵심 메시지 한 줄 */
export function toCoreMessage(text: string | undefined): string {
  const raw = text?.trim() ?? ''
  if (!raw) return ''

  const ruled = matchPhraseRules(raw)
  if (ruled) return ruled

  // 명령/조언 패턴
  if (/걱정.*(말|하지|줄|덜)/.test(raw) || /머리\s*박/.test(raw)) return '걱정 ↓ 실행 ↑'
  if (/완벽.*(기다|하지)/.test(raw)) return '완벽주의 경계'
  if (/비교.*(말|하지)/.test(raw)) return '비교 ↓ 자기 페이스'
  if (/미루/.test(raw)) return '미루기 끊기'
  if (/괜찮|충분|잘\s*하고/.test(raw)) return '지금 속도 신뢰'

  return toDashboardValue(raw, 22)
}

/** 말투 샘플 → 키워드만 (원문 노출 X) */
export function toVoiceKeywords(text: string | undefined): string[] {
  const tags = extractThemeTags(text, 4)
  if (tags.length) return tags
  const nominal = toNominalPhrase(text, 12)
  return nominal ? [nominal] : []
}

/** 프로필 헤더용 — 나이·역할을 짧은 키워드 칩으로 (줄글 X) */
export function buildProfileHeaderChips(profile: {
  age?: number
  currentRole?: string
  lifeContext?: string
}): string[] {
  const chips: string[] = []
  const seen = new Set<string>()

  const add = (label: string) => {
    const t = label.trim().replace(/\s+/g, ' ')
    if (t.length < 2 || t.length > 14) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    chips.push(t)
  }

  if (profile.age && profile.age > 0) add(`${profile.age}세`)

  const role = profile.currentRole?.trim() ?? ''
  const ctx = profile.lifeContext?.trim() ?? ''
  const text = [role, ctx].filter(Boolean).join(' ')

  const gradeM = role.match(/(?:대학(?:교)?\s*)?(\d)\s*학년|대\s*(\d)(?:\D|$)|(\d)\s*학년/)
  if (gradeM) {
    const n = gradeM[1] || gradeM[2] || gradeM[3]
    add(`대학교 ${n}학년`)
  } else if (/대학생|대학\s*재학|재학\s*중/.test(role)) {
    add('대학생')
  }

  const tenureM = role.match(/(\d+)\s*년\s*차|(\d+)년차/)
  if (tenureM) add(`${tenureM[1] || tenureM[2]}년차`)

  if (/창업\s*(준비|하고\s*싶|희망|중)|스타트업\s*(준비|준)|창업.*준비/.test(text)) add('창업 준비')
  else if (/창업|스타트업|1인\s*사업/.test(text)) add('창업')

  if (/취준|구직|취업\s*준비/.test(text)) add('취업 준비')
  if (/인턴/.test(text)) add('인턴')
  if (/휴학/.test(text)) add('휴학')
  if (/백엔드/.test(text)) add('백엔드')
  if (/프론트/.test(text)) add('프론트')
  if (/개발자|개발\s*자/.test(text) && !chips.some((c) => c.includes('개발'))) add('개발')

  if (/IT\s*회사|회사\s*다니|직장/.test(role) && !tenureM) {
    add(/IT|테크|개발/.test(role) ? 'IT 직장' : '직장인')
  }

  if (chips.length <= 1 && role) {
    for (const clause of role.split(/[,.\n!?]|(?:\s+고\s+|\s+는데\s+|\s+지만\s+)/)) {
      const chip = clauseToHeaderChip(clause)
      if (chip) add(chip)
      if (chips.length >= 4) break
    }
  }

  if (chips.length <= 1 && ctx) {
    for (const tag of extractThemeTags(ctx, 2)) add(tag)
  }

  if (chips.length === 0) add('지금의 나')

  return chips.slice(0, 5)
}

/** 미래 프로필 칩 — 졸업·스타트업·사업가 등 */
export function buildFutureHeaderChips(future: {
  identityLine?: string
  typicalDay?: string
  career?: string
  achievement?: string
  traitsShift?: string[]
  thrivingDomains?: string[]
}): string[] {
  const chips: string[] = []
  const seen = new Set<string>()

  const add = (label: string) => {
    const t = label.trim().replace(/\s+/g, ' ')
    if (t.length < 2 || t.length > 14) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    chips.push(t)
  }

  const text = [
    future.identityLine,
    future.career,
    future.achievement,
    future.typicalDay,
  ]
    .filter(Boolean)
    .join(' ')

  if (/졸업/.test(text)) add('졸업')
  if (/사업가|CEO|대표|창업가/.test(text)) add('사업가')
  else if (/스타트업/.test(text)) add('스타트업')
  else if (/창업/.test(text)) add('창업')

  if (/팀|동료|함께\s*일|co.?founder/i.test(text)) add('팀 빌딩')
  if (/개발|엔지니어|프로덕트/.test(text)) add('프로덕트')
  if (/워라밸|work.?life/i.test(text)) add('몰입형')
  if (/건강|루틴|운동/.test(text)) add('건강 루틴')

  if (future.career?.trim()) {
    const c = toDashboardValue(future.career, 12)
    if (c.length >= 2) add(c)
  }
  if (future.achievement?.trim()) {
    const a = toDashboardValue(future.achievement, 12)
    if (a.length >= 2) add(a)
  }

  for (const trait of future.traitsShift ?? []) {
    const t = toNominalPhrase(trait, 10)
    if (t) add(t)
    if (chips.length >= 5) break
  }

  for (const domain of future.thrivingDomains ?? []) {
    add(domain)
    if (chips.length >= 5) break
  }

  for (const tag of extractThemeTags(future.identityLine, 4)) add(tag)
  if (chips.length < 3) {
    for (const tag of extractThemeTags(future.typicalDay, 2)) add(tag)
  }

  return chips.slice(0, 5)
}

/** 지금 / 미래 한 줄 요약 */
export function buildPresentSummaryLine(profile: {
  lifeContext?: string
  corePriority?: string
  currentRole?: string
}): string {
  return (
    toDashboardValue(profile.lifeContext, 36) ||
    toDashboardValue(profile.corePriority, 36) ||
    toDashboardValue(profile.currentRole, 36)
  )
}

export function buildFutureSummaryLine(future: {
  identityLine?: string
  career?: string
  achievement?: string
}): string {
  return (
    toDashboardValue(future.identityLine, 40) ||
    toDashboardValue(future.career, 36) ||
    toDashboardValue(future.achievement, 36)
  )
}

/** 미래 조언 → 프로필용 한 마디 */
export function toAdviceQuote(text: string | undefined): string {
  const raw = text?.trim() ?? ''
  if (!raw) return ''

  const core = toCoreMessage(raw)
  if (core.length >= 4 && core.length <= 48) return core

  const first = raw.split(/(?<=[.!?…])\s+|\n+/)[0]?.trim() ?? raw
  return clip(stripFillers(first), 48)
}

function clauseToHeaderChip(clause: string): string {
  let s = stripFillers(clause.trim())
    .replace(/^(현재는|지금은|나는|저는|그\s*)\s*/i, '')
    .replace(/(을|를|이|가)\s+/g, ' ')
    .replace(/(이야|야|입니다|이에요|예요|거든|중이야|중입니다|하고\s*싶)\.?$/g, '')
    .trim()

  if (/^준비\s*중/.test(s)) return '준비 중'
  if (s.length >= 2 && s.length <= 12) return s

  const nominal = toNominalPhrase(s, 10)
  return nominal.length >= 2 && nominal.length <= 12 ? nominal : ''
}

/** 역할·상황 한 줄 */
export function toRoleLabel(text: string | undefined): string {
  const raw = text?.trim() ?? ''
  if (!raw) return ''

  if (/대학|학년/.test(raw) && /창업/.test(raw)) return '대학생 · 창업 준비'
  if (/대학|학년/.test(raw)) return clip(toNominalPhrase(raw, 24), 24)
  if (/창업/.test(raw) && /앱/.test(raw)) return '창업 · 앱 개발'
  if (/창업/.test(raw)) return '창업 준비'
  if (/취준|구직/.test(raw)) return '구직·취업 준비'
  if (/직장|회사|년차/.test(raw)) return clip(toNominalPhrase(raw, 28), 28)

  return toDashboardValue(raw, 28)
}

/** 태그라인 — 3개 키워드 조합 */
export function toTagline(parts: (string | undefined)[]): string {
  const labels = parts
    .map((p) => (p ? toDashboardValue(p, 16) : ''))
    .filter(Boolean)
  return [...new Set(labels)].slice(0, 3).join(' · ')
}

export { clip as clipPhrase }
