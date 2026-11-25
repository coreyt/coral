/**
 * Conversation State Management
 *
 * Pure functions for managing multi-turn LLM conversation history
 * with a sliding-window token budget.
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  messages: ConversationMessage[];
  tokenEstimate: number;
}

/** Token budget for conversation history (~12K tokens, leaving room for system prompt + response) */
export const MAX_HISTORY_TOKENS = 12000;

/** Estimate token count from text length (chars / 4 heuristic) */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

/** Create an empty conversation state */
export function createConversation(): ConversationState {
  return { messages: [], tokenEstimate: 0 };
}

/** Create an empty conversation state (alias for createConversation) */
export function clearConversation(): ConversationState {
  return createConversation();
}

/** Get a copy of conversation messages */
export function getMessages(state: ConversationState): ConversationMessage[] {
  return [...state.messages];
}

/** Add a message and trim oldest messages if over token budget */
export function addMessage(state: ConversationState, msg: ConversationMessage): ConversationState {
  const newMessages = [...state.messages, msg];
  const msgTokens = estimateTokens(msg.content);
  let totalTokens = state.tokenEstimate + msgTokens;

  // Trim from the front in pairs (user+assistant) to maintain valid alternation
  let startIndex = 0;
  while (totalTokens > MAX_HISTORY_TOKENS && startIndex < newMessages.length - 1) {
    // Remove the oldest message
    totalTokens -= estimateTokens(newMessages[startIndex].content);
    startIndex++;

    // If we just removed a user message and the next is assistant, remove it too (keep pairs)
    if (
      startIndex < newMessages.length - 1 &&
      newMessages[startIndex].role === 'assistant'
    ) {
      totalTokens -= estimateTokens(newMessages[startIndex].content);
      startIndex++;
    }
  }

  const trimmed = newMessages.slice(startIndex);
  return {
    messages: trimmed,
    tokenEstimate: trimmed.reduce((sum, m) => sum + estimateTokens(m.content), 0),
  };
}
