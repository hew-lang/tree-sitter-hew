#!/usr/bin/env bash
set -euo pipefail

grammar_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hew_root="${HEW_REPO:-$grammar_root/../hew}"
manifest="$grammar_root/test/active-corpus.tsv"
ts_cli="${TS:-tree-sitter}"

check_floor() {
    local actual="$1"
    local expected="$2"
    local label="$3"
    if (( actual < expected )); then
        echo "active-corpus floor shrank for $label: $actual < $expected" >&2
        return 1
    fi
}

if [[ "${1:-}" == "--self-test" ]]; then
    if check_floor 882 883 synthetic >/dev/null 2>&1; then
        echo "active-corpus self-test failed: shrink was accepted" >&2
        exit 1
    fi
    echo "active-corpus self-test: shrink rejected"
    exit 0
fi

if [[ ! -d "$hew_root" ]]; then
    echo "Hew repository not found: $hew_root (set HEW_REPO)" >&2
    exit 1
fi

paths="$(mktemp "${TMPDIR:-/tmp}/hew-active-corpus.XXXXXX")"
trap 'rm -f "$paths"' EXIT

total=0
while IFS=$'\t' read -r root floor provenance; do
    [[ -z "$root" || "$root" == \#* ]] && continue
    source_root="$hew_root/$root"
    if [[ ! -d "$source_root" ]]; then
        echo "active-corpus root missing: $root ($provenance)" >&2
        exit 1
    fi
    count="$(find "$source_root" -type f -name '*.hew' -print | wc -l | tr -d ' ')"
    check_floor "$count" "$floor" "$root"
    find "$source_root" -type f -name '*.hew' -print >> "$paths"
    total=$((total + count))
done < "$manifest"

sort -u -o "$paths" "$paths"
unique_count="$(wc -l < "$paths" | tr -d ' ')"
check_floor "$unique_count" 883 total
if (( unique_count != total )); then
    echo "active-corpus roots overlap: $total rows, $unique_count unique paths" >&2
    exit 1
fi

"$ts_cli" parse --rebuild --quiet --paths "$paths"
echo "active-corpus: $unique_count files; 0 ERROR/MISSING"
