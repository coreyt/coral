# Get started with Coral

Build, connect, reflow, save, and export a two-object diagram in about five
minutes.

## Before you start

- Use a supported desktop browser.
- Allow the application to finish loading before editing.

## 1. Start a blank diagram

Select **Blank diagram with Create Node** from **Welcome to Coral**. The
application opens one empty local document and the create-node dialog.

## 2. Add the first object

Choose **Process**, enter `Handle request`, and select **Create node**.

Example Coral source (generated IDs may differ):

```coral
@diagram flowchart
request process as "Handle request"
```

The process appears on the canvas and in the Coral source editor.

## 3. Add and connect another object

Open **Command palette** > **Create Node** and create a `Save record` process.
Then open **Command palette** > **Create Edge** and connect the two objects.

Example Coral source:

```coral
@diagram flowchart
request process as "Handle request"
save process as "Save record"
request -> save as "writes"
```

The canvas shows two objects joined by a labelled connection.

## 4. Reflow and save

Open **Command palette** > **Reflow Layout**, then select **Save**. The objects
use the current layout and a versioned `.coral.json` document is saved.

## 5. Export the result

Open **More actions** > **Export SVG**. The browser saves a graphic export of
the current verified diagram.

## What you built

A local two-object diagram with source text, layout, document state, and an SVG
export.

## Related

- [How to place and edit objects](how-to/place-and-edit-objects.md)
- [How to save, open, and recover](how-to/save-open-and-recover.md)
- [Troubleshooting](reference/troubleshooting.md)
