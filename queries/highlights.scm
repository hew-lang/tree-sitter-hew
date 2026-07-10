; highlights.scm — Hew syntax highlighting queries for tree-sitter

; ---- Keywords ----
[
  "fn" "let" "var" "const" "mut" "pub" "return" "if" "else" "match" "for" "while"
  "loop" "break" "continue" "in" "spawn" "await" "await_restart" "select" "join"
  "import" "extern" "async" "gen" "yield" "scope" "move" "fork"
  "type" "where" "dyn" "unsafe" "defer"
  "init" "child" "pool" "restart" "shutdown" "wired_to"
  "package" "after" "from"
  "reserved" "optional" "deprecated" "default"
] @keyword

"receive" @keyword

(this_expression) @keyword

"indirect" @keyword

"as" @keyword

[
  "enum" "trait" "impl" "actor" "supervisor" "machine" "record"
] @keyword.type

[
  "state" "on" "when"
  "events" "emits" "reenter" "entry" "exit" "emit" "initial"
] @keyword

[
  "permanent" "transient" "temporary"
  "brutal_kill" "infinity"
] @constant.builtin

; ---- Attributes ----
(attribute "#" @punctuation.special)
(attribute "[" @punctuation.special)
(attribute "]" @punctuation.special)
(attribute (identifier) @attribute)

; ---- Literals ----
(integer_literal) @number
(float_literal) @number.float
(duration_literal) @number

(string_literal) @string
(raw_string_literal) @string
(byte_string_literal) @string
(regex_literal) @string.regexp
(interpolated_string) @string
(fstring_start) @string.special
(string_content) @string
(escape_sequence) @string.escape

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

(async_gen_function_declaration
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

; Named arguments in calls
(call_argument
  name: (identifier) @property)

; ---- Variables & Parameters ----
(parameter
  name: (identifier) @variable.parameter)

(lambda_parameter
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
  type: (identifier) @type)

(impl_declaration
  self_type: (identifier) @type)

(actor_declaration
  name: (identifier) @type)

(supervisor_declaration
  name: (identifier) @type)

(machine_declaration
  name: (identifier) @type)

(machine_state
  name: (identifier) @constant)

(machine_event_decl
  name: (identifier) @constant)

(machine_transition
  event: (identifier) @constant)

(emit_statement
  event: (identifier) @constant)

(map_entry
  key: (expression) @property)

(type_alias
  name: (identifier) @type)

(record_declaration
  name: (identifier) @type)

(record_field
  name: (identifier) @property)

; Supervisor strategy enum values (real lexer keywords; hew-lexer lex:189-195)
(supervisor_strategy_value) @constant.builtin

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
  "+=" "-=" "*=" "/=" "%=" ".." "..=" "=>" "->" "?"
  "<<" ">>" "&=" "|=" "^=" "<<=" ">>="
  "&" "|" "^" "~" "is" "&+" "&-" "&*"
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

; ---- Actor expression (inline actor literal) ----
(actor_expression
  "actor" @keyword.type
  "|" @punctuation.bracket
  "|" @punctuation.bracket)

; ---- Fork / scope-deadline ----
(fork_statement
  "fork" @keyword)

(scope_deadline
  "after" @keyword
  "(" @punctuation.bracket
  ")" @punctuation.bracket)

; Fork child binding name
(fork_statement
  binding: (identifier) @variable.definition)
