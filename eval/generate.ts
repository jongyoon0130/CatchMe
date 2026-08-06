// ---------------------------------------------------------------------------
// 후보 생성기 — 케이스마다 **여러 답**을 만들어 고를 수 있게 HTML 한 장으로 뽑는다.
//
//   GEMINI_API_KEY=... bun run chat:pick
//   → eval/out/pick.html 생성. 브라우저로 열어서 고르면 된다.
//
// 왜: 규칙 채점으로는 "미래의 나다운가"를 못 잰다. 나쁜 답을 거르는 그물일 뿐이다.
// 좋은 답은 **나란히 놓고 고르는 것**으로만 가려진다. 고른 결과가 쌓이면
// 그게 정규식보다 훨씬 나은 기준이 된다. (사람은 점수는 못 매겨도 비교는 정확하다)
//
// 후보는 무작위 순서로 섞고 **어느 변형인지 숨긴다** — 라벨을 보면 편향이 생긴다.
// ---------------------------------------------------------------------------
import type { ChatCase, Variant } from './chatCases'
import type { ApiDialogueMessage } from '../src/lib/selfEngine'

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}
globalThis.localStorage = new MemStorage()
globalThis.window ??= {
  localStorage: globalThis.localStorage,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  location: { pathname: '/index.html', search: '' },
} as unknown as Window & typeof globalThis

const { ALL_CASES, VARIANTS } = await import('./chatCases')
const { fetchAIResponse, DEFAULT_GEMINI_MODEL } = await import('../src/lib/selfEngine')
const { seedGoalData, makeProfile } = await import('./fixture')

if (!process.env.VERBOSE) console.info = () => {}

const apiKey = process.env.GEMINI_API_KEY?.trim()
if (!apiKey) {
  console.error('GEMINI_API_KEY가 없습니다.\n  GEMINI_API_KEY=키 bun run chat:pick')
  process.exit(1)
}
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
const filter = process.argv[2]?.trim().toUpperCase()
const cases = filter ? ALL_CASES.filter((c) => c.id.toUpperCase().startsWith(filter)) : ALL_CASES

seedGoalData()
const profile = makeProfile()

/** 여러 턴짜리 케이스는 앞 턴을 **한 번만** 만들어 모든 변형이 같은 맥락을 쓰게 한다 */
async function leadUp(c: ChatCase): Promise<ApiDialogueMessage[]> {
  const messages: ApiDialogueMessage[] = []
  if (process.env.DRY) return messages
  for (const turn of c.turns.slice(0, -1)) {
    messages.push({ role: 'user', content: turn, timestamp: Date.now() })
    const out = await fetchAIResponse(profile, messages, apiKey!, model)
    messages.push({ role: 'assistant', content: out.text, timestamp: Date.now() })
  }
  return messages
}

async function candidate(c: ChatCase, v: Variant, context: ApiDialogueMessage[]): Promise<string> {
  const last = c.turns[c.turns.length - 1]!
  // DRY=1 — API 없이 화면만 확인할 때 (고르는 UI가 제대로 도는지 볼 용도)
  if (process.env.DRY) return `${v.label} 방식으로 "${last}"에 답한 문장이 여기 들어갑니다.`
  const messages = [...context, { role: 'user' as const, content: last, timestamp: Date.now() }]
  const plan = v.instruction
    ? { contextMessages: context, focusContent: last, focusTimestamp: Date.now(), focusInstruction: v.instruction }
    : undefined
  const out = await fetchAIResponse(profile, messages, apiKey!, model, plan)
  return out.text.trim()
}

/** Gemini가 가끔 일시적으로 실패한다(150번 중 1~2번). 케이스가 통째로 빠지지 않게 재시도. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      await Bun.sleep(900 * (i + 1))
    }
  }
  throw last
}

const shuffle = <T,>(a: T[]): T[] => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v)

type Row = { id: string; group: string; turns: string[]; options: { variant: string; label: string; text: string }[] }
const rows: Row[] = []

for (const [i, c] of cases.entries()) {
  process.stdout.write(`\r생성 중 ${i + 1}/${cases.length}  ${c.id}      `)
  try {
    const context = await withRetry(() => leadUp(c))
    const texts = await Promise.all(VARIANTS.map((v) => withRetry(() => candidate(c, v, context))))
    const options = VARIANTS.map((v, k) => ({ variant: v.id, label: v.label, text: texts[k]! }))
    rows.push({ id: c.id, group: c.group, turns: c.turns, options: shuffle(options) })
  } catch (err) {
    console.error(`\n${c.id} 실패: ${String(err).slice(0, 100)}`)
  }
}
console.log(`\n\n${rows.length}개 케이스 × ${VARIANTS.length}개 후보 생성 완료`)

const html = `<!doctype html><meta charset="utf-8"><title>답 고르기 · ${rows.length}케이스</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.7 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;max-width:780px;margin:0 auto;padding:24px 16px 130px}
h1{font-size:20px;margin:0 0 4px} .sub{opacity:.65;font-size:13px;margin-bottom:24px}
kbd{font:12px ui-monospace,monospace;border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:4px;padding:1px 5px}
.case{border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:14px;padding:18px;margin:0 0 18px}
.case.done{opacity:.5} .case.cur{border-color:color-mix(in srgb,currentColor 45%,transparent)}
.said{font-weight:700;margin-bottom:12px} .said .tag{font-size:11px;opacity:.5;font-weight:400;margin-right:8px}
.opt{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:transparent;
 border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:10px;padding:11px 14px;margin:7px 0;cursor:pointer}
.opt:hover{border-color:color-mix(in srgb,currentColor 45%,transparent)}
.opt.on{border-color:#2e8b57;background:color-mix(in srgb,#2e8b57 13%,transparent)}
.opt .k{opacity:.4;font-size:12px;margin-right:8px}
.mine{width:100%;box-sizing:border-box;font:inherit;color:inherit;background:transparent;margin-top:8px;
 border:1px dashed color-mix(in srgb,currentColor 28%,transparent);border-radius:10px;padding:10px 13px;resize:vertical;min-height:46px}
.mine:focus{outline:none;border-style:solid;border-color:#c98a2e}
.row{display:flex;gap:12px;align-items:center;margin-top:8px;font-size:13px;opacity:.7}
.row button{font:inherit;background:none;border:none;color:inherit;cursor:pointer;text-decoration:underline;padding:2px 0}
#bar{position:fixed;left:0;right:0;bottom:0;padding:12px 16px;backdrop-filter:blur(8px);
 background:color-mix(in srgb,Canvas 88%,transparent);border-top:1px solid color-mix(in srgb,currentColor 15%,transparent)}
#bar b{font-variant-numeric:tabular-nums}
button.act{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid color-mix(in srgb,currentColor 30%,transparent);background:transparent;color:inherit;cursor:pointer;margin-left:8px}
table{border-collapse:collapse;margin-top:10px;font-size:14px} td{padding:3px 14px 3px 0;vertical-align:top}
pre{white-space:pre-wrap;font:14px/1.7 inherit;background:color-mix(in srgb,currentColor 7%,transparent);padding:12px;border-radius:10px}
</style>
<h1>어느 답이 제일 '미래의 나' 같나요?</h1>
<div class="sub">
<kbd>1</kbd>~<kbd>5</kbd> 고르고 다음으로 · <kbd>0</kbd> 다 별로 · <kbd>Shift</kbd>+숫자 <b>여러 개 고르기</b>(안 넘어감)<br>
<b>고치고 싶으면 아래 칸에 직접 쓰세요.</b> 후보를 Shift로 고르면 그 문장이 칸에 쌓입니다 — 둘을 합쳐 고치시면 됩니다.<br>
직접 쓰신 문장이 <b>제일 값진 데이터</b>입니다. 그건 예시로 바로 쓸 수 있거든요.<br>
어느 후보가 어떤 방식인지는 일부러 숨겼습니다 — 라벨을 보면 판단이 흔들립니다.
</div>
<div id="list"></div>
<div id="bar"><b id="prog">0</b> / ${rows.length}
<button class="act" onclick="dl()">결과 내려받기</button>
<button class="act" onclick="tally()">집계 보기</button></div>
<div id="out"></div>
<script>
const DATA = ${JSON.stringify(rows)};
let picks = JSON.parse(localStorage.getItem('picks2') || '{}');
let cur = 0;
const rec = (id) => (picks[id] ||= { variants: [], text: '', skipped: false });
const save = () => { localStorage.setItem('picks2', JSON.stringify(picks)); paint(); };
const touched = (p) => p && (p.variants.length || (p.text || '').trim() || p.skipped);

DATA.forEach((c, ci) => {
  const d = document.createElement('div'); d.className = 'case'; d.id = 'c' + ci;
  d.innerHTML = '<div class="said"><span class="tag">' + c.id + ' ' + c.group + '</span>' +
    c.turns.map(t => '나: ' + t).join(' &rarr; ') + '</div>';
  c.options.forEach((o, oi) => {
    const b = document.createElement('button');
    b.className = 'opt'; b.innerHTML = '<span class="k">' + (oi + 1) + '</span>' + o.text.replace(/</g, '&lt;');
    b.onclick = (e) => e.shiftKey ? toggle(ci, oi) : choose(ci, oi);
    d.appendChild(b);
  });
  const t = document.createElement('textarea');
  t.className = 'mine'; t.placeholder = '직접 쓰기 / 골라온 문장 고치기 (비워두면 미사용)';
  t.oninput = () => { rec(c.id).text = t.value; localStorage.setItem('picks2', JSON.stringify(picks)); };
  d.appendChild(t);
  const row = document.createElement('div'); row.className = 'row';
  const skip = document.createElement('button'); skip.textContent = '0 · 다 별로다';
  skip.onclick = () => { const p = rec(c.id); p.skipped = true; p.variants = []; save(); next(ci); };
  const clr = document.createElement('button'); clr.textContent = '지우기';
  clr.onclick = () => { delete picks[c.id]; t.value = ''; save(); };
  row.append(skip, clr); d.appendChild(row);
  list.appendChild(d);
});

function choose(ci, oi) {
  const c = DATA[ci], p = rec(c.id);
  p.variants = [c.options[oi].variant]; p.skipped = false;
  save(); next(ci);
}
function toggle(ci, oi) {
  const c = DATA[ci], p = rec(c.id), v = c.options[oi].variant;
  const i = p.variants.indexOf(v);
  if (i >= 0) p.variants.splice(i, 1);
  else {
    p.variants.push(v); p.skipped = false;
    // 고른 문장을 직접쓰기 칸에 쌓아준다 — 둘을 합치려면 여기서 고치면 된다
    const ta = document.querySelector('#c' + ci + ' .mine');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\\n' : '') + c.options[oi].text;
    p.text = ta.value;
  }
  save();
}
function next(ci) {
  cur = Math.min(ci + 1, DATA.length - 1);
  paint();
  document.getElementById('c' + cur).scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function paint() {
  let n = 0;
  DATA.forEach((c, ci) => {
    const el = document.getElementById('c' + ci), p = picks[c.id];
    if (touched(p)) n++;
    el.classList.toggle('done', !!touched(p));
    el.classList.toggle('cur', ci === cur);
    [...el.querySelectorAll('.opt')].forEach((b, oi) => {
      b.classList.toggle('on', !!p && p.variants.includes(c.options[oi].variant));
    });
    const ta = el.querySelector('.mine');
    if (p && p.text != null && ta.value !== p.text && document.activeElement !== ta) ta.value = p.text;
  });
  document.getElementById('prog').textContent = n;
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA') return;
  const n = parseInt(e.key, 10);
  if (isNaN(n) || n < 0 || n > 5) return;
  const c = DATA[cur]; if (!c) return;
  e.preventDefault();
  if (n === 0) { const p = rec(c.id); p.skipped = true; p.variants = []; save(); next(cur); return; }
  if (!c.options[n - 1]) return;
  e.shiftKey ? toggle(cur, n - 1) : choose(cur, n - 1);
});
function dl() {
  const blob = new Blob([JSON.stringify(picks, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'picks.json'; a.click();
}
function tally() {
  const n = {}; let skipped = 0; const written = [];
  const labels = {}; DATA.forEach(c => c.options.forEach(o => labels[o.variant] = o.label));
  for (const c of DATA) {
    const p = picks[c.id]; if (!p) continue;
    if (p.skipped) skipped++;
    for (const v of p.variants) n[v] = (n[v] || 0) + 1;
    if ((p.text || '').trim()) written.push(c.id + '  나: ' + c.turns.join(' → ') + '\\n  → ' + p.text.trim());
  }
  const tr = Object.entries(n).sort((a, b) => b[1] - a[1])
    .map(([v, k]) => '<tr><td><b>' + k + '</b>표</td><td>' + (labels[v] || v) + '</td></tr>').join('');
  document.getElementById('out').innerHTML =
    '<h1 style="margin-top:30px">집계</h1><table>' + tr + '</table>' +
    '<p style="opacity:.65;font-size:14px">다 별로: ' + skipped + '개 · 직접 쓴 답: ' + written.length + '개</p>' +
    (written.length ? '<h1 style="margin-top:24px">직접 쓰신 답 (이게 제일 값집니다)</h1><pre>' +
      written.join('\\n\\n').replace(/</g, '&lt;') + '</pre>' : '');
  document.getElementById('out').scrollIntoView({ behavior: 'smooth' });
}
paint();
</script>`

// DRY(화면 확인용)는 **다른 파일로** — 진짜 후보가 든 pick.html을 덮어쓰면 안 된다
const outPath = process.env.DRY ? 'eval/out/pick-sample.html' : 'eval/out/pick.html'
await Bun.write(outPath, html)
console.log(`→ ${outPath}\n  open ${outPath}`)
