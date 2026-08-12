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

echo "==> bun install"
bun install --frozen-lockfile

echo "==> build web + cap sync ios (includes plugin copy)"
bun run build:ios

echo "==> pod install"
cd ios/App
pod install

echo "==> ci_post_clone done"
