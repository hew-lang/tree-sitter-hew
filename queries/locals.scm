; locals.scm — Variable scoping for Hew

; Scope boundaries
(function_declaration) @local.scope
(async_function_declaration) @local.scope
(gen_function_declaration) @local.scope
(async_gen_function_declaration) @local.scope
(block) @local.scope
(for_statement) @local.scope
(while_statement) @local.scope
(loop_statement) @local.scope
(lambda) @local.scope
(receive_function) @local.scope
(receive_gen_function) @local.scope
(match_arm) @local.scope
(if_expression) @local.scope
(scope_expression) @local.scope

; Definitions
(let_statement
  pattern: (pattern (identifier) @local.definition))

(var_statement
  name: (identifier) @local.definition)

(parameter
  name: (identifier) @local.definition)

(lambda_parameter
  name: (identifier) @local.definition)

(for_statement
  pattern: (pattern (identifier) @local.definition))

(scope_expression
  binding: (identifier) @local.definition)

; References
(identifier) @local.reference
