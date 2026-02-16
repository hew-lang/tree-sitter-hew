/**
 * @file Hew grammar for tree-sitter
 * @author Hew Contributors
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Precedence levels (from Pratt parser in hew-parser/src/parser.rs)
const PREC = {
  SEND: 1,        // <-
  OR: 3,          // || or
  AND: 5,         // && and
  EQ: 7,          // == !=
  REL: 9,         // < <= > >=
  RANGE: 11,      // .. ..=
  ADD: 13,        // + -
  MUL: 15,        // * / %
  UNARY: 17,      // ! - await
  POSTFIX: 19,    // . () [] ?
  FIELD: 20,      // field access
};

export default grammar({
  name: "hew",

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.expression, $.lambda_parameter],
    [$.if_statement, $.expression],
    [$.match_statement, $.expression],
    [$.expression, $.struct_init],
  ],

  rules: {
    source_file: $ => repeat($._item),

    // ---- Items ----

    _item: $ => choice(
      $.import_declaration,
      $.const_declaration,
      $.struct_declaration,
      $.enum_declaration,
      $.wire_declaration,
      $.trait_declaration,
      $.impl_declaration,
      $.function_declaration,
      $.gen_function_declaration,
      $.async_gen_function_declaration,
      $.async_function_declaration,
      $.extern_block,
      $.actor_declaration,
      $.supervisor_declaration,
      $.type_alias,
    ),

    import_declaration: $ => seq(
      'import',
      $.module_path,
      optional(seq('::', $._import_spec)),
      ';',
    ),

    module_path: $ => prec.left(sep1($.identifier, '::')),

    _import_spec: $ => choice(
      $.identifier,
      seq('{', sep1($.identifier, ','), '}'),
      '*',
    ),

    const_declaration: $ => seq(
      optional($.visibility),
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

    struct_declaration: $ => seq(
      optional($.visibility),
      choice('struct', 'type'),
      field('name', $.identifier),
      optional($.type_parameters),
      optional($.where_clause),
      field('body', $.struct_body),
    ),

    struct_body: $ => seq('{', repeat($.struct_field), '}'),

    struct_field: $ => seq(
      optional('var'),
      field('name', $.identifier),
      ':',
      field('type', $._type),
      optional(choice(',', ';')),
    ),

    enum_declaration: $ => seq(
      optional($.visibility),
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
      optional(choice(',', ';')),
    ),

    // "type X { ... }" is a struct alias form
    // handled by struct_declaration with choice('struct', 'type')

    wire_declaration: $ => seq(
      'wire',
      choice('struct', 'enum'),
      field('name', $.identifier),
      field('body', $.wire_body),
    ),

    wire_body: $ => seq('{', repeat(choice($.wire_field, $.variant, $.reserved_declaration)), '}'),

    wire_field: $ => prec.left(seq(
      field('name', $.identifier),
      ':',
      field('type', $.wire_type),
      optional(seq('@', $.integer_literal)),
      repeat($.wire_attribute),
      optional(choice(',', ';')),
    )),

    wire_type: $ => choice(
      'u8', 'u16', 'u32', 'u64',
      'i8', 'i16', 'i32', 'i64',
      'f32', 'f64',
      'bool', 'bytes', 'string',
      $.identifier,
      seq('list', '[', $.wire_type, ']'),
    ),

    reserved_declaration: $ => seq(
      'reserved', '(', sep1($.integer_literal, ','), ')', ';',
    ),

    wire_attribute: $ => choice(
      'optional',
      'deprecated',
      seq('default', '(', $.expression, ')'),
      seq('reserved', '(', sep1($.integer_literal, ','), ')'),
    ),

    // ---- Traits & Impls ----

    trait_declaration: $ => seq(
      'trait',
      field('name', $.identifier),
      optional($.type_parameters),
      optional(seq(':', $.trait_bounds)),
      optional($.where_clause),
      '{',
      repeat($._trait_item),
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
      choice(';', field('body', $.block)),
    ),

    associated_type: $ => seq(
      'type',
      field('name', $.identifier),
      optional(seq(':', $.trait_bounds)),
      optional(seq('=', $._type)),
      ';',
    ),

    impl_declaration: $ => seq(
      'impl',
      optional($.type_parameters),
      field('trait', $.identifier),
      optional($.type_arguments),
      'for',
      field('type', $._type),
      optional($.where_clause),
      '{',
      repeat(choice($.function_declaration, $.associated_type_impl)),
      '}',
    ),

    associated_type_impl: $ => seq('type', $.identifier, '=', $._type, ';'),

    // ---- Functions ----

    function_declaration: $ => seq(
      optional($.visibility),
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

    async_function_declaration: $ => seq(
      'async',
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

    parameter: $ => seq(
      field('name', choice($.identifier, $.self)),
      ':',
      field('type', $._type),
    ),

    return_type: $ => seq('->', $._type),

    visibility: $ => seq('pub', optional(seq('(', choice('package', 'super'), ')'))),

    // ---- Actors ----

    actor_declaration: $ => seq(
      'actor',
      field('name', $.identifier),
      optional($.type_parameters),
      optional(seq(':', $.trait_bounds)),
      optional($.where_clause),
      '{',
      optional($.actor_init),
      repeat(choice(
        $.actor_field,
        $.mailbox_declaration,
        $.receive_function,
        $.receive_gen_function,
        $.function_declaration,
        $.gen_function_declaration,
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

    overflow_kind: $ => choice(
      'block',
      'drop_new',
      'drop_old',
      'fail',
      seq('coalesce', '(', $.identifier, ')', optional(seq('fallback', $.overflow_kind))),
    ),

    actor_field: $ => seq(
      choice('let', 'var'),
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
      '{',
      repeat(choice($.child_spec, $.supervisor_field)),
      '}',
    ),

    supervisor_field: $ => prec(5, seq(
      field('name', $.identifier),
      ':',
      field('value', $.expression),
      optional(choice(',', ';')),
    )),

    child_spec: $ => seq(
      'child',
      field('name', $.identifier),
      ':',
      field('actor', $.identifier),
      optional($.restart_spec),
      ';',
    ),

    restart_spec: $ => seq(
      'restart',
      '(',
      choice('permanent', 'transient', 'temporary'),
      ')',
      optional(seq('budget', '(', $.integer_literal, ',', $.duration_literal, ')')),
      optional(seq('strategy', '(', choice('one_for_one', 'one_for_all', 'rest_for_one'), ')')),
    ),

    duration_literal: $ => seq($.integer_literal, choice('ns', 'us', 'ms', 's', 'm', 'h')),

    // ---- Extern ----

    extern_block: $ => seq(
      'extern',
      $.string_literal,
      '{',
      repeat($.extern_function),
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

    type_arguments: $ => seq('<', sep1($._type, ','), '>'),

    trait_bounds: $ => sep1($.trait_bound, '+'),

    trait_bound: $ => seq($.identifier, optional($.type_arguments)),

    where_clause: $ => seq(
      'where',
      sep1($.where_predicate, ','),
    ),

    where_predicate: $ => seq($._type, ':', $.trait_bounds),

    _type: $ => choice(
      $.primitive_type,
      $.identifier,
      $.generic_type,
      $.tuple_type,
      $.array_type,
      $.slice_type,
      $.function_type,
      $.pointer_type,
      $.trait_object_type,
      $.unit_type,
    ),

    primitive_type: $ => choice(
      'i8', 'i16', 'i32', 'i64',
      'u8', 'u16', 'u32', 'u64',
      'f32', 'f64',
      'isize', 'usize',
      'bool', 'char', 'string', 'bytes', 'void',
    ),

    generic_type: $ => prec(1, seq($.identifier, $.type_arguments)),

    tuple_type: $ => seq('(', sep1($._type, ','), ')'),

    unit_type: $ => seq('(', ')'),

    array_type: $ => seq('[', $._type, ';', $.integer_literal, ']'),

    slice_type: $ => seq('[', $._type, ']'),

    function_type: $ => prec(1, seq('fn', '(', optional(sep1($._type, ',')), ')', optional($.return_type))),

    pointer_type: $ => seq('*', optional(choice('const', 'mut')), $._type),

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


      $.for_statement,
      $.while_statement,
      $.loop_statement,
      $.break_statement,
      $.continue_statement,
      $.return_statement,
      $.expression_statement,
      $.if_statement,
      $.match_statement,
      $.block_statement,
    ),

    let_statement: $ => seq(
      'let',
      field('pattern', $.pattern),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $.expression),
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
      field('operator', choice('=', '+=', '-=', '*=', '/=', '%=')),
      field('right', $.expression),
      ';',
    ),

    match_arm: $ => prec(3, seq(
      field('pattern', $.pattern),
      optional(seq('if', field('guard', $.expression))),
      '=>',
      field('value', choice(
        seq($.block, optional(',')),
        seq($.expression, optional(',')),
      )),
    )),



    break_statement: $ => seq('break', optional($.label), optional($.expression), ';'),

    continue_statement: $ => seq('continue', optional($.label), ';'),

    return_statement: $ => seq('return', optional($.expression), ';'),

    expression_statement: $ => seq($.expression, optional(';')),

    if_statement: $ => $.if_expression,
    match_statement: $ => $.match_expression,

    block_statement: $ => $.block,

    label: $ => seq("'", $.identifier),

    // ---- Expressions ----

    expression: $ => choice(
      $.identifier,
      $.self,
      $._literal,
      $.interpolated_string,
      $.unary_expression,
      $.binary_expression,
      $.call_expression,
      $.method_call_expression,
      $.field_expression,
      $.index_expression,
      $.try_expression,
      $.await_expression,
      $.struct_init,
      $.array_expression,
      $.array_repeat,
      $.tuple_expression,
      $.parenthesized_expression,
      $.if_expression,
      $.match_expression,
      $.lambda,
      $.spawn_expression,
      $.select_expression,
      $.join_expression,
      $.race_expression,
      $.scope_expression,
      $.scope_launch,
      $.scope_cancel,
      $.scope_check,
      $.cooperate_expression,
      $.yield_expression,
      $.path_expression,
      $.try_catch_expression,
      $.unsafe_expression,
    ),

    unary_expression: $ => prec(PREC.UNARY, seq(
      field('operator', choice('!', '-')),
      field('operand', $.expression),
    )),

    binary_expression: $ => choice(
      prec.right(PREC.SEND, seq($.expression, '<-', $.expression)),
      prec.left(PREC.OR, seq($.expression, choice('||', 'or'), $.expression)),
      prec.left(PREC.AND, seq($.expression, choice('&&', 'and'), $.expression)),
      prec.left(PREC.EQ, seq($.expression, choice('==', '!='), $.expression)),
      prec.left(PREC.REL, seq($.expression, choice('<', '<=', '>', '>='), $.expression)),
      prec.right(PREC.RANGE, seq($.expression, choice('..', '..='), $.expression)),
      prec.left(PREC.ADD, seq($.expression, choice('+', '-'), $.expression)),
      prec.left(PREC.MUL, seq($.expression, choice('*', '/', '%'), $.expression)),
    ),

    call_expression: $ => prec(PREC.POSTFIX, seq(
      field('function', $.expression),
      '(',
      optional(sep1($.expression, ',')),
      optional(','),
      ')',
    )),

    method_call_expression: $ => prec(PREC.POSTFIX, seq(
      field('object', $.expression),
      '.',
      field('method', $.identifier),
      '(',
      optional(sep1($.expression, ',')),
      optional(','),
      ')',
    )),

    field_expression: $ => prec(PREC.FIELD, seq(
      field('object', $.expression),
      '.',
      field('field', choice($.identifier, $.integer_literal)),
    )),

    index_expression: $ => prec(PREC.POSTFIX, seq(
      field('object', $.expression),
      '[',
      field('index', $.expression),
      ']',
    )),

    try_expression: $ => prec(PREC.POSTFIX, seq(
      $.expression,
      '?',
    )),

    await_expression: $ => prec(PREC.UNARY, seq(
      'await',
      $.expression,
    )),

    struct_init: $ => prec.dynamic(1, seq(
      field('name', $.identifier),
      '{',
      sep1($.field_initializer, ','),
      optional(','),
      '}',
    )),

    field_initializer: $ => seq(
      field('name', $.identifier),
      ':',
      field('value', $.expression),
    ),

    array_expression: $ => seq(
      '[',
      optional(seq(sep1($.expression, ','), optional(','))),
      ']',
    ),

    array_repeat: $ => seq('[', $.expression, ';', $.expression, ']'),

    tuple_expression: $ => seq('(', $.expression, ',', optional(sep1($.expression, ',')), ')'),

    parenthesized_expression: $ => seq('(', $.expression, ')'),

    if_expression: $ => prec.right(seq(
      'if',
      field('condition', $.expression),
      field('consequence', $.block),
      optional(field('alternative', $.else_clause)),
    )),

    else_clause: $ => seq('else', choice($.if_expression, $.block)),

    match_expression: $ => seq(
      'match',
      field('value', $.expression),
      '{',
      repeat($.match_arm),
      '}',
    ),

    lambda: $ => prec(2, seq(
      optional('move'),
      '(',
      optional(sep1($.lambda_parameter, ',')),
      ')',
      optional($.return_type),
      '=>',
      choice($.expression, $.block),
    )),

    lambda_parameter: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
    ),

    spawn_expression: $ => seq(
      'spawn',
      choice(
        $.actor_spawn,
        $.lambda_actor,
      ),
    ),

    actor_spawn: $ => seq(
      field('actor', $.identifier),
      optional($.type_arguments),
      '(',
      optional(sep1($.expression, ',')),
      ')',
    ),

    lambda_actor: $ => prec(2, seq(
      optional('move'),
      '(',
      optional(sep1($.lambda_parameter, ',')),
      ')',
      optional($.return_type),
      '=>',
      choice($.expression, $.block),
    )),

    select_expression: $ => seq(
      'select',
      '{',
      repeat($.select_arm),
      '}',
    ),

    select_arm: $ => choice(
      seq($.identifier, 'from', $.expression, '=>', $.expression, ','),
      seq('after', $.expression, '=>', $.expression, ','),
    ),

    join_expression: $ => seq(
      'join',
      '{',
      sep1($.expression, ','),
      optional(','),
      '}',
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
      field('iterable', $.expression),
      field('body', $.block),
    )),

    while_statement: $ => prec(10, seq(
      optional(seq($.label, ':')),
      'while',
      field('condition', $.expression),
      field('body', $.block),
    )),

    scope_expression: $ => seq('scope', $.block),
    scope_launch: $ => seq('scope', '.', 'launch', $.block),
    scope_cancel: $ => seq('scope', '.', 'cancel', '(', ')'),
    scope_check: $ => seq('scope', '.', 'is_cancelled', '(', ')'),
    cooperate_expression: $ => 'cooperate',
    yield_expression: $ => seq('yield', $.expression),

    try_catch_expression: $ => seq(
      'try',
      field('body', $.block),
      optional(seq(
        'catch',
        optional(field('binding', $.identifier)),
        field('handler', $.block),
      )),
    ),

    unsafe_expression: $ => seq('unsafe', $.block),

    race_expression: $ => seq(
      'race',
      '{',
      repeat($.select_arm),
      '}',
    ),

    path_expression: $ => seq($.identifier, '::', $.identifier),



    // ---- Patterns ----

    pattern: $ => choice(
      '_',
      $.identifier,
      $.path_expression,
      $._literal,
      $.tuple_pattern,
      $.struct_pattern,
      $.constructor_pattern,
      $.or_pattern,
    ),

    tuple_pattern: $ => seq('(', sep1($.pattern, ','), ')'),

    struct_pattern: $ => seq(
      field('name', $.identifier),
      '{',
      optional(seq(sep1($.pattern_field, ','), optional(','))),
      '}',
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
      $.integer_literal,
      $.float_literal,
      $.string_literal,
      $.boolean_literal,
      $.none_literal,
    ),

    integer_literal: $ => token(choice(
      /0[xX][0-9a-fA-F][0-9a-fA-F_]*/,
      /0[bB][01][01_]*/,
      /[0-9][0-9_]*/,
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

    escape_sequence: $ => token.immediate(seq(
      '\\',
      choice(
        /[nrt\\"0]/,
        /x[0-9a-fA-F]{2}/,
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

    interpolated_string_content: $ => token.immediate(prec(1, /[^"\{]+/)),

    interpolation: $ => seq(
      token.immediate('{'),
      $.expression,
      '}',
    ),

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
