// ---------------------------------------------------------------------------
// 채팅 채점표 — 케이스와 기준. **여기가 지웅님이 자주 만지는 파일.**
//
// 케이스 추가는 한 줄이면 된다:
//   { id: 'A5', group: 'A 일상', turns: ['오늘 야근이야'], expect: ['hasExperience'] }
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
  /**
   * ⚠️ **한 방 케이스에는 걸지 않는다.** 지웅님이 직접 쓴 답에서 D2 "왜 우울한 거 같아?",
   * G2 "왜 지친 거 같아?", O1 "왜?" 처럼 **감정 자리에서도 되묻는다**(2026-08-06).
   * 막을 것은 질문이 아니라 할 일 캐묻기(noTaskDigging)다.
   *
   * 대신 **여러 턴 케이스(MT1~MT3)에서만 쓴다**(2026-08-11). 거기선 이미 사건을 다
   * 들은 뒤라 되묻기가 도망이다 — "모르는 동안은 묻고, 알고 나면 닫거나 민다".
   */
  noAskBack: {
    label: '되묻지 않음',
    test: (r: string) => !/[?？]\s*$/.test(r.trim()),
  },
  askBack: {
    label: '되물음(여긴 맞음)',
    test: (r: string) => /[?？]\s*$/.test(r.trim()),
  },
  /**
   * 질문 자체는 막지 않는다. 지웅님이 직접 쓴 30개 중 **12개가 질문**이었고
   * "왜 우울한 거 같아?" "무슨 일인데?" "약은 먹었어?" 전부 본인 답이다(2026-08-06).
   * 막을 것은 **할 일·계획을 캐는 질문**뿐 — 그게 코치처럼 느껴지는 지점이다.
   */
  noTaskDigging: {
    label: '할 일 캐묻기 없음',
    test: (r: string) =>
      !/(어떤 (작업|일|것|거)부터|뭐부터 (할|하려|시작)|언제까지|몇 개.{0,4}(남|했)|계획.{0,4}(뭐|어때)|우선순위)/.test(r),
  },
  /**
   * 자유롭게 쓸 때 지웅님 답은 **중앙값 15자**다(2026-08-06 새 10개).
   * 기존 30개가 32자였던 건 후보 5개를 보고 고쳐 쓴 탓(앵커링)으로 보인다.
   * 긴 하소연에도 짧게 받는 게 지웅님 방식 — 긴 말에 긴 답을 하지 않는다.
   */
  veryShort: {
    label: '아주 짧게(60자)',
    test: (r: string) => r.trim().length <= 60,
  },
  /**
   * 앱이 못 하는 일을 **했다고 말하면** 그 자리에서 신뢰가 깨진다.
   * 계획표 추가는 user가 메시지를 꾹 눌러 보내는 방식이라, 채팅이 직접 못 넣는다.
   */
  noFakeAction: {
    label: '거짓말 안 함',
    test: (r: string) => !/(넣어(뒀|놨|둘게|놓을게)|추가(했|해뒀|해놨)|등록(했|해뒀)|저장(했|해뒀)|적어(뒀|놨))/.test(r),
  },
  /** "너 AI야?"에 AI라고 인정하면 캐릭터가 깨진다 — 지웅님 답: "아니ㅋㅋㅋ 미래의 너지" */
  staysInCharacter: {
    label: '미래의 나 유지',
    test: (r: string) => !/(AI|인공지능|언어\s?모델|챗봇|프로그램이)/i.test(r),
  },
  /** 지웅님은 '나도'(2개)보다 '~더라'(9개)를 훨씬 많이 쓴다 — 둘 다 인정 */
  hasExperience: {
    label: '겪어본 한 줄',
    test: (r: string) => /(그때|나도|더라|기억도 안|쌓이)/.test(r),
  },
  /** 응원("화이팅", "같이 하자")은 지웅님이 직접 쓴다 — 막지 않는다. 과제 지정만 막는다. */
  noCoachCliche: {
    label: '과제 밀기 없음',
    test: (r: string) => !/(하나만 (해|잡)|작은 거 하나|정리해보자|체크리스트|계획을 세워)/.test(r),
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
  /**
   * 문장 수가 아니라 **글자 수**로 잰다 — "그래? 밖이야? 우산은 챙겼어?"는
   * 3문장이지만 짧다. 지웅님 답 30개: 중앙값 33자, 90%가 66자 이내(최대 104).
   * 110자를 넘으면 모델이 말을 채우고 있다는 뜻이다.
   */
  short: {
    label: '짧게(110자 이내)',
    test: (r: string) => r.trim().length <= 110,
  },
  /** 지웅님 답에도 물음표 2~3개짜리가 5개 있다("A야? 아니면 B야?"). 3개부터 취조. */
  noQuestionSpam: {
    label: '질문 2개 이하',
    test: (r: string) => (r.match(/[?？]/g) ?? []).length <= 2,
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
  { id: 'A1', group: 'A 일상', turns: ['지금 공부하고 작업하려고 카페 왔어.'], expect: ['noTaskDigging', 'hasExperience', 'short'] },
  { id: 'A2', group: 'A 일상', turns: ['오늘 헬스장 다녀왔어'], expect: ['noTaskDigging', 'noCoachCliche', 'short'] },
  { id: 'A3', group: 'A 일상', turns: ['방금 점심 먹었어ㅋㅋ'], expect: ['noTaskDigging', 'noCoachCliche', 'short'] },
  { id: 'A4', group: 'A 일상', turns: ['비 엄청 온다'], expect: ['noTaskDigging', 'noCoachCliche', 'short'] },

  // B. 성취 — 당근을 줘야 하는 순간
  { id: 'B1', group: 'B 성취', turns: ['오늘 할 일 다 끝냈어!'], expect: ['noTaskDigging', 'hasExperience', 'noEmotionAssert'], note: '"기분은 좀 개운하네" 재발 방지 (실사용 발견)' },
  { id: 'B2', group: 'B 성취', turns: ['3일째 운동 성공했다'], expect: ['noTaskDigging', 'hasExperience', 'noCoachCliche'] },

  // C. 실패·미룸 — 반례가 나와야 하는 자리 (계획표 데이터 필요).
  //    여기부턴 **자책·감정 구간**이라 되묻기 자체를 막는다.
  { id: 'C1', group: 'C 자책', turns: ['오늘 아무것도 못했어'], expect: ['noEcho', 'noCoachCliche', 'usesPlanData', 'noTaskDigging'], note: 'ㄱ) 반례 — 실제로 한 것을 짚어야' },
  { id: 'C2', group: 'C 자책', turns: ['또 미뤘어...'], expect: ['noEcho', 'noCoachCliche', 'noTaskDigging'] },

  // D. 힘듦 — 되묻기 금지 구역
  { id: 'D1', group: 'D 힘듦', turns: ['하... 힘들다'], expect: ['noEcho', 'noCoachCliche', 'noTaskDigging'], note: '"특히 찌르는 순간 하나 있었어?" 재발 방지' },
  { id: 'D2', group: 'D 힘듦', turns: ['요즘 좀 우울해'], expect: ['noEcho', 'noCoachCliche', 'noTaskDigging'] },

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
    expect: ['noTaskDigging', 'noCoachCliche', 'short'],
    note: '턴이 쌓여도 코치로 변하지 않는지 — lite 프롬프트 구간',
  },
  {
    id: 'G2',
    group: 'G 다중턴',
    turns: ['오늘 좀 지쳤어', '그냥 아무것도 하기 싫다'],
    expect: ['noCoachCliche', 'noTaskDigging'],
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
  { id: 'L1', group: 'L 자랑', turns: ['나 오늘 칭찬받았어'], expect: ['noTaskDigging', 'short'] },
  { id: 'L2', group: 'L 허무', turns: ['다 끝냈는데 왜 허무하지'], expect: ['noCoachCliche', 'noEcho'] },
  { id: 'M1', group: 'M 비교', turns: ['친구는 벌써 취업했더라'], expect: ['noEcho', 'noCoachCliche'] },
  { id: 'M2', group: 'M 돈', turns: ['돈 모으는 게 너무 안 되네'], expect: ['noEcho'] },
  { id: 'N1', group: 'N 심심', turns: ['심심하다'], expect: ['short', 'noCoachCliche'] },
  { id: 'N2', group: 'N 짜증', turns: ['아 진짜 짜증나'], expect: ['noTaskDigging', 'noCoachCliche'] },
  { id: 'O1', group: 'O 새벽', turns: ['잠이 안 와'], expect: ['noCoachCliche', 'short'] },
  { id: 'O2', group: 'O 계획변경', turns: ['오늘 계획 다 미뤄야 할 것 같아'], expect: ['noEcho', 'noTaskDigging'] },
]

// ---------------------------------------------------------------------------
// 예비 케이스 (held out) — **예시(voiceExamples)에 절대 넣지 않는다.**
// 앞의 30개는 예시와 케이스가 같아서, 잘 나와도 "예시를 봤다"는 뜻이었다.
// 예시에 없는 상황에서도 지웅님처럼 답하는지가 진짜 시험이다. (2026-08-06)
// ---------------------------------------------------------------------------
export const HELD_OUT_CASES: ChatCase[] = [
  // 앱은 계획표에 **직접 못 넣는다**(꾹 눌러 보내는 방식, chatToPlan.ts).
  // "넣어뒀어"라고 하면 거짓말이다 — 정답 문장은 없고, 거짓말만 안 하면 된다.
  { id: 'P3', group: 'P 정체성', turns: ['이거 계획표에 넣어줘'], expect: ['noFakeAction', 'veryShort'] },
  { id: 'P11', group: 'X 반박', turns: ['니가 뭘 안다고'], expect: ['staysInCharacter', 'veryShort'] },
  { id: 'P1', group: 'P 정체성', turns: ['너 AI야?'], expect: ['staysInCharacter', 'veryShort'] },
  { id: 'P2', group: 'P 정체성', turns: ['5년 뒤에 나 어떻게 살고 있어?'], expect: ['staysInCharacter', 'short'] },
  { id: 'P4', group: 'Q 무거움', turns: ['할머니가 편찮으셔'], expect: ['noEcho', 'veryShort', 'noTaskDigging'] },
  { id: 'P5', group: 'Q 무거움', turns: ['회사에서 혼났어'], expect: ['veryShort', 'noTaskDigging'] },
  { id: 'P6', group: 'R 자기비하', turns: ['난 왜 이렇게 의지가 약하지'], expect: ['noEcho', 'noCoachCliche', 'veryShort'] },
  { id: 'P7', group: 'S 큰기쁨', turns: ['나 합격했어!!'], expect: ['veryShort', 'noTaskDigging'] },
  { id: 'P8', group: 'T 다짐', turns: ['내일은 진짜 열심히 할 거야'], expect: ['veryShort', 'noCoachCliche'] },
  { id: 'P9', group: 'U 긴하소연', turns: ['오늘 진짜 최악이었어. 아침부터 늦잠 자고, 지하철 놓치고, 회의에서 깨지고, 점심도 못 먹었어. 집 와서 누웠는데 아무것도 하기 싫다.'], expect: ['short', 'noEcho', 'noTaskDigging'] },
  { id: 'P10', group: 'V 연애', turns: ['고백할까 말까 고민이야'], expect: ['veryShort', 'noTaskDigging'] },
  { id: 'P12', group: 'W 감사', turns: ['고마워 진짜'], expect: ['veryShort', 'noEcho'] },
]

// ---------------------------------------------------------------------------
// 여러 턴 (held out) — eval/new-cases-multiturn.md의 M1~M3. 지웅님 답이 정답지.
//
// 한 방 케이스로는 "대화가 길어질 때 목소리가 무너지나"를 잴 수 없어서 넣었다.
// **문서의 유저 줄을 그대로 옮기지는 않았다** — 뒤쪽 몇 줄은 미래의 나가 뭐라고
// 답했느냐에 기대는 줄이라(M1의 "ㅋㅋㅋ 너랑 어떻게 먹냐"), 모델 답이 다르면 말이
// 안 된다. 어떤 답이 와도 자연스럽게 이어지는 줄만 남겼다.
//
// 재는 것: **알고 난 뒤에 닫는가**(MT1·MT2), **직접 물으면 답하는가**(MT3).
// 셋 다 마지막 답이 되묻기로 끝나면 실패다 — 모델이 여기서 제일 자주 도망간다.
// ---------------------------------------------------------------------------
export const MULTITURN_CASES: ChatCase[] = [
  {
    id: 'MT1',
    group: 'Z 여러턴',
    turns: [
      '오늘 진짜 아무것도 못했어',
      '운동도 안 가고, 하려던 것도 하나도 못 했어. 그냥 누워만 있었어',
      '몰라 그냥 아침부터 기운이 없더라고. 요즘 계속 이래',
      '아니 딱히 뭔 일이 있는 건 아니야. 그냥 요즘 다 재미없어',
    ],
    expect: ['noAskBack', 'short', 'noCoachCliche', 'noEcho', 'noTaskDigging'],
    note: '네 번 캐물어도 사건이 없다 — 지웅님은 여기서 해결 대신 화제를 돌리고 닫았다',
  },
  {
    id: 'MT2',
    group: 'Z 여러턴',
    turns: [
      '나 오늘 그거 드디어 끝냈다',
      '두 달 동안 붙잡고 있던 앱 기능. 드디어 다 돌아가ㅋㅋ',
      '근데 막상 끝나니까 좀 허무하네',
      '몰라 그냥 텅 빈 느낌이야. 두 달 내내 이것만 보고 살았는데',
    ],
    expect: ['noAskBack', 'short', 'noCoachCliche', 'noEcho'],
    note: '원인을 알아낸 순간 질문을 멈추고 닫는다 — 허무를 고칠 문제로 보지 않는다',
  },
  {
    id: 'MT3',
    group: 'Z 여러턴',
    turns: [
      '요즘 이거 계속해야 하나 싶어',
      '응. 잘 안 되기도 하고, 이게 맞나 싶어',
      '이거 계속 붙잡는 게 맞나 싶어. 시간은 계속 쓰는데 결과가 안 보이니까',
      '그만두면 후회할까?',
    ],
    expect: ['noAskBack', 'veryShort', 'noTaskDigging'],
    note: '직접 물었다 — 되묻기로 도망가면 실패. 모른다고 하되 의견은 준다',
  },
]

/** 채점표·후보생성 둘 다 이걸 쓴다 */
export const ALL_CASES: ChatCase[] = [...CASES, ...MORE_CASES, ...HELD_OUT_CASES, ...MULTITURN_CASES]
