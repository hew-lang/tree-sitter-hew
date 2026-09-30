#!/usr/bin/env bash
#
# verify-grammar-sync.sh — Check that every Hew keyword and builtin type from
# the compiler's syntax-data.json appears in a TextMate grammar JSON file.
# Contextual words are scoped only where their construct appears, so they are
# not required as bare words.
#
# Usage: ./scripts/verify-grammar-sync.sh <textmate-grammar.json> [syntax-data.json]
#
# syntax-data.json defaults to ../hew/docs/syntax-data.json (HEW_SYNTAX_DATA
# overrides it); it is the one keyword authority, exported from the lexer.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <textmate-grammar.json> [syntax-data.json]"
  exit 2
fi

grammar_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TM_GRAMMAR="$1"
SYNTAX_DATA="${2:-${HEW_SYNTAX_DATA:-$grammar_root/../hew/docs/syntax-data.json}}"

for f in "$TM_GRAMMAR" "$SYNTAX_DATA"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: not found: $f"
    exit 2
  fi
done

mapfile -t KEYWORDS < <(node -e '
const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const words = [
  ...d.all_keywords,
  ...Object.values(d.types).flat(),
];
console.log([...new Set(words)].join("\n"));
' "$SYNTAX_DATA")

TM_CONTENT=$(cat "$TM_GRAMMAR")
MISSING=()
for kw in "${KEYWORDS[@]}"; do
  # Keywords appear in regex alternations such as \b(kw|...)\b.
  if ! grep -qE "[^A-Za-z0-9_]${kw}[^A-Za-z0-9_]" <<<"$TM_CONTENT"; then
    MISSING+=("$kw")
  fi
done

echo "TextMate: $TM_GRAMMAR"
echo "Syntax data: $SYNTAX_DATA"
echo "Words checked: ${#KEYWORDS[@]}; missing: ${#MISSING[@]}"

if [[ ${#MISSING[@]} -gt 0 ]]; then
  printf '  - %s\n' "${MISSING[@]}"
  exit 1
fi
