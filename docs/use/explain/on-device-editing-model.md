# Understanding the on-device editing model

The on-device editing model turns a short English request into a proposed
edit of the open flowchart. It runs in this browser, it stays off until you
turn it on, and nothing in your document changes until you review the result
and select **Apply**. It suits requests of one to four edits, and it makes
mistakes, so every result needs your review.

::: info
The on-device editing model is experimental. It requires a network
connection to download. Its requests run in this browser and are not sent
anywhere.
:::

## What the model can edit

The model works on flowcharts whose objects all have one of five types:
terminal, process, decision, database and group. It can make these edits:

- Add an object of one of those types, at the top level or inside a group.
- Connect two objects with a flow connection, with or without a label.
- Set, change or remove the label of an object or a connection.
- Delete an object or a connection.
- Place an object above, below, left of or right of another object.
- Arrange objects in a row or a column, in order or reversed.
- Line an object up with the top, bottom, left or right edge of the diagram
  or of its group.

Placements and arrangements use compact, normal or wide spacing. The model
cannot move an object into another group, rename a source ID, change styles
or properties, delete an object together with its connections, or arrange
objects that sit in different groups.

Coral refuses a request before the model runs, and says why, when the source
has errors, the diagram is not a flowchart, an object has another type, a
connection is not a flow connection or uses a port other than a decision's
`yes` and `no`, the diagram or the request is too long, or the editor is
still updating. Coral also refuses a placement it cannot make safely: one
that would overlap an object it may not move, push other objects aside, or
need a connection route that Coral cannot verify. A refusal changes nothing.

## How well it works

Its performance is alpha-level. On 209 short natural-English requests of one
to four edits, run in Chrome, the model got 196 right (94%). Longer requests
fail more often. The model
can add, drop or invent edits, even when a request is clear. It sometimes
asks a question when a request is unclear, and sometimes guesses instead.

Names and new text need no quotes and can be typed in any case; the
model writes new text as you typed it. Quoted names are still recognised
most reliably. On 201 similar requests typed without quotes and in lower
case, run in Chrome, the model got 172 right (86%).

The canvas keeps its positions across edits, so it can differ from a fresh
layout of the same source. Each AI edit keeps the diagram as the canvas
shows it: when a fresh layout would move a node, Coral writes that node's
current place into the source, and the review lists it as kept in place.
Applying the change or reopening the file then moves nothing you did not
ask to move.

## Why you review every result

Coral prepares each result on a copy of your document and shows it in
**Review the proposed change** before anything is written:

- your request, the number of changes and one line per change, with a
  preview of the diagram after the change;
- "Removed" at the start of every removal;
- for an object Coral moved out of the way of a placement, how far it moved,
  such as "moved 134 units to make room". Coral moves an automatically
  placed object by at most 200 units, and never one you positioned or
  pinned;
- "kept in place" for the other objects in a group when the model places one
  of them. Coral writes their current positions into the source, so the
  group's automatic layout does not move them;
- any layout warning for the new diagram.

**Apply** writes the whole change as one Undo step, and **Discard** leaves
the document as it was. Nothing retries automatically. The model can ask one
question per request; a second question ends the request. If you edit the
diagram while a question waits, your answer no longer applies and Coral asks
you to send the request again.

## Privacy and network use

- Coral downloads the model from huggingface.co after you agree in the
  enable dialog. Hugging Face and its download servers see your IP address
  when the files download. Coral sends no cookies or referrer with the
  download.
- Once the model is downloaded, it loads from this browser without any
  network request.
- Your requests, your diagram and the model's replies stay in this browser.
  There is no telemetry: Coral reports no usage, quality, errors or
  performance.
- The conversation lasts until you close or reload the page. Coral keeps no
  transcript.

## Storage and memory

- The download is about 219 MB. Coral checks each file before it reports the
  model as ready, and stores the files in this browser's private file
  storage.
- **Preferences** shows the stored size and a **Remove model** control.
  Turning the feature off offers to delete the model, and clearing site data
  removes it. If the browser removes the files to save space, Coral offers
  the download again.
- Each Coral release names one model version. When a release names a new
  one, Coral asks before replacing the stored model.
- One tab at a time can use the model. Another tab says the model is in use.
- The model uses about 1.2 GB of memory while working, measured on one
  workstation. Coral's memory target for this feature is 1 GB, which the
  model does not meet yet; this is a known issue. To limit memory, Coral
  unloads the model after each exchange, so each request loads it again
  first.
- The feature needs WebGPU with a hardware graphics adapter, the browser's
  private file storage and Web Locks. Preferences says which one is missing.

## License

The model is a fine-tune of Liquid AI's LFM2.5-230M, modified by the Coral
project. It is licensed under the LFM Open License v1.0, not under Coral's
Apache-2.0 license, and it is not part of any Coral npm package. That license
does not cover commercial use by an organization with annual revenue of
10 million US dollars or more; a qualified non-profit using the model for
non-commercial or research purposes is exempt from that limit. The enable
dialog shows the full license text under **Show the licence text**, and the
download includes it as `LICENSE`.

## What this means for you

- Turn the model on and make a request:
  [How to edit with the on-device model](../how-to/edit-with-the-on-device-model.md)
- Undo an applied change: [Understanding history and undo](history-and-undo.md)
- Remove the model: [Preferences](../reference/preferences.md)

## Related

- [How to edit with the on-device model](../how-to/edit-with-the-on-device-model.md)
- [Understanding privacy and storage](privacy-and-storage.md)
- [Understanding history and undo](history-and-undo.md)
- [Preferences](../reference/preferences.md)
- [Browser support](../reference/browser-support.md)
