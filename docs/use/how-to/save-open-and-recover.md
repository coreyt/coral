# How to save, open, and recover

Keep one versioned local document and understand which state wins when work is
replaced.

1. Select **Save** or press `Ctrl/Command+S`. The browser saves a
   `.coral.json` document and the saved state is no longer marked unsaved.
2. Select **Load** and choose a Coral document. If current work is unsaved,
   confirm replacement; cancel or a failed load leaves the current work intact.
3. After an interrupted session, select **Recover previous work** from Welcome.
   Recovery takes precedence over starting a new blank document.
4. Save the recovered document. A normal Coral document becomes the durable
   copy outside browser recovery storage.

Save keeps authored Coral text exactly, including malformed text and notation
findings. Export checks the current meaning separately and may refuse it.

::: warning
Clearing site data removes Coral recovery data, settings, and any explicitly
persisted credential or transcript.
:::

## Result

The intended document is active and has a durable saved copy when requested.

## Related

- [File and export formats](../reference/file-and-export-formats.md)
- [Understanding privacy and storage](../explain/privacy-and-storage.md)
- [Troubleshooting](../reference/troubleshooting.md)
