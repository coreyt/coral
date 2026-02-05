# CCD-REQ-003: Diagram Types Analysis

> **Requirement**: CCD-REQ-003 (Diagram Types - Codebase Overview)
> **Status**: Analysis complete, **not ready for implementation**
> **Date**: 2026-02-05
> **Author**: Claude (with user review)

---

## Executive Summary

This analysis examines whether C4-style diagram hierarchies are the right approach for auto-documenting code architecture using Coral + Armada. The conclusion is that **the direction is sound, but we need clearer boundaries** between what can be auto-generated and what requires human curation.

---

## Background: Industry Standards for Architecture Diagrams

### C4 Model (Current Industry Favorite)

The C4 model has become the de facto standard for software architecture diagrams, used by ~70% of architects and senior engineers (2025 State of Software Architecture report).

| Level | Name | Purpose |
|-------|------|---------|
| 1 | System Context | 30,000-foot view: system in the world |
| 2 | Containers | Applications, data stores, microservices |
| 3 | Components | Internal building blocks of a container |
| 4 | Code | Classes/interfaces (rarely maintained) |

**Key insight**: Most teams use only Levels 1-2. Levels 3-4 are often skipped because code changes too fast for diagrams to stay accurate.

### UML (Formal Standard)

Still valuable for specific cases:
- **Sequence Diagrams**: Data flow between objects/services over time
- **Deployment Diagrams**: Physical/virtual infrastructure

### Standard Shape Vocabulary

| Shape | Meaning |
|-------|---------|
| Rectangle | Generic process, component, or system |
| Cylinder | Database or persistent storage |
| Cloud | Internet or external service |
| Diamond | Decision point (flowcharts) |
| Stick Figure | Human user or external actor |
| Dashed Arrow | Dependency or async message |
| Solid Arrow | Synchronous call or direct data flow |

### Mixing Diagram Types

Industry practice supports hybrid approaches:
- **C4 + Sequence Diagrams**: Structure + behavior
- **C4 + DFD**: Ownership + data movement
- **C4 + Flowcharts**: Architecture + business logic

---

## The Core Tension: Auto-Generated vs. Human-Curated

### What C4 Shows vs. What Armada Knows

| C4 Level | What It Shows | Can Armada Auto-Generate? |
|----------|---------------|---------------------------|
| **Context** | System in the world (external actors, 3rd-party APIs) | **No** - requires human knowledge |
| **Container** | Runtime units (services, DBs, apps) | **Partially** - can infer packages/modules, not deployment |
| **Component** | Internal building blocks | **Yes** - classes, modules, boundaries |
| **Code** | Classes/interfaces | **Yes** - symbols, relationships |

**The gap**: C4 is designed around **deployment architecture** (what runs where). Armada knows **code structure** (what calls what). These overlap but aren't the same.

---

## What Coral + Armada Can Actually Auto-Generate

### Fully Automatic

Based on Armada's current capabilities:

| Capability | Armada Source | Maps To |
|------------|---------------|---------|
| Module/package dependency graphs | `get_architecture` | ~Container |
| Call graphs for entry points | `find_dependencies` | Code |
| Inheritance/type hierarchies | `find_dependencies` | Code |
| Symbol outlines with relationships | `search`, `get_context` | Code |

### Semi-Automatic (Armada + Heuristics)

| Capability | Armada Source | Human Input Needed |
|------------|---------------|-------------------|
| Component boundaries | `get_dossier` (community detection) | Validation of boundaries |
| Data flow | `get_type_flow` | Business semantics |
| Entry points | `what_uses` / `what_breaks` | Which are "real" entry points |

### Requires Human Input

| Capability | Why Armada Can't Know |
|------------|----------------------|
| External system context | "This talks to Stripe" is not in code structure |
| Deployment topology | "This runs on Lambda" is infrastructure |
| Business semantics | "This is the Claims Processing domain" |
| Sequence timing | Requires runtime traces, not static analysis |

---

## Proposed: Code-First Hierarchy (Not Pure C4)

Instead of mapping directly to C4, propose a **code-first hierarchy** that aligns with what Armada can actually provide:

| Level | Diagram Type | Armada Source | Maps to C4 |
|-------|--------------|---------------|------------|
| **Codebase Overview** | Package/module graph | `get_architecture` | ~Container |
| **Domain Focus** | Community cluster | `get_dossier` | ~Component |
| **Symbol Deep-Dive** | Call graph / inheritance | `find_dependencies` | Code |
| **Behavior** | Sequence (future) | Runtime traces | Sequence |

This is what coral-code-design Issues #28, #32 are already building.

---

## Where the C4 Framing is Right

1. **"Label the mystery"** - Armada excels at revealing structure that humans can then name and annotate.

2. **"Describe the arrow"** - Armada knows `calls`, `imports`, `extends`. We can auto-label relationships.

3. **"Mixing diagram types"** - Drill-down navigation (overview → detail) is exactly what coral-code-design implements.

4. **"The User is a Stick Figure"** - Clear separation between code and external actors (though Armada won't auto-detect external actors).

---

## Where to Be Careful

### 1. Sequence Diagrams

**Problem**: Sequence diagrams show temporal ordering of a request flow. Armada provides static call graphs, not runtime traces.

**What we can do**: Show call graphs that *approximate* sequence (A calls B calls C), but without timing or branching paths.

**What we can't do**: Auto-generate true sequence diagrams from code alone.

### 2. C4 Context Diagrams

**Problem**: Context diagrams show external systems (Stripe, AWS, users). Armada knows imports but not semantic meaning.

**What we can do**: Detect `stripe-node` import and suggest "External: Stripe" placeholder.

**What we can't do**: Know if the Stripe integration is for billing vs. identity vs. connect.

### 3. Data Flow Diagrams (DFD)

**Problem**: DFDs (Yourdon/DeMarco style) show data transformations. Armada traces type flow, not data transformation semantics.

**What we can do**: Show type flow (`User` → `AuthService` → `TokenManager`).

**What we can't do**: Know that this represents "user authentication" vs. "user profile update".

---

## Recommendation

### Reframe the Value Proposition

> "Coral + Armada auto-generates the **structural truth** of your codebase. You annotate it with **architectural intent**."

### Concrete Strategy

1. **Auto-generate** package graphs, call graphs, type hierarchies from Armada
2. **Let users annotate** with external systems, deployment context, business domains
3. **Persist annotations** in `.coral-code-design/` files alongside auto-generated structure
4. **Detect drift** when code changes invalidate annotations (Armada's `detect_drift`)

### Implementation Implications

The "C4 + Sequence + Flowchart" hierarchy is a good **mental model for users**, but we should be clear:

- **Levels 3-4 (Component/Code)**: Auto-generation shines here
- **Levels 1-2 (Context/Container)**: Need human curation with Armada assistance

---

## Why We're Not Ready

1. **Annotation system not implemented** (CCD-REQ-006) - Can't persist user-curated context

2. **External system detection heuristics not built** - Can't even suggest external dependencies

3. **No clear UX for "auto + curated"** - Need to design how users add context to auto-generated diagrams

4. **Sequence diagram story unclear** - Either defer entirely or invest in runtime trace integration

---

## Next Steps (When Ready)

1. **Implement CCD-REQ-006 (Annotation Layer)** - Foundation for human curation

2. **Design "Curation Mode" UX** - How users add external systems, deployment info, business context

3. **Build external dependency heuristics** - Detect npm packages, flag as "external system candidates"

4. **Defer sequence diagrams** - Focus on static structure first; consider runtime trace integration later

5. **Document the "auto vs. curated" boundary** - User education on what to expect

---

## References

- [C4 Model](https://c4model.com/)
- [2025 State of Software Architecture](internal reference)
- [CCD-REQ-003 in requirements doc](../coral-code-design-requirements.md)
- [coral-code-design Phase 1 Progress](../../PROGRESS.md)

---

*This analysis was created to capture the current thinking on CCD-REQ-003. The requirement is sound but implementation should wait until the annotation layer and curation UX are designed.*
