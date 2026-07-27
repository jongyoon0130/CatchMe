#!/usr/bin/env bash
# Future Me — 알람 푸시 원클릭 설정 (Supabase CLI 로그인 필요)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI 설치: bunx supabase --version"
  SUPABASE="bunx supabase"
else
  SUPABASE="supabase"
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "SUPABASE_PROJECT_REF 가 필요합니다."
  echo "예: export SUPABASE_PROJECT_REF=abcdefgh  (Dashboard URL의 project ref)"
  exit 1
fi

if [[ ! -f .env.alarm-push.local ]]; then
  echo ".env.alarm-push.local 파일이 없습니다. 예시를 복사하세요:"
  echo "  cp alarm-push.env.example .env.alarm-push.local"
  exit 1
fi

# shellcheck disable=SC1091
source .env.alarm-push.local

: "${VAPID_PUBLIC_KEY:?}"
: "${VAPID_PRIVATE_KEY:?}"
: "${VAPID_EMAIL:?}"
: "${ALARM_CRON_SECRET:?}"

echo "==> Supabase link"
$SUPABASE link --project-ref "$SUPABASE_PROJECT_REF"

echo "==> DB migration (alarm tables)"
$SUPABASE db push

echo "==> Edge Function secrets"
$SUPABASE secrets set \
  VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
  VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" \
  VAPID_EMAIL="$VAPID_EMAIL" \
  ALARM_CRON_SECRET="$ALARM_CRON_SECRET"

echo "==> Deploy alarm-push function"
$SUPABASE functions deploy alarm-push --no-verify-jwt

CRON_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/alarm-push"
echo ""
echo "완료. 마지막으로 SQL Editor에서 cron 등록:"
echo "  supabase/migrations/20260727190100_alarm_push_cron.sql"
echo "  YOUR_PROJECT → ${SUPABASE_PROJECT_REF}"
echo "  YOUR_ALARM_CRON_SECRET → ( .env.alarm-push.local 의 값 )"
echo "  url → ${CRON_URL}"
