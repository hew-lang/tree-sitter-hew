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

parse_paths() {
    local path_list="$1"
    local output
    if ! output="$("$ts_cli" parse --rebuild --quiet --paths "$path_list" 2>&1)"; then
        printf '%s\n' "$output" >&2
        return 1
    fi
    if [[ "$output" =~ \(ERROR|\(MISSING ]]; then
        printf '%s\n' "$output" >&2
        return 1
    fi
}

if [[ "${1:-}" == "--self-test" ]]; then
    if check_floor 1137 1138 synthetic >/dev/null 2>&1; then
        echo "active-corpus self-test failed: shrink was accepted" >&2
        exit 1
    fi
    malformed="$(mktemp "${TMPDIR:-/tmp}/hew-active-corpus-red.XXXXXX")"
    malformed_paths="$(mktemp "${TMPDIR:-/tmp}/hew-active-corpus-red-paths.XXXXXX")"
    trap 'rm -f "$malformed" "$malformed_paths"' EXIT
    printf 'fn main( {\n' > "$malformed"
    printf '%s\n' "$malformed" > "$malformed_paths"
    if parse_paths "$malformed_paths"; then
        echo "active-corpus self-test failed: parser diagnostics were accepted" >&2
        exit 1
    fi
    echo "active-corpus self-test: shrink and parser diagnostics rejected"
    exit 0
fi

if [[ ! -d "$hew_root" ]]; then
    echo "Hew repository not found: $hew_root (set HEW_REPO)" >&2
    exit 1
fi

paths="$(mktemp "${TMPDIR:-/tmp}/hew-active-corpus.XXXXXX")"
trap 'rm -f "$paths"' EXIT

total=0
while IFS=$'\t' read -r selection source floor provenance; do
    [[ -z "$selection" || "$selection" == \#* ]] && continue
    source_path="$hew_root/$source"
    case "$selection" in
        tree)
            if [[ ! -d "$source_path" ]]; then
                echo "active-corpus root missing: $source ($provenance)" >&2
                exit 1
            fi
            count="$(find "$source_path" -type f -name '*.hew' -print | tee -a "$paths" | wc -l | tr -d ' ')"
            ;;
        flat)
            if [[ ! -d "$source_path" ]]; then
                echo "active-corpus root missing: $source ($provenance)" >&2
                exit 1
            fi
            count="$(find "$source_path" -maxdepth 1 -type f -name '*.hew' -print | tee -a "$paths" | wc -l | tr -d ' ')"
            ;;
        file)
            if [[ ! -f "$source_path" || "$source_path" != *.hew ]]; then
                echo "active-corpus file missing or not Hew: $source ($provenance)" >&2
                exit 1
            fi
            printf '%s\n' "$source_path" >> "$paths"
            count=1
            ;;
        *)
            echo "active-corpus unknown selection '$selection' for $source" >&2
            exit 1
            ;;
    esac
    check_floor "$count" "$floor" "$source"
    total=$((total + count))
done < "$manifest"

sort -u -o "$paths" "$paths"
unique_count="$(wc -l < "$paths" | tr -d ' ')"
check_floor "$unique_count" 1138 total
if (( unique_count != total )); then
    echo "active-corpus roots overlap: $total rows, $unique_count unique paths" >&2
    exit 1
fi

parse_paths "$paths"
echo "active-corpus: $unique_count files; 0 ERROR/MISSING"
