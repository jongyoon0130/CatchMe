#!/usr/bin/env bash
# Future Me — iOS Capacitor 초기화 (Mac + Xcode 필요)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.bun/bin:${PATH}"

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods가 필요합니다:"
  echo "  brew install cocoapods"
  echo "  또는: sudo gem install cocoapods"
  exit 1
fi

bun install
bun run build

if [[ ! -d ios ]]; then
  bunx cap add ios
fi

bunx cap sync ios
echo ""
echo "완료. Xcode: bun run ios:open"
echo "AlarmKit entitlement: docs/IOS_NATIVE_ALARM.md"
