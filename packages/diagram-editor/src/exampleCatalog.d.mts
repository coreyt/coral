export interface ExampleCatalogEntry {
  readonly id: string;
  readonly notation: string;
  readonly name: string;
  readonly description: string;
  readonly sourceFile: string;
  readonly sourceEdition?: string;
  readonly preview: { readonly theme: string; readonly style: string; readonly direction: string };
  readonly capabilities: readonly string[];
  readonly limitations: readonly string[];
}
export interface ExampleCatalog {
  readonly catalogVersion: string;
  readonly languageVersion: string;
  readonly sourceEdition: string;
  readonly runtimeVersion: string;
  readonly entries: readonly ExampleCatalogEntry[];
  readonly retired: readonly { readonly id: string; readonly reason: string }[];
}
export function validateExampleCatalog<T extends ExampleCatalog>(manifest: T): T;
export function resolveExample(manifest: ExampleCatalog, catalogVersion: string | null | undefined, id: string | null | undefined): ExampleCatalogEntry;
export function exampleHref(manifest: ExampleCatalog, id: string, editorPath?: string): string;
export function createExampleDocument(manifest: ExampleCatalog, id: string, source: string): {
  schemaVersion: '1.0.0';
  metadata: { name: string; description: string; created: string; modified: string };
  content: { format: 'dsl'; dslType: 'coral'; text: string };
  settings: { notation: string; renderStyle028: string; layout: { algorithm: 'layered'; direction: string } };
};
