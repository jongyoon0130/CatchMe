import { describe, expect, it } from 'vitest'
import { emptyProfile } from '../src/types/self'
import { buildProfileDetailSections } from '../src/lib/profileDetail'

describe('buildProfileDetailSections', () => {
  it('지금·미래 답변을 섹션으로 나눈다', () => {
    const p = emptyProfile()
    p.age = 24
    p.currentRole = '대학교 3학년'
    p.lifeContext = '창업 준비 중'
    p.concernDomains = ['work', 'growth']
    p.future.identityLine = '사업가'
    p.future.typicalDay = '아침 운동 후 오전에 집중해서 일한다.'
    p.future.adviceLine = '창업 집중'

    const sections = buildProfileDetailSections(p)
    expect(sections).toHaveLength(2)
    expect(sections[0]?.id).toBe('present')
    const presentRow = sections[0]?.groups.flatMap((g) => g.rows).find((r) => r.label === '지금 역할·상황')
    expect(presentRow).toBeTruthy()
    expect(sections[1]?.id).toBe('future')
    const futureRow = sections[1]?.groups.flatMap((g) => g.rows).find((r) => r.value?.includes('사업가'))
    expect(futureRow).toBeTruthy()
  })
})
