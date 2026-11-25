; Coral 0.2.8 source syntax. Runtime interpretation remains authoritative.

(diagram_type) @type
(node_kind) @type
(end_name) @type
(connector) @operator
(rgb_hex) @number

(quoted) @string
(double_quoted) @string
(identifier) @variable
(comment) @comment

(node_field) @property
(port_field) @property
(keyed_edge_field) @property
(diagram_attribute) @property

(operation_signature (identifier) @function)

"{" @punctuation.bracket
"}" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
"(" @punctuation.bracket
")" @punctuation.bracket
":" @punctuation.delimiter
"," @punctuation.delimiter

; Edition 0.2.9 symbol definitions. Raw artwork is inert text.
(raw_block) @string
(symbol_line) @property
(anchor_field) @property
