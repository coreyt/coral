/**
 * Tests for conversation state management
 */

import { describe, it, expect } from 'vitest';
import {
  createConversation,
  addMessage,
  getMessages,
  clearConversation,
  estimateTokens,
  MAX_HISTORY_TOKENS,
} from '../../src/llm/conversation';

describe('conversation state', () => {
  describe('createConversation', () => {
    it('should create empty conversation state', () => {
      const state = createConversation();
      expect(state.messages).toEqual([]);
      expect(state.tokenEstimate).toBe(0);
    });
  });

  describe('addMessage', () => {
    it('should add a user message', () => {
      const state = createConversation();
      const next = addMessage(state, { role: 'user', content: 'hello' });
      expect(next.messages).toHaveLength(1);
      expect(next.messages[0]).toEqual({ role: 'user', content: 'hello' });
    });

    it('should add an assistant message', () => {
      const state = createConversation();
      const next = addMessage(state, { role: 'assistant', content: 'hi there' });
      expect(next.messages).toHaveLength(1);
      expect(next.messages[0].role).toBe('assistant');
    });

    it('should accumulate multiple messages in order', () => {
      let state = createConversation();
      state = addMessage(state, { role: 'user', content: 'first' });
      state = addMessage(state, { role: 'assistant', content: 'second' });
      state = addMessage(state, { role: 'user', content: 'third' });
      expect(state.messages).toHaveLength(3);
      expect(state.messages.map((m) => m.content)).toEqual(['first', 'second', 'third']);
    });

    it('should update token estimate when adding messages', () => {
      let state = createConversation();
      state = addMessage(state, { role: 'user', content: 'hello' }); // 5 chars = ~1 token
      expect(state.tokenEstimate).toBeGreaterThan(0);
    });

    it('should not mutate the original state', () => {
      const state = createConversation();
      const next = addMessage(state, { role: 'user', content: 'hello' });
      expect(state.messages).toHaveLength(0);
      expect(next.messages).toHaveLength(1);
    });
  });

  describe('sliding window eviction', () => {
    it('should evict oldest messages when token budget exceeded', () => {
      let state = createConversation();
      // Add many large messages to exceed budget
      const largeContent = 'x'.repeat(MAX_HISTORY_TOKENS * 4); // way over budget
      state = addMessage(state, { role: 'user', content: 'keep this recent' });
      state = addMessage(state, { role: 'assistant', content: largeContent });
      state = addMessage(state, { role: 'user', content: 'newest message' });

      // Should have trimmed old messages but kept the newest
      expect(state.tokenEstimate).toBeLessThanOrEqual(MAX_HISTORY_TOKENS);
      const last = state.messages[state.messages.length - 1];
      expect(last.content).toBe('newest message');
    });

    it('should evict in pairs (user+assistant) to maintain valid alternation', () => {
      let state = createConversation();
      // Fill with many user/assistant pairs
      for (let i = 0; i < 100; i++) {
        const bigContent = 'x'.repeat(2000); // ~500 tokens each
        state = addMessage(state, { role: 'user', content: `user-${i}: ${bigContent}` });
        state = addMessage(state, { role: 'assistant', content: `assistant-${i}: ${bigContent}` });
      }

      expect(state.tokenEstimate).toBeLessThanOrEqual(MAX_HISTORY_TOKENS);
      expect(state.messages.length).toBeGreaterThan(0);
      // First message should be a user message (pairs evicted together)
      if (state.messages.length > 0) {
        expect(state.messages[0].role).toBe('user');
      }
    });

    it('should always keep the most recent message even if over budget', () => {
      let state = createConversation();
      const hugeContent = 'x'.repeat(MAX_HISTORY_TOKENS * 8);
      state = addMessage(state, { role: 'user', content: hugeContent });

      // Even though single message exceeds budget, it should be kept
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe(hugeContent);
    });
  });

  describe('getMessages', () => {
    it('should return empty array for empty conversation', () => {
      const state = createConversation();
      expect(getMessages(state)).toEqual([]);
    });

    it('should return all messages in order', () => {
      let state = createConversation();
      state = addMessage(state, { role: 'user', content: 'a' });
      state = addMessage(state, { role: 'assistant', content: 'b' });
      const msgs = getMessages(state);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe('a');
      expect(msgs[1].content).toBe('b');
    });

    it('should return a copy, not a reference', () => {
      let state = createConversation();
      state = addMessage(state, { role: 'user', content: 'a' });
      const msgs = getMessages(state);
      msgs.push({ role: 'assistant', content: 'injected' });
      expect(getMessages(state)).toHaveLength(1);
    });
  });

  describe('clearConversation', () => {
    it('should return empty conversation state', () => {
      const state = clearConversation();
      expect(state.messages).toEqual([]);
      expect(state.tokenEstimate).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens as chars / 4', () => {
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcdefgh')).toBe(2);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should round down', () => {
      expect(estimateTokens('abc')).toBe(0); // 3/4 = 0.75 → 0
    });

    it('should handle large strings', () => {
      const large = 'x'.repeat(48000);
      expect(estimateTokens(large)).toBe(12000);
    });
  });
});
