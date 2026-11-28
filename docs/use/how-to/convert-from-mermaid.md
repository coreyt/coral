# How to convert from Mermaid

Open a supported Mermaid sequence file to create editable Coral source. The
shared transpiler accepts messages, notes, recursive fragments and verified
activations. Conversion diagnostics describe unsupported or lossy constructs.

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

Flowchart, Sequence, Class, ER, and State diagrams use the deterministic
Mermaid-to-Coral transpiler. For a Mermaid draft, choose **Convert to Editable
Coral**. Review any conversion notes before accepting a lossy conversion.
An accepted conversion is one Undo step.

Lossless sequence files open directly as verified Coral source. Other Mermaid
files and lossy or refused sequences retain their original Mermaid text for
review. Save preserves that original text until you accept conversion. Saved
Coral documents keep their source ownership when using the format selector.

## Result

Accepted source becomes editable Coral. Diagnostics identify unsupported or
omitted constructs. Keep the original Mermaid file when its formatting or
unsupported details matter to your workflow.

## Related

- [Conversion support](../reference/conversion-support.md)
- [Understanding conversion loss](../explain/conversion-loss.md)
- [Coral DSL](../reference/coral-dsl.md)
