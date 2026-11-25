import { parse as parseInterchange } from '@coral-viz/language/parser';

// Deliberate graph-only input, not a saved 0.2.8 Coral document.
export const interchangeSource = 'service "API"\ndatabase "DB"\napi -> db';
export const interchangeResult = parseInterchange(interchangeSource);
if (!interchangeResult.success || !interchangeResult.graph) {
  throw new Error('Inspect graph-interchange diagnostics before using the graph.');
}
