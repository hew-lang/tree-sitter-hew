/**
 * @file Hew grammar for tree-sitter
 * @author Hew Contributors
 * @license Apache-2.0
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Precedence levels (from Pratt parser in hew-parser/src/parser.rs)
const PREC = {
  OR: 3,          // || or
  BIT_OR: 4,      // |
  AND: 5,         // && and
  BIT_AND: 6,     // &
  BIT_XOR: 6,     // ^
  EQ: 7,          // == != is
  REL: 9,         // < <= > >=
  RANGE: 11,      // .. ..=
  SHIFT: 12,      // << >>
  ADD: 13,        // + - &+ &-
  MUL: 15,        // * / % &*
  UNARY: 17,      // ! - ~ await
  POSTFIX: 19,    // . () [] ?
  FIELD: 19,      // field access (same left-associative postfix tier)
};

export default grammar({
  name: "hew",

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.if_statement, $.expression],
    [$.match_statement, $.expression],
    [$.expression, $.struct_init],
    [$.block, $.map_literal],
    [$.expression, $._member_object, $.path_expression],
    [$.expression, $._member_object],
    [$.qualified_expression, $.field_expression],
    [$.generic_apply_expression, $.bare_generic_call_expression],
    [$.actor_spawn],
    [$.trait_bound],
    // `expr | …` — at the `|` the parser cannot tell (within LR(1)) whether a
    // bit-or `expr | expr` or a timeout `expr | after <dur>` follows; the `after`
    // keyword one token later disambiguates, so GLR explores both branches.
    [$.binary_expression, $.timeout_expression],
    [$.binary_expression, $.timeout_expression, $.lambda],
    // `where P , (` — after a where-predicate's trailing comma, a `(` may begin
    // either another predicate (a parenthesized/tuple type) or a record's tuple
    // body `( T, … )`; GLR explores both and only the valid continuation lives.
    [$.where_clause],
    // `import a.b.c` — at each `.` the parser cannot tell (within LR(1))
    // whether another path segment or the import selection follows; GLR explores
    // both and only the valid continuation survives.
    [$.module_path],
    // `expr as Name.Field` — the `.` may extend a qualified (scoped) type or be
    // a field access on the cast result. The real parser parses the type
    // greedily (`x as net.NetError`); field access on a cast needs parens.
    [$._type, $.scoped_type],
    // `expr as Name.Field<...>` — `<` may open the scoped type's type-arg list
    // or be a comparison on the cast result; the real parser takes type args
    // greedily (mirrors generic_type's prec(1)).
    [$.scoped_type],
  ],

  rules: {
    source_file: $ => repeat($._item),

    // ---- Items ----

    _item: $ => seq(
      repeat($.attribute),
      // Visibility is hoisted to item level per spec grammar.ebnf:27
      //   Item = Attribute* Visibility? ( Import | ConstDecl | ... )
      optional($.visibility),
      choice(
        $.import_declaration,
        $.const_declaration,
        $.struct_declaration,
        $.tuple_type_declaration,
        $.enum_declaration,
        $.trait_declaration,
        $.impl_declaration,
        $.function_declaration,
        $.gen_function_declaration,
        $.async_gen_function_declaration,
        $.extern_block,
        $.actor_declaration,
        $.supervisor_declaration,
        $.machine_declaration,
        $.type_alias,
      ),
    ),

    // Attribute args accept both a positional list (`#[derive(Debug, Clone)]`)
    // and `key = value` pairs (`#[wire(version = 2, min_version = 1)]`), matching
    // the real parser's AttributeArg forms (hew-parser wire.rs
    // reads `version`/`min_version` as KeyValue args).
    attribute: $ => seq('#', '[', $.identifier, optional(seq('(', optional(sep1($._attribute_arg, ',')), ')')), ']'),

    _attribute_arg: $ => choice(
      seq($.identifier, '=', choice($.identifier, $._literal)),
      // Unit-bearing limits such as `#[max_heap(64 kb)]` are accepted by the
      // compiler as one attribute argument.
      seq($.integer_literal, $.identifier),
      $.identifier,
      $._literal,
    ),

    // Import (spec grammar.ebnf:63-68):
    //   Import     = "import" ( StringLit | ModulePath ( "." ImportSelection )? ) ";"
    //   ModulePath = Ident { "." Ident }
    //   ImportSelection = "{" ImportName { "," ImportName } "}"
    //   ImportName = Ident ( "as" Ident )?
    // A bare trailing Ident is NOT a valid spec — a single name uses the brace
    // form `import m.{ Name };`. The path/selection tail is right-recursive so the
    // token after each `.` (another Ident vs `{`) disambiguates within
    // LR(1); a left-recursive sep1 reduces the path too early and breaks
    // N-segment (>=3) paths.
    import_declaration: $ => seq(
      'import',
      choice(
        $.string_literal,
        seq($.module_path, optional(seq('.', $._import_selection))),
      ),
      // A complete module path may carry an alias (`import a.b as c`).
      // Explicit selection members carry their own aliases instead.
      optional(seq('as', field('alias', $.identifier))),
      ';',
    ),

    module_path: $ => seq(
      $.identifier,
      repeat(seq('.', $.identifier)),
    ),

    _import_selection: $ => seq('{', sep1($.import_name, ','), optional(','), '}'),

    import_name: $ => seq(
      field('name', $.identifier),
      optional(seq('as', field('alias', $.identifier))),
    ),

    const_declaration: $ => seq(
      'const',
      field('name', $.identifier),
      ':',
      field('type', $._type),
      '=',
      field('value', $.expression),
      ';',
    ),

    type_alias: $ => seq(
      'type',
      field('name', $.identifier),
      optional($.type_parameters),
      '=',
      field('type', $._type),
      ';',
    ),

    // TypeDecl (grammar.ebnf:47, 65): `type Name { ... }` whose body may hold
    // struct fields, variants, AND fn declarations (TypeBody). The alias form
    // `type Name = Type;` is handled separately by `type_alias`.
    struct_declaration: $ => seq(
      'type',
      field('name', $.identifier),
      optional($.type_parameters),
      optional($.where_clause),
      field('body', $.struct_body),
    ),

    struct_body: $ => seq('{', repeat(choice(
      $.struct_field,
      $.reserved_declaration,
      seq(optional($.visibility), $.function_declaration),
    )), '}'),

    // StructFieldDecl / WireStructFieldDecl (grammar.ebnf:68, 76):
    // `Attribute* Ident ":" Type ("@" IntLit)? WireAttr* (";" | ",")`.
    // The real parser attaches `@N` tags and trailing wire modifiers to a normal
    // `type` declaration when a `#[wire]` attribute is present.
    struct_field: $ => seq(
      repeat($.attribute),
      field('name', $.identifier),
      ':',
      field('type', $._type),
      optional(seq('@', $.integer_literal)),
      repeat($.wire_attribute),
      optional(choice(',', ';')),
    ),

    // `type Name(T, T, ...);` — positional/tuple record. The bare `record`
    // keyword form (both named- and tuple-body) was removed from the
    // compiler ("record has been removed; use `type Name { ... }` instead");
    // the tuple-positional shape survives under the `type` keyword, dispatched
    // by the parser's `is_tuple_type_lookahead` (hew-parser items.rs:441-457,
    // parse_record_decl at items.rs:941-983). The named-body form is just
    // `struct_declaration` (`type Name { field: T, ... }`).
    tuple_type_declaration: $ => seq(
      'type',
      field('name', $.identifier),
      optional($.type_parameters),
      optional($.where_clause),
      '(', sep1($._type, ','), optional(','), ')', ';',
    ),

    enum_declaration: $ => seq(
      optional('indirect'),
      'enum',
      field('name', $.identifier),
      optional($.type_parameters),
      optional($.where_clause),
      field('body', $.enum_body),
    ),

    enum_body: $ => seq('{', repeat($.variant), '}'),

    variant: $ => seq(
      field('name', $.identifier),
      optional(choice(
        seq('(', sep1($._type, ','), ')'),
        seq('{', repeat($.struct_field), '}'),
      )),
      // Enum variants are `;`-separated (a `,` separator is rejected by the real
      // parser: "use `;` instead of `,` to separate variants"). The last variant
      // may omit the trailing `;`.
      optional(';'),
    ),

    // NOTE: the legacy bare `wire` keyword item form (`wire struct/enum/type
    // Name { … }`) was removed from the compiler in hew commit 60c50daef
    // ("refactor(parser): remove the wire keyword surface in favor of #[wire]").
    // The current surface is `#[wire] type Name { … }` / `#[wire] enum Name { … }`:
    // both struct-shaped and enum-shaped wire types use the generic `#[wire]`
    // attribute on ordinary `type` / `enum` declarations.

    // `reserved @N, @M;` inside a `#[wire] type` body reserves wire field
    // numbers (hew-parser wire.rs:222-248 expects `@` markers, comma-separated,
    // terminated by `;`). The old parenthesised `reserved(N, M);` form is not
    // accepted by the compiler.
    reserved_declaration: $ => seq(
      'reserved', sep1(seq('@', $.integer_literal), ','), ';',
    ),

    // @sync:wire_attributes — per-field modifiers on a `#[wire] type` field
    // (hew-parser wire.rs:53-117). `optional`/`deprecated` are real keyword
    // tokens; `repeated`/`since`/`json`/`yaml`/`json_name`/`yaml_name` are
    // contextual identifiers recognised only in wire-field modifier position.
    wire_attribute: $ => choice(
      'optional', 'deprecated', 'repeated',
      seq('since', $.integer_literal),
      seq('json', '(', $.string_literal, ')'),
      seq('yaml', '(', $.string_literal, ')'),
      seq('json_name', '=', $.string_literal),
      seq('yaml_name', '=', $.string_literal),
    ),

    // ---- Traits & Impls ----

    trait_declaration: $ => seq(
      'trait',
      field('name', $.identifier),
      optional($.type_parameters),
      optional(seq(':', $.trait_bounds)),
      optional($.where_clause),
      '{',
      repeat(seq(repeat($.attribute), $._trait_item)),
      '}',
    ),

    _trait_item: $ => choice(
      $.trait_function_signature,
      $.associated_type,
    ),

    trait_function_signature: $ => seq(
      'fn',
      field('name', $.identifier),
      optional($.type_parameters),
      '(',
      optional($.parameters),
      ')',
      optional($.return_type),
      optional($.where_clause),
      choice(';', field('body', $.block)),
    ),

    associated_type: $ => seq(
      'type',
      field('name', $.identifier),
      optional(seq(':', $.trait_bounds)),
      optional(seq('=', $._type)),
      ';',
    ),

    // ImplDecl (spec grammar.ebnf:119-120) — trait impls AND inherent impls:
    //   "impl" TypeParams? TraitBound "for" Type WhereClause? "{" ... "}"
    //   "impl" TypeParams? Type WhereClause? "{" ... "}"
    // When `for` is present the first type is the trait and the second is the
    // self type; otherwise the single type is the inherent self type. Impl-body
    // fns may carry visibility (hew-parser/src/parser.rs:2939 parse_impl_decl).
    impl_declaration: $ => seq(
      'impl',
      optional($.type_parameters),
      field('type', $._type),
      optional(seq('for', field('self_type', $._type))),
      optional($.where_clause),
      '{',
      repeat(seq(
        repeat($.attribute),
        optional($.visibility),
        choice($.function_declaration, $.associated_type_impl),
      )),
      '}',
    ),

    associated_type_impl: $ => seq('type', $.identifier, '=', $._type, ';'),

    // ---- Functions ----

    function_declaration: $ => seq(
      'fn',
      field('name', $.identifier),
      optional($.type_parameters),
      '(',
      optional($.parameters),
      ')',
      optional($.return_type),
      optional($.where_clause),
      field('body', $.block),
    ),

    gen_function_declaration: $ => seq(
      'gen',
      'fn',
      field('name', $.identifier),
      optional($.type_parameters),
      '(',
      optional($.parameters),
      ')',
      '->',
      field('yield_type', $._type),
      optional($.where_clause),
      field('body', $.block),
    ),

    // NOTE: bare `async fn` (without `gen`) was removed from the compiler —
    // `hew check` on `async fn f() -> i64 { ... }` fails with "expected 'gen
    // fn' after 'async'". Only the generator form below is real surface.
    async_gen_function_declaration: $ => seq(
      'async',
      'gen',
      'fn',
      field('name', $.identifier),
      optional($.type_parameters),
      '(',
      optional($.parameters),
      ')',
      '->',
      field('yield_type', $._type),
      optional($.where_clause),
      field('body', $.block),
    ),

    parameters: $ => sep1($.parameter, ','),

    // Param (hew-parser `parse_param_decl`) admits `var` or `consume` before
    // an ordinary named parameter. `consume` is the affine FFI/resource
    // ownership modifier, e.g. `fn hew_handle_free(consume h: Handle);`.
    // In trait/impl method position a leading bare receiver is also accepted:
    // `self`, `var self`, or `consuming self` — all without a type annotation, as
    // `Self`-typed receiver sugar (hew-parser/src/parser.rs:5552 and 5634).
    parameter: $ => choice(
      $.self_parameter,
      seq(
        optional(choice('var', 'consume')),
        field('name', $.identifier),
        ':',
        field('type', $._type),
      ),
    ),

    self_parameter: $ => seq(
      optional(choice('var', 'consuming')),
      $.self,
    ),

    return_type: $ => seq('->', $._type),

    // Visibility = "pub" | "package" (spec grammar.ebnf:53; both standalone
    // keywords per hew-parser/src/parser.rs:1863 parse_visibility).
    visibility: $ => choice('pub', 'package'),

    // ---- Actors ----

    actor_declaration: $ => seq(
      'actor',
      field('name', $.identifier),
      optional($.type_parameters),
      optional(seq(':', $.trait_bounds)),
      optional($.where_clause),
      '{',
      repeat(choice(
        $.actor_init,
        $.actor_field,
        $.mailbox_declaration,
        // Receive handlers carry the same declaration attributes as actor
        // methods (for example, `#[every(1s)] receive fn tick() { ... }`).
        // Keep the attributes at the actor-member boundary: the real parser
        // stores them on the handler declaration rather than treating them as
        // standalone items.
        seq(repeat($.attribute), $.receive_function),
        seq(repeat($.attribute), $.receive_gen_function),
        seq(repeat($.attribute), $.function_declaration),
        seq(repeat($.attribute), $.gen_function_declaration),
      )),
      '}',
    ),

    actor_init: $ => seq(
      'init',
      '(',
      optional($.parameters),
      ')',
      $.block,
    ),

    mailbox_declaration: $ => seq(
      'mailbox',
      $.integer_literal,
      optional($.overflow_policy),
      ';',
    ),

    overflow_policy: $ => seq(
      'overflow',
      $.overflow_kind,
    ),

    // @sync:overflow_kinds
    overflow_kind: $ => choice(
      'block', 'drop_new', 'drop_old', 'fail',
      seq('coalesce', '(', $.identifier, ')', optional(seq('fallback', $.overflow_kind))),
    ),

    // ActorFieldDecl (grammar.ebnf:95-96): ("let"|"var")? Ident ":" Type
    //   ("=" Expr)? ";". The bare form (no let/var) is immutable (let-like) by
    //   default; the corpus uses it widely (e.g. examples/mqtt_broker.hew).
    actor_field: $ => seq(
      optional(choice('let', 'var')),
      field('name', $.identifier),
      ':',
      field('type', $._type),
      optional(seq('=', $.expression)),
      ';',
    ),

    receive_function: $ => seq(
      'receive',
      'fn',
      field('name', $.identifier),
      optional($.type_parameters),
      '(',
      optional($.parameters),
      ')',
      optional($.return_type),
      optional($.where_clause),
      field('body', $.block),
    ),

    receive_gen_function: $ => seq(
      'receive',
      'gen',
      'fn',
      field('name', $.identifier),
      optional($.type_parameters),
      '(',
      optional($.parameters),
      ')',
      '->',
      field('yield_type', $._type),
      optional($.where_clause),
      field('body', $.block),
    ),

    // ---- Supervisors ----

    supervisor_declaration: $ => seq(
      'supervisor',
      field('name', $.identifier),
      optional(seq(
        '(',
        optional($.parameters),
        ')',
      )),
      '{',
      repeat(choice($.child_spec, $.supervisor_field)),
      '}',
    ),

    // SupervisorField (spec grammar.ebnf:142-144):
    //   "strategy" ":" SupervisorStrategy
    //   "intensity" ":" IntLit "within" DurationLit
    // `within` is a contextual keyword used only here. DurationLit is reused.
    supervisor_field: $ => choice(
      seq('strategy', ':', field('strategy', $.supervisor_strategy_value), optional(choice(',', ';'))),
      seq('intensity', ':', field('restarts', $.integer_literal), 'within', field('window', $.duration_literal), optional(choice(',', ';'))),
    ),

    child_spec: $ => seq(
      // @sync:child_kinds
      choice('child', 'pool'),
      field('name', $.identifier),
      ':',
      field('actor', $.identifier),
      optional(seq('(', optional(sep1($.call_argument, ',')), ')')),
      repeat($.child_clause),
      ';',
    ),

    child_clause: $ => choice(
      seq('restart', ':', choice('permanent', 'transient', 'temporary')),
      seq('shutdown', ':', $.shutdown_directive),
      seq('wired_to', ':', '{', repeat(seq($.identifier, optional(seq(':', $.identifier)), optional(','))), '}'),
    ),

    // @sync:shutdown_directives
    shutdown_directive: $ => choice(
      $.duration_literal,
      'brutal_kill',
      'infinity',
    ),

    // @sync:duration_suffixes
    duration_literal: $ => seq($.integer_literal, choice('ns', 'us', 'ms', 's', 'm', 'h')),

    // ---- Machines ----

    machine_declaration: $ => seq(
      'machine',
      field('name', $.identifier),
      optional($.type_parameters),
      optional($.where_clause),
      '{',
      field('events_header', $.machine_events_header),
      optional(field('emits_header', $.machine_emits_header)),
      repeat(choice(
        $.machine_state,
        $.machine_transition,
        $.machine_default,
      )),
      '}',
    ),

    // events { EventDecl* }
    machine_events_header: $ => seq(
      'events',
      '{',
      repeat($.machine_event_decl),
      '}',
    ),

    // EventDecl = Ident ( ";" | "{" { StructField } "}" ";"? )
    machine_event_decl: $ => seq(
      field('name', $.identifier),
      choice(
        ';',
        seq('{', repeat($.struct_field), '}', optional(';')),
      ),
    ),

    // emits { Ident ";" * }
    machine_emits_header: $ => seq(
      'emits',
      '{',
      repeat(seq($.identifier, ';')),
      '}',
    ),

    // state Ident ;
    // state Ident { StructFields [entry Block] [exit Block] [CompositeMember*] [TransitionDecl*] } ;?
    machine_state: $ => seq(
      'state',
      field('name', $.identifier),
      optional(
        seq(
          '{',
          repeat($.struct_field),
          optional(seq('entry', field('entry_body', $.block))),
          optional(seq('exit', field('exit_body', $.block))),
          repeat($.machine_composite_member),
          repeat($.machine_transition),
          '}',
        ),
      ),
      optional(';'),
    ),

    // [ "initial" ] StateDecl  — depth-1 composite substate
    machine_composite_member: $ => seq(
      optional('initial'),
      $.machine_state,
    ),

    // on EventIdent [ "(" Ident { "," Ident } ")" ] : Source => Target
    //   [ "reenter" ] [ "when" Expr ] TransitionBody
    // Source/Target = StatePattern = Ident | "_" (grammar.ebnf:171)
    // TransitionBody = ";" | "{" FieldInitList "}" | Block (grammar.ebnf:170)
    //   The `{ FieldInitList }` form supplies the target state's payload, e.g.
    //   `=> Holding { handle: handle }`.
    machine_transition: $ => seq(
      'on',
      field('event', $.identifier),
      optional(seq('(', field('payload_bindings', sep1($.identifier, ',')), ')')),
      ':',
      field('source', choice($.identifier, '_')),
      '=>',
      field('target', choice($.identifier, '_')),
      optional('reenter'),
      optional(seq('when', field('guard', $.expression))),
      choice(
        ';',
        field('payload', seq(
          '{',
          sep1($.field_initializer, ','),
          optional(','),
          '}',
        )),
        field('body', $.block),
      ),
    ),

    // default { state }  — covers all remaining uncovered (state, event) cells
    machine_default: $ => seq(
      'default',
      '{',
      'state',
      '}',
    ),

    // ---- Extern ----

    extern_block: $ => seq(
      'extern',
      $.string_literal,
      '{',
      // Current stdlib extern blocks permit function attributes such as
      // `#[runtime_capability(...)]`; keeping attributes inside the block is
      // necessary for ast-grep's dialect to parse the generated FFI surface.
      repeat(seq(repeat($.attribute), $.extern_function)),
      '}',
    ),

    extern_function: $ => seq(
      'fn',
      field('name', $.identifier),
      '(',
      optional($.parameters),
      ')',
      optional($.return_type),
      optional('...'),
      ';',
    ),

    // ---- Types ----

    type_parameters: $ => seq('<', sep1($.type_parameter, ','), '>'),

    type_parameter: $ => seq(
      $.identifier,
      optional(seq(':', $.trait_bounds)),
    ),

    type_arguments: $ => seq('<', sep1($._type_argument, ','), '>'),

    // A type argument is a type, or an associated-type binding `Ident = Type`
    // (e.g. `Iterator<Item = A>`). The binding form is accepted by the real
    // parser's parse_trait_bound_args (hew-parser/src/parser.rs) for trait
    // bounds; allowing it in any type-arg list is harmlessly permissive.
    _type_argument: $ => choice(
      $._type,
      $.associated_type_binding,
    ),

    associated_type_binding: $ => seq(
      field('name', $.identifier),
      '=',
      field('type', $._type),
    ),

    trait_bounds: $ => sep1($.trait_bound, '+'),

    trait_bound: $ => seq($.identifier, optional($.type_arguments)),

    where_clause: $ => seq(
      'where',
      sep1($.where_predicate, ','),
      optional(','),
    ),

    where_predicate: $ => seq($._type, ':', $.trait_bounds),

    _type: $ => choice(
      $.primitive_type,
      $.identifier,
      $.generic_type,
      $.scoped_type,
      $.tuple_type,
      $.array_type,
      $.slice_type,
      $.function_type,
      $.pointer_type,
      $.borrow_type,
      $.trait_object_type,
      $.unit_type,
    ),

    // @sync:primitive_types
    primitive_type: $ => choice(
      'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'isize', 'usize',
      'f32', 'f64', 'bool', 'char', 'string', 'bytes', 'void', 'duration',
      'instant',
    ),

    generic_type: $ => prec(1, seq($.identifier, $.type_arguments)),

    // Qualified type name: `mod.Type` or `a.b.C`, with an optional trailing
    // type-arg list (e.g. `mod.Worker<T>`). Dotted paths are used throughout
    // the current surface for cross-module types (`net.NetError`, `fs.IoError`).
    scoped_type: $ => seq(
      $.identifier,
      repeat1(seq('.', $.identifier)),
      optional($.type_arguments),
    ),

    tuple_type: $ => seq('(', sep1($._type, ','), ')'),

    unit_type: $ => seq('(', ')'),

    array_type: $ => seq('[', $._type, ';', $.integer_literal, ']'),

    slice_type: $ => seq('[', $._type, ']'),

    function_type: $ => prec(1, seq('fn', '(', optional(sep1($._type, ',')), ')', optional($.return_type))),

    // *const T / *mut T — raw pointer types. Real but FFI/unsafe-scoped; *var T is legacy and rejected.
    pointer_type: $ => seq('*', choice('const', 'mut'), $._type),

    // &T — immutable non-owning borrow marker (hew-parser/src/parser.rs:5126,
    // Token::Ampersand → TypeExpr::Borrow). `&mut T` / `&var T` are rejected.
    borrow_type: $ => seq('&', $._type),

    trait_object_type: $ => seq('dyn', choice(
      $.trait_bound,
      seq('(', $.trait_bounds, ')'),
    )),

    // ---- Statements ----

    block: $ => seq('{', repeat($._statement), '}'),

    _statement: $ => choice(
      $.let_statement,
      $.var_statement,
      $.assignment_statement,
      $.defer_statement,
      $.emit_statement,

      $.for_statement,
      $.while_statement,
      $.while_let_statement,
      $.loop_statement,
      $.break_statement,
      $.continue_statement,
      $.expression_statement,
      $.if_statement,
      $.match_statement,
      $.block_statement,
    ),

    // LetStmt (grammar.ebnf): the initializer is optional — `let x: i64;` is a
    // bare declaration whose definite-assignment is checked later by the move
    // checker (examples/v05/checked-mir/reject/init_before_use.hew).
    let_statement: $ => seq(
      'let',
      field('pattern', $.pattern),
      // `let r? = expr;` is sugar for `let r = expr?;` (hew-parser statements.rs:260).
      // The `?` is only valid after a simple identifier pattern.
      optional('?'),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', choice($.expression, $.block)))),
      // let-else: `let Pat = expr else { <diverging block> };`
      // (hew-parser statements.rs:312-341).
      optional(seq('else', field('else', $.block))),
      ';',
    ),

    var_statement: $ => seq(
      'var',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $.expression),
      ';',
    ),

    assignment_statement: $ => seq(
      field('left', $.expression),
      // @sync:assignment_operators
      field('operator', choice('=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=')),
      field('right', $.expression),
      ';',
    ),

    match_arm: $ => prec(3, seq(
      field('pattern', $.pattern),
      // The compiler accepts a block-valued, including diverging, match guard.
      optional(seq('if', field('guard', choice($.expression, $.block)))),
      '=>',
      field('value', choice(
        seq($.block, optional(',')),
        seq($.expression, optional(',')),
      )),
    )),



    break_statement: $ => seq('break', optional($.label), optional($.expression), ';'),

    continue_statement: $ => seq('continue', optional($.label), ';'),

    // `return [expr]` is an expression (Never-typed) in Hew, not a statement:
    // it is valid in tail position without `;` and inside larger expressions
    // (`b || return 0`, `g(if c { 1 } else { return 0 })`). See hew commit
    // 480456ec5 (return-as-expression) and hew-parser expressions.rs:1125-1150.
    // Statement position is handled by `expression_statement` (optional `;`).
    return_expression: $ => prec.right(seq('return', optional($.expression))),

    // Deferred cleanup may be an expression statement or a scoped block.
    defer_statement: $ => seq('defer', choice($.expression, $.block), ';'),

    // emit EventName { field: value, … } ;  — Mealy output inside a transition body
    emit_statement: $ => seq(
      'emit',
      field('event', $.identifier),
      optional(seq('{', optional(seq(sep1($.field_initializer, ','), optional(','))), '}')),
      ';',
    ),

    expression_statement: $ => seq($.expression, optional(';')),

    if_statement: $ => $.if_expression,
    match_statement: $ => $.match_expression,

    // A block used in statement position may carry a trailing `;`
    // (examples/test_block.hew, examples/lambda_actors.hew).
    block_statement: $ => seq($.block, optional(';')),

    label: $ => /@[a-zA-Z_][a-zA-Z0-9_]*/,

    // ---- Expressions ----

    expression: $ => choice(
      $.identifier,
      $.self,
      $._literal,
      $.interpolated_string,
      $.unary_expression,
      $.binary_expression,
      $.timeout_expression,
      $.call_expression,
      $.method_call_expression,
      $.field_expression,
      $.index_expression,
      $.try_expression,
      $.cast_expression,
      $.await_expression,
      $.await_restart_expression,
      $.clone_expression,
      $.struct_init,
      $.generic_struct_init,
      $.contextual_variant_expression,
      $.contextual_variant_record_init,
      $.generic_apply_expression,
      $.array_expression,
      $.array_repeat,
      $.map_literal,
      $.tuple_expression,
      $.unit_expression,
      $.parenthesized_expression,
      $.if_expression,
      $.match_expression,
      $.lambda,
      $.actor_expression,
      $.spawn_expression,
      $.select_expression,
      $.join_expression,
      $.scope_expression,
      $.this_expression,
      $.yield_expression,
      $.return_expression,
      $.gen_block_expression,
      $.qualified_expression,
      $.generic_call_expression,
      $.bare_generic_call_expression,
      $.byte_array_expression,
      $.unsafe_expression,
    ),

    // @sync:supervisor_strategies
    // Real lexer keywords (hew-lexer lex:189-195); used as the value of the
    // `strategy:` field in a supervisor declaration body.
    supervisor_strategy_value: $ => choice(
      'one_for_one',
      'one_for_all',
      'rest_for_one',
      'simple_one_for_one',
    ),

    unary_expression: $ => prec(PREC.UNARY, seq(
      field('operator', choice('!', '-', '~')),
      field('operand', $.expression),
    )),

    binary_expression: $ => choice(
      prec.left(PREC.OR, seq($.expression, '||', $.expression)),
      prec.left(PREC.BIT_OR, seq($.expression, '|', $.expression)),
      prec.left(PREC.BIT_XOR, seq($.expression, '^', $.expression)),
      prec.left(PREC.AND, seq($.expression, '&&', $.expression)),
      prec.left(PREC.BIT_AND, seq($.expression, '&', $.expression)),
      prec.left(PREC.EQ, seq($.expression, choice('==', '!=', 'is'), $.expression)),
      prec.left(PREC.REL, seq($.expression, choice('<', '<=', '>', '>='), $.expression)),
      prec.right(PREC.RANGE, seq($.expression, choice('..', '..='), $.expression)),
      prec.left(PREC.SHIFT, seq($.expression, choice('<<', '>>'), $.expression)),
      // '+' also concatenates strings; '&+'/'&-' are two's-complement wrapping
      // forms (grammar.ebnf:233, Hew.g4:658).
      prec.left(PREC.ADD, seq($.expression, choice('+', '-', '&+', '&-'), $.expression)),
      // '&*' is two's-complement wrapping multiply (grammar.ebnf:234, Hew.g4:663).
      prec.left(PREC.MUL, seq($.expression, choice('*', '/', '%', '&*'), $.expression)),
    ),

    // Left associativity keeps postfix calls composable after a completed
    // field/call chain (`value.slice(...).to_lower()`).
    call_expression: $ => prec.left(PREC.FIELD + 1, seq(
      field('function', $.expression),
      '(',
      optional(sep1($.call_argument, ',')),
      optional(','),
      ')',
    )),

    // A member call must remain a single postfix expression even where `(`
    // could begin the following match pattern. Its function is structurally a
    // field expression, so this does not overlap plain calls or grouping.
    method_call_expression: $ => prec.dynamic(2, prec.left(PREC.FIELD + 2, seq(
      field('object', $._member_object),
      '.',
      field('method', $.identifier),
      '(',
      optional(sep1($.call_argument, ',')),
      optional(','),
      ')',
    ))),

    _member_object: $ => choice(
      $.identifier,
      $.self,
      $._literal,
      $.parenthesized_expression,
      $.qualified_expression,
      $.call_expression,
      $.field_expression,
      $.index_expression,
      $.method_call_expression,
      $.generic_apply_expression,
    ),

    // Dotted path expression `path.name`. It composes with calls and the generic
    // call form below while keeping path-headed struct inits separate.
    qualified_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('path', $.expression),
      '.',
      field('name', $.identifier),
    )),

    // Generic call `path.method<Type, …>(args)`. Restrict the callee to a dotted
    // path so `a < b` stays unambiguously a comparison. Dynamic precedence commits
    // the `<` to type arguments when a closing `>` and call opener follow.
    generic_call_expression: $ => prec.dynamic(1, prec(PREC.POSTFIX, seq(
      field('function', $.qualified_expression),
      $.type_arguments,
      '(',
      optional(sep1($.call_argument, ',')),
      optional(','),
      ')',
    ))),

    // The compiler accepts a type application before later postfixes, so
    // `Vec<i64>.new()` is distinct from a generic call such as `f<i64>()`.
    generic_apply_expression: $ => prec.dynamic(-1, prec(PREC.POSTFIX, seq(
      field('target', choice($.identifier, $.qualified_expression)),
      token.immediate('<'),
      sep1($._type, ','),
      '>',
    ))),

    // A bare generic call is lexically ambiguous with comparison. Current
    // accepted source spells its type-argument opener adjacent to the callee,
    // which is also the compiler's canonical formatter output. Requiring that
    // adjacency keeps `i < n` and `a < b` unambiguously binary expressions.
    bare_generic_call_expression: $ => prec(PREC.POSTFIX, seq(
      field('function', $.identifier),
      token.immediate('<'),
      sep1($._type, ','),
      '>',
      '(',
      optional(sep1($.call_argument, ',')),
      optional(','),
      ')',
    )),

    call_argument: $ => choice(
      seq(field('name', $.identifier), ':', field('value', $.expression)),
      $.expression,
    ),

    field_expression: $ => prec(PREC.FIELD, seq(
      field('object', $.expression),
      '.',
      field('field', choice($.identifier, $.integer_literal)),
    )),

    index_expression: $ => prec(PREC.POSTFIX, seq(
      field('object', $.expression),
      '[',
      // Indexing and range slicing share the postfix brackets. Both range
      // endpoints are optional (`[..]`, `[..end]`, `[start..]`).
      choice(
        field('index', $.expression),
        seq(optional(field('start', $.expression)), choice('..', '..='), optional(field('end', $.expression))),
      ),
      ']',
    )),

    try_expression: $ => prec(PREC.POSTFIX, seq(
      $.expression,
      '?',
    )),

    cast_expression: $ => prec(PREC.POSTFIX, seq(
      field('value', $.expression),
      'as',
      field('type', $._type),
    )),

    await_expression: $ => prec(PREC.UNARY, seq(
      'await',
      choice($.expression, $.block),
    )),

    // `await_restart <supervised-child accessor>` suspends until a supervised
    // child restarts (hew commit 82015e997; expressions.rs:134-138). Prefix
    // operator, same shape/precedence as `await`.
    await_restart_expression: $ => prec(PREC.UNARY, seq(
      'await_restart',
      $.expression,
    )),

    // `clone <operand>` prefix duplication (grammar.ebnf:242-248). Contextual:
    // `clone` is only a prefix when an operand follows; `x.clone()`, `fn clone()`,
    // and `clone(args)` keep `clone` as an ordinary identifier (tree-sitter keyword
    // extraction via word:$.identifier preserves identifier use elsewhere).
    clone_expression: $ => prec(PREC.UNARY, seq(
      'clone',
      $.expression,
    )),

    struct_init: $ => prec.dynamic(1, seq(
      field('name', choice($.identifier, $.path_expression)),
      '{',
      optional(seq(sep1($.field_initializer, ','), optional(','))),
      '}',
    )),

    // As with a bare generic call, adjacency of `<` distinguishes a generic
    // constructor from comparison while preserving `i < n`.
    generic_struct_init: $ => prec.dynamic(2, seq(
      field('name', choice($.identifier, $.path_expression)),
      token.immediate('<'),
      sep1($._type, ','),
      '>',
      '{',
      optional(seq(sep1($.field_initializer, ','), optional(','))),
      '}',
    )),

    // Expected-type contextual enum constructors are valid expressions in all
    // three payload forms: `.None`, `.Some(value)`, and `.Ready { value }`.
    contextual_variant_expression: $ => prec(PREC.POSTFIX, seq(
      '.',
      field('name', $.identifier),
    )),

    contextual_variant_record_init: $ => prec.dynamic(2, seq(
      '.',
      field('name', $.identifier),
      '{',
      optional(seq(sep1($.field_initializer, ','), optional(','))),
      '}',
    )),

    field_initializer: $ => seq(
      choice(
        seq(field('name', $.identifier), ':', field('value', $.expression)),
        seq('..', field('spread', $.expression)),
      ),
    ),

    array_expression: $ => seq(
      '[',
      optional(seq(sep1($.expression, ','), optional(','))),
      ']',
    ),

    // Byte array literal `bytes[0x41, 0x42]` (grammar.ebnf:260
    //   Primary `"bytes" "[" ExprList? "]"`). The opener is a single merged
    //   `bytes[` token (not a bare `bytes` keyword) so the lexeme reserved is
    //   `bytes[`, never bare `bytes`; this keeps `bytes` usable as a value path
    //   (`bytes.new()`, 35× in std) and as the `bytes` primitive type. Requires
    //   `[` adjacent to `bytes`, which is the only literal form (0 spaced uses).
    // The compiler also accepts ordinary whitespace between the keyword and
    // opener.  Keep the opener merged so bare `bytes` remains usable as a path
    // or primitive type; splitting it into `bytes`, `[` would reserve every
    // `bytes.new()` expression as the start of this literal.
    byte_array_expression: $ => seq(
      token(choice(seq('bytes', '['), /bytes[ \t\r\n]+\[/)),
      optional(seq(sep1($.expression, ','), optional(','))),
      ']',
    ),

    array_repeat: $ => seq('[', $.expression, ';', $.expression, ']'),

    map_literal: $ => seq(
      '{',
      optional(seq(sep1($.map_entry, ','), optional(','))),
      '}',
    ),

    map_entry: $ => seq(
      field('key', $.expression),
      ':',
      field('value', $.expression),
    ),

    tuple_expression: $ => seq('(', $.expression, ',', optional(sep1($.expression, ',')), ')'),

    parenthesized_expression: $ => seq('(', $.expression, ')'),

    // Unit value `()` — the empty tuple expression (hew-parser/src/parser.rs
    // parse_primary: `( )` → Expr::Tuple(Vec::new())). Distinct from the unit
    // *type* `()` which appears only in type position.
    unit_expression: $ => seq('(', ')'),

    if_expression: $ => prec.right(choice(
      seq(
        'if',
        field('condition', choice($.expression, $.block)),
        field('consequence', $.block),
        optional(field('alternative', $.else_clause)),
      ),
      seq(
        'if',
        'let',
        field('pattern', $.pattern),
        '=',
        field('value', $.expression),
        field('consequence', $.block),
        optional(field('alternative', $.else_clause)),
      ),
    )),

    else_clause: $ => seq('else', choice($.if_expression, $.block)),

    match_expression: $ => seq(
      'match',
      field('value', $.expression),
      '{',
      repeat($.match_arm),
      '}',
    ),

    // TimeoutExpr (grammar.ebnf:228-230): `RangeExpr ( "|" "after" Expr )?` — any
    // expression may carry a trailing `| after <duration>` timeout race (e.g.
    // `match await f.answer() | after 5s { … }`). The `after` keyword right after
    // `|` is what distinguishes this from a bit-or; it binds looser than `||`.
    timeout_expression: $ => prec.left(1, seq(
      field('expr', $.expression),
      '|',
      'after',
      field('duration', $.expression),
    )),

    // Closures are PIPE-style (spec grammar.ebnf:288-295):
    //   Lambda = "move"? "|" LambdaParams? "|" Expr
    //          | "move"? "||" Expr
    //          | "move"? "|" LambdaParams? "|" RetType Block ;
    // The paren-arrow `(params) => body` form was removed in v0.5
    // (compiler emits E_CLOSURE_PIPE_SYNTAX). An empty parameter list is the
    // single `||` token because the lexer fuses adjacent pipes; the bracketed
    // form `|params|` uses two distinct `|` tokens. A return type forces a
    // braced body (hew-parser/src/parser.rs:7691 parse_pipe_lambda).
    lambda: $ => prec.right(2, seq(
      optional('move'),
      field('parameters', choice(
        '||',
        seq('|', optional(sep1($.lambda_parameter, ',')), '|'),
      )),
      choice(
        seq($.return_type, field('body', $.block)),
        field('body', $.block),
        field('body', $.expression),
      ),
    )),

    lambda_parameter: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
    ),

    // actor [move] |params| [-> Ret] { body } — inline actor literal (v0.5)
    // Replaces the removed `spawn (...) => ...` lambda-actor form.
    actor_expression: $ => prec(2, seq(
      'actor',
      optional('move'),
      '|',
      optional(sep1($.lambda_parameter, ',')),
      '|',
      optional($.return_type),
      field('body', $.block),
    )),

    spawn_expression: $ => seq(
      'spawn',
      $.actor_spawn,
    ),

    actor_spawn: $ => seq(
      field('actor', $.identifier),
      optional($.type_arguments),
      optional(seq(
        '(',
        optional(sep1($.call_argument, ',')),
        ')',
      )),
    ),

    select_expression: $ => seq(
      'select',
      '{',
      repeat($.select_arm),
      '}',
    ),

    // SelectArm (grammar.ebnf:306-307): `Pattern "from" Expr "=>" Expr ","?` and
    // the timeout arm `"after" Expr "=>" Expr ","?`. The arm body may be a block
    // (examples/channel/select_recv.hew) and the trailing comma is optional.
    select_arm: $ => choice(
      seq(field('binding', $.pattern), 'from', field('channel', $.expression), '=>', field('body', choice($.block, $.expression)), optional(',')),
      seq('after', field('duration', $.expression), '=>', field('body', choice($.block, $.expression)), optional(',')),
    ),

    // JoinExpr (grammar.ebnf:309): "join" ("{" | "(") Expr {"," Expr} ","?
    //   ("}" | ")"). Both the brace and paren delimiters are accepted.
    join_expression: $ => seq(
      'join',
      choice(
        seq('{', sep1($.expression, ','), optional(','), '}'),
        seq('(', sep1($.expression, ','), optional(','), ')'),
      ),
    ),

    loop_statement: $ => prec(10, seq(
      optional(seq($.label, ':')),
      'loop',
      $.block,
    )),

    for_statement: $ => prec(10, seq(
      optional(seq($.label, ':')),
      'for',
      optional('await'),
      field('pattern', $.pattern),
      'in',
      field('iterable', choice($.expression, $.block)),
      field('body', $.block),
    )),

    while_statement: $ => prec(10, seq(
      optional(seq($.label, ':')),
      'while',
      field('condition', choice($.expression, $.block)),
      field('body', $.block),
    )),

    while_let_statement: $ => prec(10, seq(
      optional(seq($.label, ':')),
      'while',
      'let',
      field('pattern', $.pattern),
      '=',
      field('value', $.expression),
      field('body', $.block),
    )),

    // ScopeExpr (grammar.ebnf:317): `scope Block`. The structured-concurrency
    // body additionally admits `fork`/`after(d)` child & deadline statements,
    // which are ONLY legal inside a scope (grammar.ebnf:313-319). Keeping them
    // out of the general expression set is what lets `after`/`fork` stay usable
    // as ordinary identifiers everywhere else.
    scope_expression: $ => seq(
      'scope',
      field('body', $.scope_block),
    ),

    // Gen-block expression `gen { … }` (hew-parser/src/parser.rs:7433
    //   `Token::Gen` immediately followed by `{` → `Expr::GenBlock`). Distinct
    //   from the item-level `gen fn`; the body is an ordinary block whose
    //   statements may include `yield`. Corpus: examples/machine/
    //   reject_gen_in_transition.hew, tests/vertical-slice/accept/gen_block_*.hew.
    gen_block_expression: $ => seq(
      'gen',
      field('body', $.block),
    ),

    scope_block: $ => seq('{', repeat($._scope_statement), '}'),

    _scope_statement: $ => choice(
      $.fork_statement,
      $.scope_deadline,
      $._statement,
    ),

    // ForkChild (grammar.ebnf:320): `fork (Ident "=")? Expr`, plus the block form
    // `fork { ... }`. Statement-positioned inside a scope body.
    fork_statement: $ => choice(
      seq('fork', field('body', $.block), optional(';')),
      prec.dynamic(10, seq('fork', field('binding', $.identifier), '=', field('expr', $.expression), ';')),
      seq('fork', field('expr', $.expression), ';'),
    ),

    // ScopeDeadline (grammar.ebnf:318): `after "(" Expr ")" Block`, statement-only
    // inside a scope body.
    scope_deadline: $ => seq(
      'after',
      '(',
      field('duration', $.expression),
      ')',
      field('body', $.block),
      optional(';'),
    ),

    this_expression: $ => 'this',
    // YieldExpr (grammar.ebnf:322): "yield" Expr? — the operand is optional, so
    //   bare `yield;` is valid (yields Unit). `prec.right` makes `yield expr`
    //   greedily consume the operand rather than reduce `yield` on its own.
    yield_expression: $ => prec.right(seq('yield', optional($.expression))),

    unsafe_expression: $ => seq('unsafe', $.block),

    // Path expression — N-segment `a.b.C`. Used as a value path, in patterns,
    // and as a struct-init head (`Enum.Variant { .. }`, `mod.Type.Variant { .. }`).
    path_expression: $ => prec.left(seq(
      $.identifier,
      repeat1(seq('.', $.identifier)),
    )),



    // ---- Patterns ----

    pattern: $ => choice(
      '_',
      $.identifier,
      $.path_expression,
      $._literal,
      seq('-', $.integer_literal),
      '()',
      $.tuple_pattern,
      $.struct_pattern,
      $.record_pattern,
      $.variant_pattern,
      $.constructor_pattern,
      $.or_pattern,
    ),

    tuple_pattern: $ => seq('(', sep1($.pattern, ','), ')'),

    // Shorthand record destructure `{ a, b }` / `{ a: p, b }` with no type name
    // (hew commit 6098d7ef9; hew-parser patterns.rs:190-213). The record type is
    // inferred from the scrutinee.
    record_pattern: $ => seq(
      '{',
      optional($._record_pattern_fields),
      '}',
    ),

    // Leading-dot variant pattern `.Variant`, `.Variant(p, …)`, `.Variant { f: p }`
    // (hew commit 99913e044; hew-parser patterns.rs:67-113). The enum type is left
    // implicit and resolved against the match scrutinee.
    variant_pattern: $ => seq(
      '.',
      field('name', $.identifier),
      optional(choice(
        seq('(', optional(seq(sep1($.pattern, ','), optional(','))), ')'),
        seq('{', optional($._record_pattern_fields), '}'),
      )),
    ),

    struct_pattern: $ => seq(
      field('name', choice($.identifier, $.path_expression)),
      '{',
      optional($._record_pattern_fields),
      '}',
    ),

    // A record-like pattern may end with `..` to ignore all unlisted fields.
    // Keeping rest terminal-only matches the compiler's `Pattern::{Struct,
    // RecordShorthand}` parser and admits nested/rest-only forms through the
    // recursive `pattern_field` production.
    _record_pattern_fields: $ => choice(
      '..',
      seq(sep1($.pattern_field, ','), ',', '..', optional(',')),
      seq(sep1($.pattern_field, ','), optional(',')),
    ),

    pattern_field: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('pattern', $.pattern))),
    ),

    constructor_pattern: $ => seq(
      field('name', choice($.identifier, $.path_expression)),
      '(',
      optional(sep1($.pattern, ',')),
      ')',
    ),

    or_pattern: $ => prec.left(seq($.pattern, '|', $.pattern)),

    // ---- Literals ----

    _literal: $ => choice(
      $.duration_literal,
      $.integer_literal,
      $.float_literal,
      $.string_literal,
      $.raw_string_literal,
      $.byte_string_literal,
      $.char_literal,
      $.regex_literal,
      $.boolean_literal,
      $.none_literal,
    ),

    // The active interpolation suite exercises integer-width spellings (for
    // example `f"{255u8}"`). Treat each as one literal token so highlighting
    // and ast-grep preserve the expression boundary instead of showing a
    // literal followed by an identifier.
    integer_literal: $ => token(choice(
      /0[xX][0-9a-fA-F][0-9a-fA-F_]*(i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
      /0[bB][01][01_]*(i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
      /0[oO][0-7][0-7_]*(i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
      /[0-9][0-9_]*(i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
    )),

    float_literal: $ => token(
      /[0-9][0-9_]*\.[0-9][0-9_]*([eE][+-]?[0-9][0-9_]*)?/,
    ),

    string_literal: $ => seq(
      '"',
      repeat(choice(
        $.string_content,
        $.escape_sequence,
      )),
      '"',
    ),

    string_content: $ => token.immediate(prec(1, /[^"\\]+/)),

    // Escapes mirror the real lexer, which accepts `\` + any char (hew-lexer
    // regex `\\.` and the interpolated-string scanner's `\\` => skip-2). The
    // `\u{..}` and `\xHH` branches are split out so they form one token (and so
    // an `\u{..}` inside an f-string is not mistaken for an interpolation); the
    // `/./` fallback covers `\n \r \t \\ \" \' \0 \{ \}` and any other escape.
    escape_sequence: $ => token.immediate(seq(
      '\\',
      choice(
        /u\{[0-9a-fA-F]{1,6}\}/,
        /x[0-9a-fA-F]{2}/,
        /./,
      ),
    )),

    interpolated_string: $ => seq(
      $.fstring_start,
      repeat(choice(
        alias($.interpolated_string_content, $.string_content),
        $.escape_sequence,
        $.interpolation,
      )),
      '"',
    ),

    fstring_start: $ => token(prec(2, /f"/)),

    // Exclude `\` (as well as `"` and `{`) so escape sequences like `\"` are
    // not swallowed into content — this is what lets escapes resume correctly
    // after an interpolation closes (spec grammar.ebnf:385-386, InterpPart).
    interpolated_string_content: $ => token.immediate(prec(1, /[^"\\{]+/)),

    // `{expr:?}` requests explicit structural/debug rendering (StringPart::
    // StructuralExpr, hew-parser parser/mod.rs:547-552 — a literal `:?`
    // suffix stripped from the trimmed sub-expression text, not a general
    // format-spec mini-language).
    interpolation: $ => seq(
      token.immediate('{'),
      $.expression,
      optional(seq(':', '?')),
      '}',
    ),

    raw_string_literal: $ => token(seq(
      'r"',
      /[^"]*/,
      '"',
    )),

    byte_string_literal: $ => token(seq(
      'b"',
      /([^"\\]|\\.)*/,
      '"',
    )),

    // Char literal — ported from the hew-lexer regex (hew-lexer/src/lib.rs:502):
    //   '([^'\\]|\\u\{[0-9a-fA-F]{1,6}\}|\\x[0-9a-fA-F][0-9a-fA-F]|\\.)'
    char_literal: $ => token(/'([^'\\]|\\u\{[0-9a-fA-F]{1,6}\}|\\x[0-9a-fA-F][0-9a-fA-F]|\\.)'/),

    regex_literal: $ => token(seq(
      're"',
      /[^"]*/,
      '"',
    )),

    // @sync:boolean_literals
    boolean_literal: $ => choice('true', 'false'),

    none_literal: $ => 'None',

    self: $ => 'self',

    // ---- Comments ----

    line_comment: $ => token(seq('//', /[^\n]*/)),

    block_comment: $ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

    // ---- Identifiers ----

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,
  },
});

/**
 * Comma-separated list with at least one element.
 */
function sep1(rule, sep) {
  return seq(rule, repeat(seq(sep, rule)));
}
