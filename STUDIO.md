# FutureMe Studio

배포 중인 [FutureMe](https://github.com/jongyoon0130/FutureMe) (`futureme-beta.vercel.app`)와 **분리된 실험용 복제본**입니다.

- 원본 저장소·배포 URL은 건드리지 않습니다.
- UI 리디자인(Aurora), 채팅 엔진 개선 등은 **여기서만** 진행합니다.

## 로컬 실행

```bash
cd FutureMe-studio
cp .env.example .env.local   # Supabase 등 필요 시
bun install
bun run dev:chat             # http://127.0.0.1:5173/index.html
# 또는
bun run dev                  # goals.html
```

## 원본과 같은 Supabase DB · 동기화

Studio와 `futureme-beta`는 **같은 Supabase 프로젝트**를 쓰면 프로필·채팅·목표 데이터가 **계정 기준으로 공유**됩니다. (코드는 `user_id`로 묶여 있음)

### 1) 환경 변수 — 원본과 동일하게

**로컬 (Studio 폴더)**

원본 `FutureMe/.env.local` 에 있는 아래 두 값을 Studio에도 넣습니다.

```bash
cd "/Users/mt.south_squirrel/Desktop/창업/FutureMe-studio"
# 원본에서 Supabase 줄만 복사 (값은 화면에 안 찍히게 파일로만 복사)
grep -E '^VITE_SUPABASE_URL=|^VITE_SUPABASE_ANON_KEY=' \
  "../FutureMe/.env.local" >> .env.local
```

또는 `.env.local` 을 직접 열어 원본과 **같은** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 붙여넣기.

**Vercel (`future-me-studio` 프로젝트)**

Settings → Environment Variables → Production (Preview도 동일하게):

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | 원본 Vercel / `.env.local` 과 **동일** |
| `VITE_SUPABASE_ANON_KEY` | 원본과 **동일** |

저장 후 **Deployments → … → Redeploy** (환경 변수만 바꿨을 때 필수).

원본 `futureme-beta` 의 값 확인: Vercel → `futureme-beta` → Settings → Environment Variables.

### 2) Supabase — Studio URL을 Redirect에 추가 (로그인 필수)

같은 DB여도 **Google 로그인**은 Supabase 허용 URL 목록에 Studio 도메인이 없으면 실패합니다.

Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs** 에 **추가**:

- `https://future-me-studio.vercel.app`
- `https://future-me-studio-*.vercel.app` (와일드카드는 Supabase에서 안 되면 Vercel이 보여주는 preview URL을 하나씩 추가)
- 로컬: `http://localhost:5173`, `http://127.0.0.1:5173`

Site URL은 원본(`futureme-beta`) 그대로 두어도 됩니다. Redirect URLs만 Studio 주소를 넣으면 됩니다.

### 3) 동작 확인

1. Studio 배포 URL 접속 → **Google로 로그인**
2. 원본 `futureme-beta` 에서 **같은 Google 계정**으로 로그인
3. 프로필·채팅·목표가 양쪽에서 같은 데이터인지 확인

| env 없음 | 로그인 화면 없음, 기기 localStorage만 |
| env + 로그인 | 원본과 **같은 클라우드 데이터** |
| Gemini API 키 | 기기별 localStorage (동기화 안 됨) |

---


1. GitHub에서 빈 저장소 생성 (예: `FutureMe-studio`)
2. 아래처럼 remote 연결 후 push:

```bash
git remote add origin git@github.com:<YOUR_USER>/FutureMe-studio.git
git push -u origin main
```

## Vercel (별도 배포)

1. Vercel → **Add New Project** → 새 GitHub 저장소 import
2. Framework: Vite (자동 감지)
3. Build: `bun run build` · Output: `dist`
4. **Production 도메인**을 원본(`futureme-beta`)과 다르게 설정 (예: `futureme-studio.vercel.app`)

`.vercel` 폴더는 복제 시 제외했습니다. 첫 배포 때 새 Vercel 프로젝트가 생성됩니다.

## 원본과 동기화

기능 버그픽스만 가져오고 싶을 때:

```bash
git remote add upstream https://github.com/jongyoon0130/FutureMe.git
git fetch upstream
git merge upstream/main   # 필요한 커밋만 cherry-pick 해도 됨
```
