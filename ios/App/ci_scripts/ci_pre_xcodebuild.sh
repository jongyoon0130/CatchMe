#!/bin/sh
set -e

# Safety net: Pods xcconfig must exist before xcodebuild.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f "Pods/Target Support Files/Pods-App/Pods-App.release.xcconfig" ]; then
  echo "==> Pods missing — running pod install"
  pod install
fi

echo "==> ci_pre_xcodebuild done"
