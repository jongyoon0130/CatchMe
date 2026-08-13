#!/bin/sh
set -e

# Xcode Cloud: workspace is ios/App — repo root is three levels up.
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Catch Me — ci_post_clone (repo: $REPO_ROOT)"

if ! command -v bun >/dev/null 2>&1; then
  echo "==> Installing bun"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
fi

# --- Supabase 설정 확인 -------------------------------------------------
# 왜 여기서 멈추나: 이 값이 없으면 빌드는 그냥 성공하지만, 나오는 앱에는
# 로그인 화면이 없고 AI도 안 된다(AI는 로그인한 사람만 쓰는 서버 프록시를 거친다).
# 실제로 그런 앱이 TestFlight까지 나갔다 — 조용히 성공하는 것보다 시끄럽게 멈추는 게 낫다.
# 값은 Xcode Cloud 워크플로의 Environment Variables 에서 온다. (docs/SUPABASE_SETUP.md §4-3)
echo "==> Supabase 환경변수 확인"
MISSING=""
if [ -z "$VITE_SUPABASE_URL" ]; then MISSING="$MISSING VITE_SUPABASE_URL"; fi
if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then MISSING="$MISSING VITE_SUPABASE_ANON_KEY"; fi

if [ -n "$MISSING" ]; then
  echo "" >&2
  echo "❌ 환경변수가 없습니다:$MISSING" >&2
  echo "" >&2
  echo "   이대로 빌드하면 로그인 화면이 없고 AI도 안 되는 앱이 나갑니다." >&2
  echo "   App Store Connect → Xcode Cloud → 워크플로 [Edit] → [Environment]" >&2
  echo "   → Environment Variables 에 넣어주세요." >&2
  echo "" >&2
  exit 1
fi

# 값이 맞게 들어갔는지 눈으로 볼 수 있게 찍는다. URL은 공개 주소라 그대로,
# anon 키는 공개 키지만 로그에 통째로 남기지는 않는다(길이만).
echo "    VITE_SUPABASE_URL      = $VITE_SUPABASE_URL"
echo "    VITE_SUPABASE_ANON_KEY = (설정됨 · ${#VITE_SUPABASE_ANON_KEY}자)"
# ------------------------------------------------------------------------

echo "==> bun install"
bun install --frozen-lockfile

echo "==> build web + cap sync ios (includes plugin copy)"
bun run build:ios

echo "==> pod install"
cd ios/App
pod install

echo "==> ci_post_clone done"
