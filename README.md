# tree-sitter-hew

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for the [Hew](https://hew.sh) programming language.

## Usage

### Neovim (nvim-treesitter)

Add to your `nvim-treesitter` configuration:

```lua
require('nvim-treesitter.configs').setup {
  ensure_installed = { 'hew' },
}
```

### Node.js

```bash
npm install tree-sitter-hew
```

```javascript
const Parser = require('tree-sitter');
const Hew = require('tree-sitter-hew');

const parser = new Parser();
parser.setLanguage(Hew);

const tree = parser.parse('fn main() -> i32 { 0 }');
console.log(tree.rootNode.toString());
```

### Rust

```toml
[dependencies]
tree-sitter-hew = "0.1"
```

## Development

```bash
# Generate parser from grammar
npx tree-sitter generate

# Run tests
npx tree-sitter test

# Parse a file
npx tree-sitter parse example.hew
```

## Highlight Queries

Syntax highlighting queries are in `queries/highlights.scm`.

## License

Apache 2.0 — see [LICENSE](LICENSE).
