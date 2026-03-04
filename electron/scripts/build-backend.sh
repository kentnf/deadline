#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPEC="$REPO_ROOT/electron/scripts/server.spec"
DIST="$REPO_ROOT/electron/resources/backend"

echo "[build-backend] Running PyInstaller..."
cd "$REPO_ROOT/backend"
pyinstaller "$SPEC" --distpath "$DIST" --workpath /tmp/pyinstaller-build --noconfirm

echo "[build-backend] Done → $DIST/server/"
