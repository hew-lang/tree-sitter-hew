#!/usr/bin/env bash
#
# verify-grammar-sync.sh — Check that every Hew keyword from grammar.js
# appears in a TextMate grammar JSON file.
#
# Usage: ./scripts/verify-grammar-sync.sh <textmate-grammar.json>
#
# The keyword list is maintained here, derived from grammar.js string literals.
# When you add a keyword to grammar.js, add it here too — the whole point of
# this script is to remind you to update the TextMate grammar at the same time.
#
# WHY a hardcoded list instead of auto-extraction: grammar.js mixes language
# keywords with tree-sitter DSL field names ('name', 'body', 'value', etc.)
# in the same quoting style. Reliably distinguishing them requires parsing JS,
# which defeats the "simple bash script" goal. A maintained list is honest
# about what it checks.
#
# WHEN to update: whenever you add/remove a keyword in grammar.js.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <textmate-grammar.json>"
  exit 2
fi

TM_GRAMMAR="$1"

if [[ ! -f "$TM_GRAMMAR" ]]; then
  echo "ERROR: TextMate grammar not found at $TM_GRAMMAR"
  exit 2
fi

# ---------------------------------------------------------------------------
# Canonical keyword list — derived from grammar.js string literals
#
# Grouped to match the @sync: markers in grammar.js for easy cross-reference.
# ---------------------------------------------------------------------------

KEYWORDS=(
  # Declaration keywords
  import const type enum trait impl fn gen async extern
  actor supervisor machine pub package super where for indirect

  # Statement / control-flow keywords
  let var if else match break continue return defer
  loop while in scope cooperate yield unsafe

  # Expression keywords
  as await await_restart spawn select join after from move this self

  # Actor keywords
  init mailbox overflow receive

  # Supervisor keywords
  child restart budget strategy

  # @sync:restart_permanence
  permanent transient temporary

  # @sync:restart_strategies
  one_for_one one_for_all rest_for_one

  # @sync:overflow_kinds
  block drop_new drop_old fail coalesce fallback

  # State machine keywords
  state event on when default

  # Wire keywords
  reserved optional deprecated repeated

  # @sync:primitive_types
  i8 i16 i32 i64 u8 u16 u32 u64 isize usize
  f32 f64 bool char string bytes void duration

  # @sync:boolean_literals
  true false

  # None literal
  None

  # @sync:reserved_unused
  try catch race foreign

  # Other
  dyn
)

# ---------------------------------------------------------------------------
# Check each keyword against the TextMate grammar
# ---------------------------------------------------------------------------

TM_CONTENT=$(cat "$TM_GRAMMAR")
MISSING=()
FOUND=0

for kw in "${KEYWORDS[@]}"; do
  # Look for the keyword anywhere in the TextMate JSON. It will appear in
  # regex patterns like \b(kw|...)\b or as a bare string "kw".
  if echo "$TM_CONTENT" | grep -qF "$kw"; then
    FOUND=$((FOUND + 1))
  else
    MISSING+=("$kw")
  fi
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

TOTAL=${#KEYWORDS[@]}

echo "=== TextMate Grammar Sync Check ==="
echo "TextMate: $TM_GRAMMAR"
echo ""
echo "Keywords checked: $TOTAL"
echo "Found:            $FOUND"
echo "Missing:          ${#MISSING[@]}"

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo "MISSING KEYWORDS (present in grammar.js but not in TextMate grammar):"
  for kw in "${MISSING[@]}"; do
    echo "  - $kw"
  done
  echo ""
  echo "FAIL: ${#MISSING[@]} keyword(s) missing from TextMate grammar."
  exit 1
else
  echo ""
  echo "PASS: All keywords from grammar.js found in TextMate grammar."
  exit 0
fi
