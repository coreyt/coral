# Coral Design Standard

A design system for React-based diagramming tools, grounded in Material Design 3 (M3) and Apple Human Interface Guidelines (HIG).

---

## 1. Layout Strategy: Three-Pane Layout

We follow a strict **Three-Region Layout** common in high-density productivity tools.

```
┌────────┬─────────────────────────────┬──────────┐
│        │                             │          │
│  Rail  │          Stage              │ Inspector│
│ (Nav)  │   (Editor + Canvas)         │ (Props)  │
│        │                             │          │
│  64-   │         flex-1              │   320px  │
│  256px │                             │          │
└────────┴─────────────────────────────┴──────────┘
```

### Region A: Navigation Rail (Left)

**Purpose:** High-level navigation and document structure.

| Property | Value |
|----------|-------|
| Width | Collapsible: 64px (icons) ↔ 256px (expanded) |
| Background | Surface variant (e.g., `#252526`) |
| Border | None — use background color distinction |

**Content:**
- **File Browser:** List of `.coral.json` documents
- **Outline View:** Tree view of nodes in current diagram
- **Snippets:** Drag-and-drop DSL templates (future)

**Reference:** [M3 Navigation Rail](https://m3.material.io/components/navigation-rail/guidelines)

### Region B: Stage (Center)

**Purpose:** The primary workspace for creation.

**Layout:**
```
┌─────────────────┬─────────────────┐
│                 │                 │
│   DSL Editor    │   Diagram       │
│   (Monaco/      │   Canvas        │
│    Textarea)    │   (React Flow)  │
│                 │                 │
├─────────────────┴─────────────────┤
│     [Floating Toolbar - Pill]     │
└───────────────────────────────────┘
```

**Components:**
- **Split View:** Resizable DSL Editor (left) + Canvas (right)
- **Gutter:** Draggable handle between panes
- **Floating Toolbar:** Bottom-center pill with: Zoom In, Zoom Out, Fit, **Reflow**

**Floating Toolbar Pattern:**
```tsx
<div className="absolute bottom-6 left-1/2 -translate-x-1/2
                bg-surface-800 text-white px-4 py-2
                rounded-full shadow-lg flex gap-4">
  <button>Zoom In</button>
  <button>Zoom Out</button>
  <button>Fit</button>
  <button>Reflow</button>  {/* Explicit, with Undo support */}
</div>
```

### Region C: Inspector (Right)

**Purpose:** Context-aware property manipulation.

| Property | Value |
|----------|-------|
| Width | Fixed: 320px (collapsible to 0) |
| Background | Surface (e.g., `#1E1E1E`) |

**Behavior:**
- **Nothing selected:** Shows Document Settings
  - Notation selector
  - Layout algorithm
  - Layout direction
  - Spacing parameters
- **Node selected:** Shows Node Properties
  - Label, Type, Symbol
  - Custom properties
  - Position (read-only or editable)
- **Edge selected:** Shows Edge Properties
  - Label, Type
  - Source/Target ports

**Reference:** [Apple HIG Inspector](https://developer.apple.com/design/human-interface-guidelines/inspectors)

---

## 2. Preserved UX Decisions

These patterns are **intentional design decisions** in Coral and must be preserved:

### 2.1 Explicit Save/Load

| Pattern | Implementation |
|---------|----------------|
| **Save** | User clicks Save → downloads `.coral.json` |
| **Load** | User clicks Load → file picker |
| **Auto-recovery** | Optional: save to localStorage on edit |
| **Export** | Separate action for Graph-IR JSON export |

**Rationale:** Local-first tools benefit from explicit file management. Users decide when to commit changes.

### 2.2 Explicit Reflow with Undo

| Pattern | Implementation |
|---------|----------------|
| **Reflow button** | User explicitly triggers ELK layout |
| **Undo** | Restores previous node positions |
| **Redo** | Re-applies the reflow |
| **Position stability** | User-dragged positions persist across DSL edits |

**Rationale:** Auto-layout on every edit is jarring for large diagrams. Users need control over when layout runs and ability to revert.

### 2.3 Position Stability (CORAL-REQ-013)

| Scenario | Behavior |
|----------|----------|
| DSL text edited | Existing node positions preserved |
| Node added | New node placed via incremental layout |
| Node dragged | Position marked as `user-dragged`, never overwritten |
| Explicit Reflow | All positions recalculated (undoable) |

---

## 3. Navigation & Commands

### 3.1 Command Palette

Replace traditional Menu Bars with a Command Palette.

| Property | Value |
|----------|-------|
| Trigger | `Cmd+K` (Mac) / `Ctrl+K` (Windows) |
| UI | Centered modal with search input |
| Actions | Export, Theme toggle, Layout presets, Help |

### 3.2 Top App Bar (Minimal)

```
┌─────────────────────────────────────────────────────┐
│ [Logo]  Document Name           [Save] [Load] [⋮]  │
└─────────────────────────────────────────────────────┘
```

- **Left:** App logo, document name (editable)
- **Right:** Save, Load, overflow menu (Export, Settings)

---

## 4. Visual Styling

### 4.1 Density

Use **Compact Density** (M3) for productivity tools.

| Element | Standard | Compact |
|---------|----------|---------|
| Button padding | 16px | 8-12px |
| Input padding | 16px | 8px |
| List item height | 48px | 32-36px |
| Section spacing | 24px | 16px |

### 4.2 Color Strategy

Define regions by background color, not borders.

| Region | Light Mode | Dark Mode |
|--------|------------|-----------|
| Rail | `#F5F5F5` | `#252526` |
| Stage (Editor) | `#FFFFFF` | `#1E1E1E` |
| Stage (Canvas) | `#FAFAFA` | `#1A1A1A` |
| Inspector | `#F5F5F5` | `#252526` |
| Floating toolbar | `#333333` | `#333333` |

### 4.3 Elevation

| Element | Elevation | Shadow |
|---------|-----------|--------|
| Panels | Surface 1 | None |
| Floating toolbar | Surface 3 | `shadow-lg` |
| Modals | Surface 5 | `shadow-xl` |
| Tooltips | Surface 4 | `shadow-md` |

### 4.4 Borders

- **Avoid heavy borders** between major regions
- Use **1px subtle borders** only for:
  - Separating list items
  - Input field outlines
  - Collapsible panel edges

---

## 5. Component Patterns

### 5.1 Segmented Control (Direction Selector)

Use instead of dropdowns for 2-4 options.

```tsx
<div className="flex bg-surface-200 rounded p-0.5">
  <button className={active === 'DOWN' ? 'bg-white shadow-sm' : ''}>
    ↓ Down
  </button>
  <button className={active === 'RIGHT' ? 'bg-white shadow-sm' : ''}>
    → Right
  </button>
  <button className={active === 'UP' ? 'bg-white shadow-sm' : ''}>
    ↑ Up
  </button>
  <button className={active === 'LEFT' ? 'bg-white shadow-sm' : ''}>
    ← Left
  </button>
</div>
```

### 5.2 Input + Slider Combo

Always pair sliders with numeric input.

```tsx
<div className="flex items-center gap-2">
  <input type="number" value={50} className="w-16 text-right" />
  <input type="range" min={10} max={200} value={50} className="flex-1" />
</div>
```

### 5.3 Collapsible Sections

For inspector panels with many options.

```tsx
<details open>
  <summary className="font-semibold cursor-pointer py-2">
    Layout Options
  </summary>
  <div className="pl-2 space-y-2">
    {/* Controls */}
  </div>
</details>
```

---

## 6. Accessibility Requirements

Every component must satisfy:

| Requirement | Implementation |
|-------------|----------------|
| **Keyboard navigation** | All interactive elements reachable via Tab |
| **Arrow key support** | Segmented controls, lists navigate with arrows |
| **Focus indicators** | Visible focus ring on all focusable elements |
| **ARIA labels** | Buttons without text have `aria-label` |
| **Color independence** | State not conveyed by color alone |
| **Motion respect** | Honor `prefers-reduced-motion` |
| **Screen reader** | Logical heading hierarchy, landmark regions |

### Landmark Regions

```tsx
<nav aria-label="Main navigation">     {/* Rail */}
<main aria-label="Diagram editor">     {/* Stage */}
<aside aria-label="Properties panel">  {/* Inspector */}
```

---

## 7. Responsive Behavior

| Breakpoint | Layout Adjustment |
|------------|-------------------|
| < 768px | Rail collapses to icons only |
| < 1024px | Inspector becomes overlay/drawer |
| < 640px | Split view stacks vertically |

---

## 8. Component Mapping Reference

| UI Need | Pattern | Notes |
|---------|---------|-------|
| Direction toggle | Segmented Control | 4 options: DOWN, RIGHT, UP, LEFT |
| Algorithm selector | Segmented Control | 3-4 options: layered, force, tree |
| Spacing controls | Input + Slider | Precise + visual adjustment |
| Theme toggle | Command Palette | Not in main UI |
| Save | Explicit button | Top bar, keyboard shortcut |
| Load | Explicit button | Top bar, keyboard shortcut |
| Reflow | Floating toolbar | With undo support |
| Zoom | Floating toolbar | In, Out, Fit |
| Notation display | Status bar | Bottom of stage or inspector header |

---

**Last Updated:** 2026-02-01
