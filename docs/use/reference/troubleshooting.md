# Troubleshooting

Messages and symptoms visible in the application; provider-specific incidents
outside Coral are excluded. For product support, use
[GitHub issues](https://github.com/coreyt/coral/issues) when online.

| Message | Likely cause | What to do |
| --- | --- | --- |
| `layout.capability.unsupported` | Layout cannot execute authored meaning | Keep source and change the unsupported request |
| `layout.constraint.required-unsatisfied` | Required constraints conflict | Revise a required constraint |
| `layout.route.anchor-missing` | A route anchor cannot be resolved | Restore or change the referenced object |

## Things that look wrong

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Diagram remains on prior layout | New geometry is pending or refused | Read Diagnostics; prior verified view is retained |
| AI controls are absent | The on-device editing model is off; it is experimental, with alpha-level performance | Turn it on in Preferences, or use source editing, canvas actions and Reflow |
| Export is unavailable | Current route or geometry is unverified | Resolve diagnostics and Reflow |
| Voice input is absent | Composer voice input is not available | Use source or keyboard input |
| Open does not replace work | Load was cancelled or invalid | Keep current work and choose a valid Coral document |

## Layout capability unsupported {#layout-capability-unsupported}

Coral preserves the authored request and reports the unsupported execution
surface instead of inventing geometry.

## Required constraint unsatisfied {#layout-constraint-required-unsatisfied}

Required constraints are atomic. No partial candidate replaces the prior
verified diagram.

## Route anchor missing {#layout-route-anchor-missing}

The route refers to an object or anchor that is not available in the current
document.

## Diagram remains on prior layout {#diagram-remains-on-prior-layout}

The previous verified result remains visible while a candidate is pending or
when the replacement was refused.

## AI change is not applied {#ai-change-is-not-applied}

An on-device edit changes the document only when you select **Apply** in
its review. A proposal that is refused, or made stale by an edit, changes
nothing; ask again. The model is experimental, and its performance is
alpha-level; see
[How to edit with the on-device model](../how-to/edit-with-the-on-device-model.md).

## Export is unavailable {#export-is-unavailable}

Export uses verified geometry only. Resolve the blocking diagnostic and
Reflow before trying again.

## Voice input does not start {#voice-input-does-not-start}

Composer voice input is not available.

## Open does not replace work {#open-does-not-replace-work}

A cancelled or invalid load leaves current work intact. Choose a supported
Coral document and confirm replacement when prompted.

## Related

- [How to lay out and reflow](../how-to/lay-out-and-reflow.md)
- [How to save, open, and recover](../how-to/save-open-and-recover.md)
- [How to generate with AI](../how-to/generate-with-ai.md)
