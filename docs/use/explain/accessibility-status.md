# Understanding accessibility status

Accessibility support is experimental in Coral 0.2.6. Keyboard operation is
tested in Chrome, and screen-reader compatibility is untested.

## Keyboard and focus

Keyboard operation is experimental. Primary actions are reachable from the
command palette, dialogs trap and restore focus, tabs use manual activation,
separators support keyboard resizing, and the DSL editor has an explicit
Escape-then-Tab exit.

## Screen readers

NVDA and VoiceOver support is experimental and untested. No screen-reader
evidence has been collected for Coral 0.2.6.

Visible accessible names and live announcements are automated evidence, but
they are not a substitute for a real reader, browser, and platform matrix.

## Visual preferences

Light and dark themes and visible focus are supported. Reduced motion is
respected where the editor owns animation. No forced-colors support claim is
made for Coral 0.2.6.

## Related

- [How to use Coral with the keyboard](../how-to/use-coral-with-the-keyboard.md)
- [Keyboard shortcuts](../reference/keyboard-shortcuts.md)
- [Browser support](../reference/browser-support.md)
