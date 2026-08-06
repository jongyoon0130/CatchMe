// 채점표·후보생성이 함께 쓰는 고정 데이터.
// 계획표가 비어 있으면 "근거 있는 당근"이 원리상 불가능해서 C·F·H가 늘 실패한다.
import { emptyProfile } from '../src/types/self'

const dayKey = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 계획표 데이터 — 없으면 "근거 있는 당근"이 원리상 불가능하다.
 * 오늘은 일부만 완료, 어제는 하나 밀림 → 반례(C)와 채찍(C-2)이 둘 다 나올 수 있는 상태.
 */
export function seedGoalData(): void {
  const owner = 'eval-owner'
  localStorage.setItem('goal-app-owner-id', owner)
  localStorage.setItem(
    `goal-misc-todos-${owner}`,
    JSON.stringify([
      { id: 'm1', label: '아침 스트레칭', done: true, tier: 'daily', periodKey: dayKey(0) },
      { id: 'm2', label: '운동 30분', done: false, tier: 'daily', periodKey: dayKey(0) },
      { id: 'm3', label: '이력서 고치기', done: false, tier: 'daily', periodKey: dayKey(-1) },
      { id: 'm4', label: '장보기', done: true, tier: 'daily', periodKey: dayKey(-1) },
      { id: 'm5', label: '영어 스터디', done: false, tier: 'daily', periodKey: dayKey(1) },
    ]),
  )
  localStorage.setItem(
    `goal-plans-${owner}`,
    JSON.stringify([
      {
        id: 'plan-1',
        profileId: owner,
        templateType: 'backplan',
        title: '영어 회화 자신감 붙이기',
        intake: { goal: '영어', deadline: dayKey(60), successCriteria: '', progress: 'in_progress' },
        sections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hierarchy: {
          horizon: 'day-only', rangeLabel: '이번 달', focus: '영어 회화',
          startDate: dayKey(-30), deadline: dayKey(60), months: [], weeks: [],
          days: [{ id: 'd1', dateLabel: '오늘', dayOfWeek: '', focus: '', items: [{ id: 't1', label: '영어 표현 10개', done: false }] }],
          currentWeekId: '',
        },
      },
    ]),
  )
}

export function makeProfile() {
  const base = emptyProfile()
  return {
    ...base,
    name: '지웅',
    age: 25,
    speechTone: '친근한 반말',
    comfortTarget: '네 페이스대로 가도 돼',
    lifeContext: '앱 만들면서 취업 준비 중',
  }
}

