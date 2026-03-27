# Editor Release Checklist

Run this checklist when bumping the Hew language version.

## Tier 1 (must verify before release)
- [ ] tree-sitter-hew grammar parses all new syntax (`tree-sitter test`)
- [ ] highlights.scm covers all new token types (`tree-sitter highlight`)
- [ ] VS Code extension: install, open fixture files, verify highlighting + diagnostics
- [ ] hew.run: verify highlighting and execution on playground
- [ ] iOS app: verify highlighting on all examples
- [ ] Android app: verify highlighting on all examples

## Tier 2 (verify if changes affect grammar)
- [ ] Neovim tree-sitter: install updated grammar, verify highlighting
- [ ] Helix: verify highlighting
- [ ] Zed: verify highlighting

## Tier 3 (best-effort)
- [ ] Vim syntax file: update keyword lists if new keywords added
- [ ] Emacs mode: update keyword lists if new keywords added
- [ ] Sublime: canonical TextMate grammar updated (if not generated)

## CI Checks
- [ ] Grammar sync CI passes
- [ ] tree-sitter-hew CI passes
- [ ] VS Code extension CI passes
