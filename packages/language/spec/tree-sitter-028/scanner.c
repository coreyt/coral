/*
 * Coral raw artwork blocks for edition 0.2.9 symbol definitions.
 *
 * raw_block starts at the three double quotes that end an `artwork svg` line
 * and ends after a later line consisting of exactly three double quotes
 * (before its LF or CRLF). Content between them is never interpreted, so
 * comment markers, braces, `@` and quotes inside artwork are inert. A block
 * with no closing line is not a token. The scanner keeps no state.
 */
#include "tree_sitter/parser.h"

enum TokenType { RAW_BLOCK };

static bool three_quotes(TSLexer *lexer) {
  for (int count = 0; count < 3; count++) {
    if (lexer->lookahead != '"') return false;
    lexer->advance(lexer, false);
  }
  return true;
}

static bool line_end(TSLexer *lexer) {
  if (lexer->lookahead == '\n') return true;
  if (lexer->lookahead == '\r') {
    lexer->advance(lexer, false);
    return lexer->lookahead == '\n';
  }
  return lexer->eof(lexer);
}

void *tree_sitter_coral_028_external_scanner_create(void) { return NULL; }
void tree_sitter_coral_028_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_coral_028_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload; (void)buffer;
  return 0;
}
void tree_sitter_coral_028_external_scanner_deserialize(void *payload, const char *buffer,
  unsigned length) {
  (void)payload; (void)buffer; (void)length;
}

bool tree_sitter_coral_028_external_scanner_scan(void *payload, TSLexer *lexer,
  const bool *valid_symbols) {
  (void)payload;
  if (!valid_symbols[RAW_BLOCK]) return false;
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') lexer->advance(lexer, true);
  if (!three_quotes(lexer)) return false;
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') lexer->advance(lexer, false);
  if (lexer->lookahead == '\r') lexer->advance(lexer, false);
  if (lexer->lookahead != '\n') return false;
  lexer->advance(lexer, false);
  for (;;) {
    if (lexer->eof(lexer)) return false;
    if (lexer->lookahead == '"') {
      if (three_quotes(lexer)) {
        lexer->mark_end(lexer);
        if (line_end(lexer)) {
          lexer->result_symbol = RAW_BLOCK;
          return true;
        }
      }
    }
    while (!lexer->eof(lexer) && lexer->lookahead != '\n') lexer->advance(lexer, false);
    if (lexer->eof(lexer)) return false;
    lexer->advance(lexer, false);
  }
}
