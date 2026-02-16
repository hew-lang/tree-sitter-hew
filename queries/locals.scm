; locals.scm — Variable scoping for Hew

; Scope boundaries
(function_declaration) @local.scope
(block) @local.scope
(for_statement) @local.scope
(while_statement) @local.scope
(loop_statement) @local.scope
(lambda) @local.scope
(receive_function) @local.scope

; Definitions
(let_statement
  pattern: (pattern (identifier) @local.definition))

(var_statement
  name: (identifier) @local.definition)

(parameter
  name: (identifier) @local.definition)

; References
(identifier) @local.reference
