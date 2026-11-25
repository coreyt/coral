/** Explicit historical fixture for pre-0.2.8 Mermaid canvas characterization. */
export const legacyStartupSource = {
  format: 'mermaid' as const,
  text: `flowchart TD
    A[Loading URL failed] --> B[Check console for errors]
    B --> C{Is JSON correct?}
    C -->|Yes| D[Raise GitHub issue]
    C -->|No| E{Someone sent link?}
    E -->|Yes| F[Ask for complete link]
    E -->|No| G{Copied complete URL?}
    G -->|Yes| D
    G -->|No| H[Check browser Timeline]
`,
};
