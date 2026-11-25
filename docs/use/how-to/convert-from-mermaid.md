# How to convert from Mermaid

Open a supported Mermaid sequence file to create editable Coral source. The
verified writer accepts messages, pre-message notes and successive flat
`alt`, `loop` or `opt` fragments; it does not implement all Mermaid sequences.

1. Save this text as `request.mmd` on your computer:

   ```mermaid
   sequenceDiagram
     participant Client
     participant API
     Client->>API: Request
     API-->>Client: Response
   ```

2. Choose **Open local file** in Welcome, or use the header's file-open control,
   and select `request.mmd`. Confirm replacement only if you want to replace
   the current document. The accepted sequence opens as editable Coral source.
3. Inspect the conversion notice and diagram. Save the new document; save and
   reopen preserve the resulting Coral source. Keep the original Mermaid file
   if you need its original formatting.

The new general deterministic conversion to editable Coral is deferred to
0.2.10. Existing bounded sequence conversion remains available.

Other Mermaid files can open as Mermaid source. Imported foreign source stays
in its original format; switching it to Coral is refused when there is no
verified source writer. A saved `@diagram` Coral document also refuses the
format switch to Mermaid. Opening a file is the supported import path; changing
the format selector is not a general conversion command.

An out-of-subset Mermaid sequence returns `coral.open.import.sequence.unsupported`
or an unverified-import diagnostic without replacing current work.

## Result

The admitted sequence becomes editable Coral source. A refused import leaves
current and recovery work intact; rendering alone does not prove conversion
fidelity.

## Related

- [Conversion support](../reference/conversion-support.md)
- [Understanding conversion loss](../explain/conversion-loss.md)
- [Coral DSL](../reference/coral-dsl.md)
