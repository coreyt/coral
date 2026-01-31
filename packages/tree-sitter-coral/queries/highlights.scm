; Syntax highlighting queries for Coral DSL

; Keywords (node types)
(node_type) @keyword

; Strings
(string) @string

; Identifiers
(identifier) @variable

; Properties
(property
  key: (identifier) @property)

; Edge attributes
(edge_attributes
  (identifier) @type)

(attribute
  key: (identifier) @property)

; Operators
"->" @operator

; Punctuation
"{" @punctuation.bracket
"}" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
":" @punctuation.delimiter
"," @punctuation.delimiter
"=" @operator

; Comments
(comment) @comment
