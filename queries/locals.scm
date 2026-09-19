; locals.scm — Variable scoping for Hew

; Scope boundaries
(function_declaration) @local.scope
(gen_function_declaration) @local.scope
(block) @local.scope
(for_statement) @local.scope
(while_statement) @local.scope
(loop_statement) @local.scope
(lambda) @local.scope
(actor_expression) @local.scope
(receive_function) @local.scope
(receive_gen_function) @local.scope
(match_arm) @local.scope
(if_expression) @local.scope
(scope_expression) @local.scope
(handle_expression) @local.scope

; Definitions
; Binding patterns keep the same identity in declarations, match arms,
; loops, select arms and condition chains, including nested payloads.
(pattern (identifier) @local.definition)

(var_statement
  name: (identifier) @local.definition)

(parameter
  name: (identifier) @local.definition)

(lambda_parameter
  name: (identifier) @local.definition)

; Task names use ordinary let bindings; recovery introduces its own binding.
(handle_expression
  error: (identifier) @local.definition)

; References
(identifier) @local.reference
