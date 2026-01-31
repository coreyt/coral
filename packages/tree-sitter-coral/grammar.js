/**
 * @file Tree-sitter grammar for Coral DSL
 * @author Coral Team
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: 'coral',

  extras: $ => [
    /\s/,
    $.comment,
  ],

  rules: {
    source_file: $ => repeat($._statement),

    _statement: $ => choice(
      $.node_declaration,
      $.edge_declaration,
    ),

    // Node declarations: service "Name" { ... }
    node_declaration: $ => seq(
      field('type', $.node_type),
      field('name', $.string),
      optional(field('body', $.node_body)),
    ),

    node_type: _ => choice(
      'service',
      'database',
      'external_api',
      'actor',
      'module',
      'group',
    ),

    node_body: $ => seq(
      '{',
      repeat($._body_statement),
      '}',
    ),

    _body_statement: $ => choice(
      $.node_declaration,
      $.property,
    ),

    // Properties: key: "value"
    property: $ => seq(
      field('key', $.identifier),
      ':',
      field('value', $.string),
    ),

    // Edge declarations: source -> target [attributes]
    edge_declaration: $ => seq(
      field('source', $.identifier),
      '->',
      field('target', $.identifier),
      optional(field('attributes', $.edge_attributes)),
    ),

    edge_attributes: $ => seq(
      '[',
      $.identifier,
      repeat(seq(',', $.attribute)),
      ']',
    ),

    attribute: $ => seq(
      field('key', $.identifier),
      '=',
      field('value', $.string),
    ),

    // Tokens
    identifier: _ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    string: _ => seq(
      '"',
      /[^"\\]*(?:\\.[^"\\]*)*/,
      '"',
    ),

    comment: _ => token(seq('//', /.*/)),
  },
});
