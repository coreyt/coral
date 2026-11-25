# How to edit with the on-device model

Ask the on-device editing model for a short edit to the open flowchart, then
review the proposed change before it touches your document.

1. Open **Preferences** and select **On-device editing model (experimental)**.

   ::: info
   The on-device editing model is experimental. It requires a network
   connection to download. Its requests run in this browser and are not sent
   anywhere.
   :::

   Application only — there is no DSL form for this.

   The **Turn on the on-device editing model** dialog states the download
   size, the host, privacy, the edits the model cannot make, memory use and
   the license, before anything downloads.

   Under **GPU**, the dialog lists the GPUs the browser offers the model,
   named by maker and family, such as "NVIDIA · Ampere". Select one if more
   are listed. Coral keeps the choice in this browser and stops a request,
   before loading the model, if the browser later offers a different GPU.
   Browsers do not name individual graphics cards, so two cards of the same
   family appear once.

2. Select **Download**. To stop, select **Cancel download**.

   Preferences shows "Downloaded and verified" with the stored size, and the
   **AI** tab appears in the bottom panel.

3. In the **AI** tab, type in **Request**, as in `rename Ship to Deliver`,
   and select **Send**; select **Stop** to cancel. Quotes and capital
   letters are optional.

   The model loads, then Coral shows a question or the proposed change.

4. If the model asks a question, select a choice, or type in
   **Your answer** and select **Answer**.

   Coral shows the proposed change, or ends the request if the model asks
   again.

5. Read **Review the proposed change** and select **Apply** or **Discard**.
   Nodes listed as "kept in place" stay where the canvas shows them; Coral
   writes their place so that reopening the file does not move them.

   **Apply** shows "Applied. Undo reverses it." **Discard** leaves the
   document unchanged.

## Result

The diagram shows the applied change as one Undo step, or stays as it was.

## Related

- [Understanding the on-device editing model](../explain/on-device-editing-model.md)
- [Understanding history and undo](../explain/history-and-undo.md)
- [Preferences](../reference/preferences.md)
