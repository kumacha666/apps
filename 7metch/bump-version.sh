#!/bin/bash
# bump-version.sh — conventional commits から semver を自動決定して更新
# 使い方: ./bump-version.sh [--dry-run]
#
# コミットprefix → バージョン決定ルール:
#   feat:  → minor (4.0.0 → 4.1.0)
#   fix:   → patch (4.0.0 → 4.0.1)
#   その他 → patch
#   BREAKING CHANGE / feat!: / fix!: → major (4.0.0 → 5.0.0)
#
# 範囲の決定: 直前の「chore: vX.Y.Z リリース」コミットから HEAD まで

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GIT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
APP_DIR="${SCRIPT_DIR#"$GIT_ROOT"/}"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

CURRENT=$(grep -oP 'id="version-info">v\K[0-9]+\.[0-9]+\.[0-9]+' "$SCRIPT_DIR/index.html")
if [[ -z "$CURRENT" ]]; then
  echo "エラー: index.html からバージョンを取得できません" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

cd "$GIT_ROOT"

LAST_RELEASE=$(git log --oneline --grep="^chore: v[0-9]" -- "$APP_DIR/index.html" | head -1 | awk '{print $1}')
if [[ -n "$LAST_RELEASE" ]]; then
  RANGE="${LAST_RELEASE}..HEAD"
else
  RANGE=""
fi

if [[ -n "$RANGE" ]]; then
  COMMITS=$(git log --oneline "$RANGE" -- "$APP_DIR/" 2>/dev/null || true)
else
  COMMITS=$(git log --oneline -- "$APP_DIR/" 2>/dev/null | head -30)
fi

if [[ -z "$COMMITS" ]]; then
  echo "変更コミットなし。バージョン据え置き: v${CURRENT}"
  exit 0
fi

BUMP="patch"
while IFS= read -r line; do
  msg="${line#* }"
  if echo "$msg" | grep -qiE 'BREAKING CHANGE|^[a-z]+!:'; then
    BUMP="major"
    break
  elif echo "$msg" | grep -qE '^feat(\(.+\))?:'; then
    BUMP="minor"
  fi
done <<< "$COMMITS"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW="${MAJOR}.${MINOR}.${PATCH}"

echo "現在: v${CURRENT}"
echo "コミット (${RANGE:-初回}):"
echo "$COMMITS" | head -10
COUNT=$(echo "$COMMITS" | wc -l)
[[ "$COUNT" -gt 10 ]] && echo "  ... (他 $((COUNT - 10)) 件)"
echo "判定: ${BUMP} bump"
echo "更新後: v${NEW}"

if $DRY_RUN; then
  echo "(dry-run: ファイル更新なし)"
  exit 0
fi

sed -i "s/id=\"version-info\">v${CURRENT}/id=\"version-info\">v${NEW}/" "$SCRIPT_DIR/index.html"
sed -i "s/const CACHE_NAME = \"7metch-v[^\"]*\"/const CACHE_NAME = \"7metch-v${NEW}\"/" "$SCRIPT_DIR/sw.js"

echo "✔ index.html, sw.js を更新しました"
echo "次のステップ: git add & commit -m 'chore: v${NEW} リリース' → push"
