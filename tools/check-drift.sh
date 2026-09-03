#!/usr/bin/env bash
# Compares tree-sitter-hew grammar keywords against the canonical syntax-data.json
# from the Hew compiler repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GRAMMAR="$SCRIPT_DIR/../grammar.js"
SYNTAX_DATA="${HEW_REPO:-$HOME/projects/hew-lang/hew}/docs/syntax-data.json"

if [ ! -f "$SYNTAX_DATA" ]; then
    echo "ERROR: Cannot find $SYNTAX_DATA"
    echo "Set HEW_REPO to point to your hew compiler checkout."
    exit 1
fi

# Extract all_keywords from syntax-data.json — the one canonical keyword list
# (docs/syntax-data.json in the hew repo, exported from the compiler's lexer).
CANONICAL=$(python3 -c "
import json, sys
data = json.load(open('$SYNTAX_DATA'))
for kw in data['all_keywords']:
    print(kw)
")

# keywords.reserved_unused are lexer-reserved words with no accepted syntax
# yet (see tools/downstream/generate-tmgrammar.mjs's own intentionallyUnassigned
# set in the hew repo for the same exclusion on the TextMate side) — a
# grammar that cannot parse them is correct, not drifted, so they are
# dropped from the "missing from grammar" comparison below.
RESERVED_UNUSED=$(python3 -c "
import json
data = json.load(open('$SYNTAX_DATA'))
for kw in data['keywords'].get('reserved_unused', []):
    print(kw)
")
CANONICAL_ACTIVE=$(comm -23 <(echo "$CANONICAL" | LC_ALL=C sort -u) <(echo "$RESERVED_UNUSED" | LC_ALL=C sort -u))

# Extract every lowercase quoted string literal in grammar.js. This includes
# real keyword tokens ('let', 'machine', ...) alongside unrelated quoted
# strings the grammar also carries (field labels like 'name'/'target', scope
# names). Intersecting with CANONICAL below discards that noise for the
# "grammar has an extra keyword" direction, and the raw (pre-intersection)
# list is what "compiler keyword missing from grammar.js" is checked against
# — a keyword absent from the raw list is absent as a literal token, full
# stop. This replaces a hand-maintained regex alternation of keyword names
# that silently stopped matching new keywords and never dropped removed
# ones — the exact shadow-list bug MEMORY.md recorded against a sibling tool
# (tools/downstream/generate-tmgrammar.mjs's cross-check in the hew repo).
GRAMMAR_RAW=$(grep -oP "(?<=['\"])[a-z_]+(?=['\"])" "$GRAMMAR" | LC_ALL=C sort -u)
GRAMMAR_KWS=$(comm -12 <(echo "$CANONICAL_ACTIVE" | LC_ALL=C sort -u) <(echo "$GRAMMAR_RAW"))

# Extract keywords from highlights.scm
HIGHLIGHT_KWS=$(grep -oP '"\K[a-z_]+(?=")' "$SCRIPT_DIR/../queries/highlights.scm" | sort -u)

echo "=== Canonical keywords (from compiler): $(echo "$CANONICAL" | wc -l) ==="
echo "=== Grammar.js keywords: $(echo "$GRAMMAR_KWS" | wc -l) ==="
echo "=== Highlights.scm keywords: $(echo "$HIGHLIGHT_KWS" | wc -l) ==="

# Check for keywords in canonical but missing from grammar (excluding
# reserved-but-unused words, which have no syntax to parse — see above).
echo ""
echo "--- Keywords in compiler but missing from grammar.js ---"
comm -23 <(echo "$CANONICAL_ACTIVE" | LC_ALL=C sort -u) <(echo "$GRAMMAR_RAW") || true

# GRAMMAR_KWS is CANONICAL_ACTIVE ∩ GRAMMAR_RAW by construction, so it can
# never hold an entry outside CANONICAL_ACTIVE — this direction is now
# structurally empty rather than a live false-positive source, kept for
# symmetry with the section above.
echo ""
echo "--- Keywords in grammar.js but not in compiler ---"
comm -13 <(echo "$CANONICAL_ACTIVE" | LC_ALL=C sort -u) <(echo "$GRAMMAR_KWS") || true

echo ""
echo "Done. Review any drift above."
