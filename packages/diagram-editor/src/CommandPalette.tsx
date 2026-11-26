/**
 * Command Palette (Ctrl+K)
 *
 * Searchable command palette following Coral Design Standard.
 * Replaces traditional menu bars with a unified command interface.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CoralDialog } from './ui/CoralDialog';

export interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: (context?: CommandActionContext) => void;
  disabled?: boolean;
  transfersFocus?: boolean;
}

export interface CommandActionContext {
  invoker: HTMLElement | null;
}

export interface CommandPaletteTheme {
  overlayBg: string;
  bg: string;
  border: string;
  text: string;
  mutedText: string;
  inputBg: string;
  inputText: string;
  hoverBg: string;
  shortcutBg: string;
  shortcutText: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  theme: CommandPaletteTheme;
  themeName?: 'light' | 'dark';
}

export function CommandPalette({ isOpen, onClose, commands, theme, themeName }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const handoffRef = useRef(false);

  const filtered = useMemo(() => {
    const available = commands.filter((c) => !c.disabled);
    if (!query.trim()) return available;
    const q = query.toLowerCase();
    return available.filter(
      (c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    handoffRef.current = false;

    // Remember where focus came from and put it back on close, so keyboard
    // users are not dropped at the top of the document (R-014).
    const previouslyFocused = document.activeElement as HTMLElement | null;
    invokerRef.current = previouslyFocused;
    return undefined;
  }, [isOpen]);

  // Clamp selected index when list changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-command-item]');
    const selected = items[selectedIndex] as HTMLElement | undefined;
    if (selected) {
      selected.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback((command: CommandItem) => {
    const context = { invoker: invokerRef.current };
    if (command.transfersFocus) {
      handoffRef.current = true;
      onClose();
      queueMicrotask(() => command.action(context));
      return;
    }
    command.action(context);
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        // Clamp here too: a key can arrive before the clamp effect commits.
        const command = filtered[Math.min(selectedIndex, filtered.length - 1)];
        if (!command) return;
        e.preventDefault();
        executeCommand(command);
      }
    },
    [executeCommand, filtered, selectedIndex],
  );

  if (!isOpen) return null;

  // Group by category (preserving insertion order)
  const categories = new Map<string, CommandItem[]>();
  for (const cmd of filtered) {
    if (!categories.has(cmd.category)) categories.set(cmd.category, []);
    categories.get(cmd.category)!.push(cmd);
  }

  let flatIndex = 0;

  return (
    <CoralDialog
      themeName={themeName}
      open={isOpen}
      title="Command palette"
      closeLabel="Close command palette"
      onClose={onClose}
      initialFocus="first"
      // The dialog captures this opening's invoker; our ref still holds the prior one during render.
      shouldRestoreFocus={() => !handoffRef.current}
    >
      <div
        className="coral-command-palette"
        style={{
          width: '480px',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          data-initial-focus
          type="text"
          value={query}
          onChange={(e) => {
            // A new query selects its first match, not a row hovered in the old list.
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="Type a command..."
          aria-label="Search commands"
          style={{
            padding: '12px 16px',
            fontSize: '14px',
            border: 'none',
            borderBottom: `1px solid ${theme.border}`,
            background: theme.inputBg,
            color: theme.inputText,
            outline: 'none',
          }}
        />

        {/* Command list */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }} role="listbox">
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '16px',
                color: theme.mutedText,
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              No matching commands
            </div>
          ) : (
            Array.from(categories.entries()).map(([category, cmds]) => (
              <div key={category}>
                <div
                  style={{
                    padding: '8px 16px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: theme.mutedText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const idx = flatIndex++;
                  return (
                    <div
                      key={cmd.id}
                      data-command-item
                      role="option"
                      aria-selected={idx === selectedIndex}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        padding: '8px 16px',
                        fontSize: '13px',
                        color: theme.text,
                        background: idx === selectedIndex ? theme.hoverBg : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: theme.shortcutBg,
                            color: theme.shortcutText,
                            fontFamily:
                              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                          }}
                        >
                          {cmd.shortcut}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </CoralDialog>
  );
}
