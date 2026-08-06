// ---------------------------------------------------------------------------
// 채팅 채점표 — 케이스와 기준. **여기가 지웅님이 자주 만지는 파일.**
//
// 케이스 추가는 한 줄이면 된다:
//   { id: 'A5', group: 'A 일상', turns: ['오늘 야근이야'], expect: ['noAskBack', 'hasExperience'] }
//
// 쓰다가 짜증나는 답이 나오면 **그 말을 그대로** 케이스로 붙일 것.
// 문서(docs/chat-cases.md)에 적어둔 대로, 실사용에서 나온 케이스가 표본보다 값지다.
// 한 번 붙여두면 다시는 조용히 망가지지 않는다.
// ---------------------------------------------------------------------------

export type CheckId = keyof typeof CHECKS

export interface ChatCase {
  id: string
  group: string
  /** user가 차례로 하는 말. 2개 이상이면 여러 턴 대화 — 마지막 답을 채점한다. */
  turns: string[]
  expect: CheckId[]
  /** 이 케이스가 무엇을 지키는지 (실패했을 때 읽는 사람용) */
  note?: string
}

/**
 * 규칙 채점 — 정규식이라 거칠다. 여기서 통과했다고 좋은 답인 건 아니고,
 * **여기서 걸리면 확실히 나쁜 답**이다. 그 방향으로만 믿을 것.
 */
export const CHECKS = {
  noAskBack: {
    label: '되묻지 않음',
    test: (r: string) => !/[?？]\s*$/.test(r.trim()),
  },
  askBack: {
    label: '되물음(여긴 맞음)',
    test: (r: string) => /[?？]\s*$/.test(r.trim()),
  },
  /**
   * 가벼운 되묻기("배 좀 불러?", "너 지금 밖이야?")는 **친구답다** — 막으면 안 된다.
   * 막아야 하는 건 캐묻기·심문·양자택일 취조다. docs/chat-cases.md A3 참고:
   * "실패 조건은 질문 금지가 아니라 과제형·캐묻기 질문 금지."
   */
  noInterrogation: {
    label: '캐묻기·심문 없음',
    test: (r: string) =>
      !/(왜 그|이유가|무슨 일|뭐가 제일|제일 .{0,8}(게|건|이) (뭐|어)|기분(은|이)? 어때|아니면 .{0,16}[야어지][?？])/.test(r),
  },
  hasExperience: {
    label: '겪어본 한 줄',
    test: (r: string) => /(그때|나도|내가|되더라|하더라|기억도 안|쌓이)/.test(r),
  },
  noCoachCliche: {
    label: '코칭 클리셰 없음',
    test: (r: string) =>
      !/(하나만|먼저 해보|일단 .{0,6}부터|작은 거|작게 하나|해볼래|시작해볼|정리해보자)/.test(r),
  },
  noEcho: {
    label: '상담사 맞장구 없음',
    test: (r: string) =>
      !/(라는 거지|라는 말|충분히 이해|그 마음 (알|이해)|힘들었겠|많이 힘들|고생했겠)/.test(r),
  },
  noEmotionAssert: {
    label: '기분 단정 없음',
    test: (r: string) => !/(개운하|뿌듯하|후련하|기분(이|은) 좋)(겠|네|지)/.test(r),
  },
  short: {
    label: '3문장 이하',
    test: (r: string) => r.split(/[.!?。\n]+/).filter((s) => s.trim()).length <= 3,
  },
  noQuestionSpam: {
    label: '질문 1개 이하',
    test: (r: string) => (r.match(/[?？]/g) ?? []).length <= 1,
  },
  /** 계획표에 실제로 있는 것을 짚었는가 — 반례(당근)의 재료 (run.ts가 심는 데이터와 짝) */
  usesPlanData: {
    label: '계획표 근거 인용',
    test: (r: string) => /(이력서|운동|영어|어제|아침|오늘)/.test(r),
  },
} satisfies Record<string, { label: string; test: (reply: string) => boolean }>

// ---------------------------------------------------------------------------
// 케이스 — docs/chat-cases.md의 A~F 14개 + 문서에 없던 구멍들
// ---------------------------------------------------------------------------
export const CASES: ChatCase[] = [
  // A. 일상 공유 — 그냥 옆에 있어주면 되는 자리.
  //    **가벼운 되묻기는 허용**(지웅, 2026-08-06 실측 판단). 캐묻기만 막는다.
  { id: 'A1', group: 'A 일상', turns: ['지금 공부하고 작업하려고 카페 왔어.'], expect: ['noInterrogation', 'hasExperience', 'short'] },
  { id: 'A2', group: 'A 일상', turns: ['오늘 헬스장 다녀왔어'], expect: ['noInterrogation', 'noCoachCliche', 'short'] },
  { id: 'A3', group: 'A 일상', turns: ['방금 점심 먹었어ㅋㅋ'], expect: ['noInterrogation', 'noCoachCliche', 'short'] },
  { id: 'A4', group: 'A 일상', turns: ['비 엄청 온다'], expect: ['noInterrogation', 'noCoachCliche', 'short'] },

  // B. 성취 — 당근을 줘야 하는 순간
  { id: 'B1', group: 'B 성취', turns: ['오늘 할 일 다 끝냈어!'], expect: ['noInterrogation', 'hasExperience', 'noEmotionAssert'], note: '"기분은 좀 개운하네" 재발 방지 (실사용 발견)' },
  { id: 'B2', group: 'B 성취', turns: ['3일째 운동 성공했다'], expect: ['noInterrogation', 'hasExperience', 'noCoachCliche'] },

  // C. 실패·미룸 — 반례가 나와야 하는 자리 (계획표 데이터 필요).
  //    여기부턴 **자책·감정 구간**이라 되묻기 자체를 막는다.
  { id: 'C1', group: 'C 자책', turns: ['오늘 아무것도 못했어'], expect: ['noEcho', 'noCoachCliche', 'usesPlanData', 'noInterrogation'], note: 'ㄱ) 반례 — 실제로 한 것을 짚어야' },
  { id: 'C2', group: 'C 자책', turns: ['또 미뤘어...'], expect: ['noAskBack', 'noEcho', 'noCoachCliche', 'noInterrogation'] },

  // D. 힘듦 — 되묻기 금지 구역
  { id: 'D1', group: 'D 힘듦', turns: ['하... 힘들다'], expect: ['noAskBack', 'noEcho', 'noCoachCliche', 'noInterrogation'], note: '"특히 찌르는 순간 하나 있었어?" 재발 방지' },
  { id: 'D2', group: 'D 힘듦', turns: ['요즘 좀 우울해'], expect: ['noAskBack', 'noEcho', 'noCoachCliche', 'noInterrogation'] },

  // E. 고민·결정 — 여기선 되묻기가 **맞다**. "되묻지 마"를 너무 밀면 여기가 죽는다.
  { id: 'E1', group: 'E 고민', turns: ['창업하고 싶은데 실패할까봐 무서워'], expect: ['noEcho', 'noQuestionSpam'] },
  { id: 'E2', group: 'E 고민', turns: ['이직할지 말지 고민이야'], expect: ['askBack', 'noQuestionSpam'], note: '여기서 askBack이 깨지면 되묻기를 과하게 죽인 것' },

  // F. 실행 요청 — 여기선 행동 제안이 **맞다**
  { id: 'F1', group: 'F 실행', turns: ['뭐부터 해야 할지 모르겠어'], expect: ['noQuestionSpam', 'usesPlanData'] },
  { id: 'F2', group: 'F 실행', turns: ['나 좀 쓴소리 해줘. 계속 미루고 있어.'], expect: ['noEcho'] },

  // ---- 문서(14개)에 없던 구멍들 ----

  // G. 여러 턴 — "대화가 길어질수록 코치가 된다"는 한 마디로는 재현이 안 된다
  {
    id: 'G1',
    group: 'G 다중턴',
    turns: ['카페 왔어', '커피 시켰어', '자리도 좋네'],
    expect: ['noInterrogation', 'noCoachCliche', 'short'],
    note: '턴이 쌓여도 코치로 변하지 않는지 — lite 프롬프트 구간',
  },
  {
    id: 'G2',
    group: 'G 다중턴',
    turns: ['오늘 좀 지쳤어', '그냥 아무것도 하기 싫다'],
    expect: ['noAskBack', 'noCoachCliche', 'noInterrogation'],
    note: '힘듦이 이어질 때 결국 과제를 밀지 않는지',
  },

  // H. 일정 질문 — 지어내기(없는 시간 말하기) 검증
  { id: 'H1', group: 'H 일정', turns: ['나 내일 뭐 있지?'], expect: ['usesPlanData'], note: '계획표에 있는 것만 말해야 — 지어내면 신뢰가 깨진다' },

  // I. 짧은 말 — few-shot엔 있는데 케이스 표엔 없던 것
  { id: 'I1', group: 'I 짧은말', turns: ['야 뭐해'], expect: ['short', 'noCoachCliche'] },
]

// ---------------------------------------------------------------------------
// 변형 — 같은 케이스에 **다른 지시**를 줘서 후보를 여러 개 만든다.
//
// 규칙 채점으로는 "미래의 나다운가"를 못 잰다. 대신 여러 답을 나란히 놓고
// 지웅님이 고르면, 그 선택이 쌓여서 **진짜 기준**이 된다.
// 어느 변형이 자주 이기는지가 곧 프롬프트를 어디로 밀지 알려준다.
//
// docs/chat-cases.md의 "미래의 나다움 3형태"가 ②③④에 그대로 대응한다.
// ---------------------------------------------------------------------------
export interface Variant {
  id: string
  label: string
  /** 프롬프트 맨 끝에 "이번 답변의 추가 지시"로 붙는다. 빈 문자열이면 지금 프롬프트 그대로. */
  instruction: string
}

export const VARIANTS: Variant[] = [
  { id: 'base', label: '지금 그대로', instruction: '' },
  {
    id: 'past',
    label: '① 겪어봤다',
    instruction: '**그때의 내 이야기**를 한 줄 얹어라. 조언·과제는 붙이지 마라.',
  },
  {
    id: 'outcome',
    label: '② 결과를 안다',
    instruction:
      '결과를 이미 아는 사람으로 답해라 — "그거 결국 이렇게 되더라" 쪽. **과거 회상("나도 그때~")은 쓰지 마라.**',
  },
  {
    id: 'timescale',
    label: '③ 시간 스케일',
    instruction:
      '시간 스케일로 받아라 — "그 하루는 지금 기억도 안 나" 쪽. **과거 회상·조언은 쓰지 마라.**',
  },
  {
    id: 'plain',
    label: '④ 그냥 옆에',
    instruction:
      '경험담·회상을 **넣지 마라.** 지금 옆에 있는 사람처럼 짧게 반응만 해라.',
  },
]

// ---------------------------------------------------------------------------
// 추가 케이스 — 실사용에서 자주 나올 상황들 (2026-08-06)
// ---------------------------------------------------------------------------
export const MORE_CASES: ChatCase[] = [
  { id: 'J1', group: 'J 관계', turns: ['친구랑 좀 틀어졌어'], expect: ['noEcho'] },
  { id: 'J2', group: 'J 관계', turns: ['부모님이랑 싸웠어'], expect: ['noEcho', 'noCoachCliche'] },
  { id: 'K1', group: 'K 몸', turns: ['요즘 잠을 잘 못 자'], expect: ['noEcho'] },
  { id: 'K2', group: 'K 몸', turns: ['머리가 좀 아프네'], expect: ['noCoachCliche', 'short'] },
  { id: 'L1', group: 'L 자랑', turns: ['나 오늘 칭찬받았어'], expect: ['noInterrogation', 'short'] },
  { id: 'L2', group: 'L 허무', turns: ['다 끝냈는데 왜 허무하지'], expect: ['noCoachCliche', 'noEcho'] },
  { id: 'M1', group: 'M 비교', turns: ['친구는 벌써 취업했더라'], expect: ['noEcho', 'noCoachCliche'] },
  { id: 'M2', group: 'M 돈', turns: ['돈 모으는 게 너무 안 되네'], expect: ['noEcho'] },
  { id: 'N1', group: 'N 심심', turns: ['심심하다'], expect: ['short', 'noCoachCliche'] },
  { id: 'N2', group: 'N 짜증', turns: ['아 진짜 짜증나'], expect: ['noInterrogation', 'noCoachCliche'] },
  { id: 'O1', group: 'O 새벽', turns: ['잠이 안 와'], expect: ['noCoachCliche', 'short'] },
  { id: 'O2', group: 'O 계획변경', turns: ['오늘 계획 다 미뤄야 할 것 같아'], expect: ['noEcho', 'noInterrogation'] },
]

/** 채점표·후보생성 둘 다 이걸 쓴다 */
export const ALL_CASES: ChatCase[] = [...CASES, ...MORE_CASES]
