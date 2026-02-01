---
name: modern-ui-architect
description: Enforce modern UI/UX standards (Material Design 3, Apple HIG) for Coral's diagramming editor. Use when designing layouts, refactoring components, or auditing UI for the viz-demo application.
dependencies:
  javascript:
    - react
    - "@xyflow/react"
---
# Modern UI Architect (Coral Standard)

## Core Capabilities

This skill enforces the "Coral Design Standard" for high-density productivity tools. It combines Material Design 3 and Apple HIG principles while respecting Coral's existing UX decisions.

## Key Principles

### Preserved Design Decisions

These patterns are **intentional** and must NOT be replaced:

| Pattern | Rationale |
|---------|-----------|
| **Explicit Save/Load** | User controls when to persist; enables deliberate file management |
| **Explicit Reflow** | User controls when layout runs; prevents jarring auto-rearrangement |
| **Undo/Redo for Layout** | CORAL-REQ-013 enables reverting layout changes |
| **Position Stability** | User-dragged positions persist across DSL edits |

### Adopted Patterns

| Pattern | Implementation |
|---------|----------------|
| **Three-Pane Layout** | Left (nav), Center (stage), Right (inspector) |
| **Contextual Inspector** | Shows document settings by default; node settings when selected |
| **Command Palette** | `Cmd+K` for actions; minimal top bar |
| **Compact Density** | M3 compact spacing for productivity tools |
| **Segmented Controls** | For options with 2-4 choices (Direction, Algorithm) |
| **Floating Toolbar** | Canvas actions (Zoom, Fit, Reflow) at bottom center |

## Workflows

### 1. Layout Enforcement (Three-Pane Rule)

When designing the main application shell:

- **Left (Rail/Sidebar):** Navigation, File Browser, Outline View
- **Center (Stage):** Split Editor (DSL + Canvas)
- **Right (Inspector):** Contextual Properties Panel

### 2. Interaction Audit

Run every UI request through this checklist:

1. **Menu Bar Detection:** If `File | Edit | View` is present → Replace with **Command Palette (`Cmd+K`)**
2. **Density Check:** Standard web padding (>16px) → Enforce **Compact Density** (8-12px)
3. **Selection Logic:** Background selected → Document Settings. Node selected → Node Settings.
4. **User Control Check:** Does this remove user control over timing? → **Preserve explicit actions**

### 3. Component Selection Strategy

| User Request | Legacy Pattern | Enforced Pattern |
|--------------|----------------|------------------|
| "Add a direction toggle" | Dropdown | **Segmented Control** |
| "Add dark mode switch" | Navbar Button | **Command Palette Action** |
| "Node spacing" | Slider alone | **Input + Slider Combo** |
| "Save diagram" | Auto-save only | **Explicit Save + Auto-recovery to localStorage** |
| "Re-layout diagram" | Auto-layout on edit | **Explicit Reflow button with Undo** |

### 4. Accessibility Checklist

Every component must satisfy:

- [ ] Keyboard navigable (Tab, Arrow keys, Enter, Escape)
- [ ] ARIA labels on interactive elements
- [ ] Focus indicators visible
- [ ] Color not sole indicator of state
- [ ] Respects `prefers-reduced-motion`

## File References

| Document | Purpose |
|----------|---------|
| `references/coral_design_standard.md` | Full design system specification |
| `assets/ui_auditor_persona.md` | Persona for critiquing UI decisions |

## Usage

To audit existing UI:
```
Review this component against the Coral Design Standard.
Identify violations and suggest fixes.
```

To design new UI:
```
Design a [component] following the Coral Design Standard.
Use the three-pane layout and contextual inspector patterns.
```
