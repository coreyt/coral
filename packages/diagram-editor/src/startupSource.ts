import { bundledSourceExamples028 } from './exampleSources028';

/** The initial document has one authored source, shared with the Welcome catalog. */
export const startupSource = {
  format: 'coral' as const,
  text: bundledSourceExamples028.find((example) => example.id === 'flowchart')!.source,
};
