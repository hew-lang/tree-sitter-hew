#!/usr/bin/env bash
# Compares tree-sitter-hew grammar keywords against the canonical syntax-data.json
# from the Hew compiler repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GRAMMAR="$SCRIPT_DIR/../grammar.js"
SYNTAX_DATA="${HEW_REPO:-$HOME/projects/hew}/docs/syntax-data.json"

if [ ! -f "$SYNTAX_DATA" ]; then
    echo "ERROR: Cannot find $SYNTAX_DATA"
    echo "Set HEW_REPO to point to your hew compiler checkout."
    exit 1
fi

# Extract all_keywords from syntax-data.json
CANONICAL=$(python3 -c "
import json, sys
data = json.load(open('$SYNTAX_DATA'))
for kw in data['all_keywords']:
    print(kw)
")

# Extract keywords used in grammar.js (string literals in quotes that match keywords)
GRAMMAR_KWS=$(grep -oP "(?<=['\"])(let|var|const|fn|if|else|match|loop|for|while|break|continue|return|import|pub|package|super|struct|enum|trait|impl|wire|isolated|actor|supervisor|child|restart|budget|strategy|permanent|transient|temporary|one_for_one|one_for_all|rest_for_one|scope|spawn|async|await|receive|init|type|dyn|move|try|and|or|true|false|reserved|optional|deprecated|default|unsafe|extern|foreign|in|select|race|join|from|after|gen|yield|where|cooperate|catch|defer)(?=['\"])" "$GRAMMAR" | sort -u)

# Extract keywords from highlights.scm
HIGHLIGHT_KWS=$(grep -oP '"\K[a-z_]+(?=")' "$SCRIPT_DIR/../queries/highlights.scm" | sort -u)

echo "=== Canonical keywords (from compiler): $(echo "$CANONICAL" | wc -l) ==="
echo "=== Grammar.js keywords: $(echo "$GRAMMAR_KWS" | wc -l) ==="
echo "=== Highlights.scm keywords: $(echo "$HIGHLIGHT_KWS" | wc -l) ==="

# Check for keywords in canonical but missing from grammar
echo ""
echo "--- Keywords in compiler but missing from grammar.js ---"
comm -23 <(echo "$CANONICAL" | sort) <(echo "$GRAMMAR_KWS") || true

echo ""
echo "--- Keywords in grammar.js but not in compiler ---"
comm -13 <(echo "$CANONICAL" | sort) <(echo "$GRAMMAR_KWS") || true

echo ""
echo "Done. Review any drift above."
