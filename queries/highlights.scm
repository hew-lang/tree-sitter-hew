; highlights.scm — Hew syntax highlighting queries for tree-sitter

; ---- Keywords ----
[
  "fn" "let" "var" "const" "pub" "return" "if" "else" "match" "for" "while"
  "loop" "break" "continue" "in" "spawn" "await" "select" "join" "race"
  "import" "extern" "async" "gen" "yield" "scope" "move"
  "type" "where" "dyn" "mut" "try" "catch" "unsafe"
] @keyword

"receive" @keyword

(cooperate_expression) @keyword

[
  "struct" "enum" "trait" "impl" "actor" "supervisor" "wire"
] @keyword.type

[
  "and" "or"
] @keyword.operator

; ---- Literals ----
(integer_literal) @number
(float_literal) @number.float
(duration_literal) @number

(string_literal) @string
(raw_string_literal) @string
(regex_literal) @string.regexp
(interpolated_string) @string
(template_literal) @string.template
(fstring_start) @string.special
(string_content) @string

(boolean_literal) @boolean
(none_literal) @constant.builtin

; ---- Comments ----
(line_comment) @comment
(block_comment) @comment

; ---- Types ----
(primitive_type) @type.builtin

(type_parameters "<" @punctuation.bracket)
(type_parameters ">" @punctuation.bracket)

; ---- Functions ----
(function_declaration
  name: (identifier) @function)

(async_function_declaration
  name: (identifier) @function)

(gen_function_declaration
  name: (identifier) @function)

(trait_function_signature
  name: (identifier) @function)

(receive_function
  name: (identifier) @function.method)

(receive_gen_function
  name: (identifier) @function.method)

; Function calls: foo(x)
(call_expression
  function: (expression (identifier) @function.call))

; Method calls: obj.method(x) — parsed as call(field_expr)
(call_expression
  function: (expression
    (field_expression
      field: (identifier) @function.method.call)))

; ---- Variables & Parameters ----
(parameter
  name: (identifier) @variable.parameter)

(self) @variable.builtin

(field_expression
  field: (identifier) @property)

(struct_field
  name: (identifier) @property)

(actor_field
  name: (identifier) @property)

; ---- Declarations ----
(struct_declaration
  name: (identifier) @type)

(enum_declaration
  name: (identifier) @type)

(trait_declaration
  name: (identifier) @type)

(impl_declaration
  trait: (identifier) @type)

(impl_declaration
  type: (identifier) @type)

(actor_declaration
  name: (identifier) @type)

(supervisor_declaration
  name: (identifier) @type)

(wire_declaration
  name: (identifier) @type)

(type_alias
  name: (identifier) @type)

(variant
  name: (identifier) @constant)

; ---- Struct init ----
(struct_init
  name: (identifier) @type)

(field_initializer
  name: (identifier) @property)

; ---- Paths ----
(path_expression
  (identifier) @type
  (identifier) @property)

; ---- Patterns ----
(constructor_pattern
  name: (identifier) @constructor)

(constructor_pattern
  name: (path_expression) @constructor)

; ---- Operators ----
[
  "+" "-" "*" "/" "%" "!" "=" "==" "!=" "<" "<=" ">" ">=" "&&" "||"
  "+=" "-=" "*=" "/=" "%=" ".." "..=" "<-" "=>" "->" "?"
] @operator

; ---- Punctuation ----
["(" ")" "[" "]" "{" "}"] @punctuation.bracket

["," ";" ":" "::" "." "@"] @punctuation.delimiter

; ---- Labels ----
(label) @label

; ---- Strings interpolation ----
(interpolation
  "{" @punctuation.special
  "}" @punctuation.special)

(template_interpolation
  "${" @punctuation.special
  "}" @punctuation.special)
