# Coral documentation authoring style

Status: durable authoring authority, promoted by Slice 70 after Slice 60
implementation and review.

Scope: this note governs what documentation pages say and how they are
structured. The markup they are written in is governed by the
Markdown authoring profiles.
The page tree, templates, and fixed column sets are governed by
the information architecture.
Slice and fact ownership, figures, UI names, and the enforcement that exists
today are recorded in
ownership and provenance.
Grammar, voice,
tense, capitalisation, punctuation, and the word list are governed by the
Google Developer Documentation Style Guide, which is adopted by reference and
is never restated here. Normative rules are in the body. Justification is in
Appendix A.

## Decision summary

1. The Google Developer Documentation Style Guide is the baseline, adopted by
   reference.
2. This note adds 14 rules in five areas: IA, CMP, UI, TRM, REG.
3. Precedence is the
   Markdown authoring profiles,
   then this note, then the Google guide.
4. A page's directory path assigns its audience and quadrant. There is no type
   declaration.
5. Application controls and DSL are paired inside one step. Never tabs, never
   parallel control and DSL pages.
6. Enumerated product facts have one owning page, recorded in
   ownership and provenance.
7. Enforcement uses one of three values — `markdownlint`, `check:docs`,
   `review` — and nothing claims more.
8. The form of this note is not a model for the pages it governs.

## Layering and precedence

| Layer | Content | Status | Precedence |
| --- | --- | --- | --- |
| L2 Markdown authoring profiles | Profiles P and V: markup, links, wrapping, permitted containers | Coral-owned | highest |
| L1 this note | 14 Coral rules: structure, components, dual interface, terminology, register | Coral-owned | middle |
| L0 Google Developer Documentation Style Guide | grammar, voice, tense, capitalisation, punctuation, word list | adopted by reference | lowest |

The order is stated before any rule because an agent assembling a page applies
the rule it read most recently rather than the rule that outranks the others.
An agent that reads L0 last will write raw HTML that Profile P forbids.

| Conflict | Resolution |
| --- | --- |
| Raw HTML: the Google guide permits constructs Profile P rule 2 bans | Profile P wins. No raw HTML on any Coral Markdown surface |
| Admonitions: the Google guide's Note, Caution, and Warning triad | Maps onto Callout triggers below. Only that closed set is authored |

**This note must not restate a rule from the Google guide.**

**Where the Google guide and Markdown authoring
profiles conflict, the authoring profiles win.**

Current Profile V extension for the two current language reference wrappers:
Slice 30 permits their exact native VitePress
includes of canonical `SPEC.md` and the policy region. The current Markdown
corpus check verifies the wrapper/directive pair and live owner/range. This is
mechanical inclusion, not authored HTML; arbitrary comments/includes and runtime
HTML remain prohibited. The historical authoring-format record stays intact.

## Acceptance

| ID | Condition | How it is measured |
| --- | --- | --- |
| A1 | An agent given only the rule index, one page template, and the fact-ownership table produces a page that passes `npm run lint:md` and `npm run check:docs` with no rule lookup beyond the IDs the template names | One recorded authoring run against a page not yet written |
| A2 | Every rule declares exactly one enforcement value from the closed set, and every named script is reachable from `npm run verify` | Read the Enforcement line of each rule; read `package.json` |
| A3 | The delta is at most 14 rules and at most 320 normative lines, with rule sections at most 22 lines each | Count rules; count non-blank lines in the fourteen rule sections, each measured from its H3 heading to its Enforcement line |
| A4 | Zero rules restate a rule from the Google Developer Documentation Style Guide | Compare each statement against the Google guide's table of contents |
| A5 | The Slice 60 fresh verifier completes install-to-first-diagram plus three named non-tutorial tasks — import a Mermaid file and determine what was lost, recover work after a reload, export an SVG at a chosen size — with no unanswered question | The Slice 60 walkthrough, recorded in `dev/releases/0.2.5/status/slice-60.md` |

A page that satisfies every rule and still fails A5 is a defect against this
note, not against the page.

## Rule index

This table is the only section an agent must read in full.

| ID | Statement | Enforcement |
| --- | --- | --- |
| DS-IA-001 | A page's directory path MUST assign its audience and quadrant; no frontmatter or other signal declares them. | check:docs |
| DS-IA-002 | A page MUST NOT carry a heading from its quadrant's banned-heading list. | check:docs |
| DS-IA-003 | Every docs page MUST end with a `## Related` section of 1 to 5 links. | check:docs |
| DS-IA-004 | A page that declines to explain a concept MUST link the explanation page for that concept. | review |
| DS-CMP-001 | Content MUST use the component the component selector table assigns to its shape. | review |
| DS-CMP-002 | A reference page's first block after its scope sentence MUST be its lookup table. | check:docs |
| DS-CMP-003 | A section MUST carry at most one container, drawn only from the callout trigger table. | check:docs |
| DS-UI-001 | Canvas and control actions MUST be bold names joined by `>`; DSL, CLI and config MUST be language-tagged fences. | markdownlint, check:docs |
| DS-UI-002 | Every bold UI name MUST match the shipped accessible or command name verbatim, including case. | review, mounted-app test |
| DS-UI-003 | Each numbered step MUST state the observable result the reader can check. | review |
| DS-TRM-001 | Product nouns MUST come from the terminology table; the listed synonyms MUST NOT be used. | review |
| DS-TRM-002 | A fact listed in the fact-ownership table MUST appear in full only on its owning page; other pages link to it. | check:docs, review |
| DS-REG-001 | A published page MUST NOT contain an all-caps RFC 2119 keyword, a rule ID, a Given/When/Then block, or a banned opener. | check:docs |
| DS-REG-002 | An unsupported, experimental or platform-limited capability MUST be stated at the point of use in the status vocabulary. | review |

Where a row names two mechanisms, the first is the gate that decides pass or
fail and is the value the rule's Enforcement line declares; the second is a
supporting check covering part of the same condition.

## Component selector

| Content shape | Component | Anti-pattern |
| --- | --- | --- |
| One sentence defining a purpose or a behaviour | Prose | Backstory, or restating an adjacent fence |
| Steps a reader performs | Numbered list | Bullets, or a paragraph joined by "then" |
| Steps whose order is not load-bearing | Numbered list, still numbered | Bullets, on the argument that order is free |
| Unordered constraints, supported values, or triggers | Bullet list | Multi-attribute relational data |
| Two or more records sharing attributes | Table, using the fixed column set for that record type in the information architecture | A paragraph or a bullet per record |
| Text the reader copies or types | Fenced block with a language tag | Bold, code spans across lines, or a screenshot |
| A canvas or control action | Bold name path joined by `>` | Code spans, quotation marks, or a screenshot |
| Data loss, unsupported status, or a one-time cost | Container, per Callout triggers | Bold prose, or a heading named Note |
| The same content in two diagram formats | `code-group`, documentation site only | Two consecutive fences, or tabs |

## Callout triggers

| Container | Permitted trigger | Google guide equivalent |
| --- | --- | --- |
| `warning` | Irreversible loss: replacing unsaved work; clearing site data; an update activation discarding recoverable work; a conversion or export that drops information the reader cannot recover | Warning |
| `info` | An unsupported, experimental, or platform-limited capability, worded in the status vocabulary | Note |
| `tip` | A one-time cost or delay the reader would otherwise discover by hitting it: the first Whisper model load | Note |
| `code-group` | The same content in two or more diagram formats | none |
| `danger` | Banned | Caution, which maps to `warning` instead |
| `details` | Banned | none |

At most one container per H2 section; two are permitted on
`browser-support.md` only.

The trigger list is closed and is extended only by amending this note.

## Banned headings

**How-to**

- Background, About, Why, How it works, Architecture, Concepts, Design,
  Rationale, Overview, Introduction

**Tutorial**

- Background, About, Why, How it works, Architecture, Concepts, Design,
  Rationale, Overview, Introduction, Alternatives, Options, Troubleshooting

**Reference**

- Introduction, Overview, Getting started, Tutorial, Steps, Walkthrough

**Explanation**

- Steps, Procedure, How to, Quick start, Prerequisites

## Banned openers

These phrases are banned as the opening words of a page, of a section, or of a
numbered step.

- In this guide
- This page
- This section
- We will
- We'll
- Let's
- Welcome to
- As you know
- Simply
- Just
- Of course
- It's important to note
- First of all

## Terminology

| Use | Do not use | Note |
| --- | --- | --- |
| canvas | whiteboard, workspace, drawing area | |
| DSL editor | text editor, code pane, source view | |
| Properties panel | inspector, sidebar, properties pane | |
| diagram | chart, graph, drawing | |
| document | project, file | `file` is permitted only for an actual operating-system file |
| object, node | element, item, box, widget | `object` in canvas prose; `node` in DSL prose and reference pages only |
| connection, edge | arrow, link, line, relationship | `connection` in canvas prose; `edge` in DSL prose and reference pages only |
| port | anchor, connector | The canvas affordance for starting a connection has no shipped accessible name, so prose describes the drag without naming the affordance |
| notation library | stencil, palette, shape library, notation set | |
| symbol | shape, icon, glyph | `shape` is reserved for the shape primitive vocabulary |
| shape primitive | shape type, figure | |
| layout, reflow | auto-layout, arrange, tidy | `reflow` names the action of the Reflow layout control |
| conversion | import, translation | Covers Mermaid, DOT, and PlantUML in both directions |
| export | download, save as | Covers producing SVG, PNG, or other output |
| recovery | autosave, restore point | |
| voice input | dictation, speech-to-text | `speech-to-text` is permitted only when naming Whisper |
| AI generation | copilot, assistant, chatbot | |

The table governs product nouns. A word in the Do-not-use column keeps any
unrelated meaning it already has and is barred only where a Use-column term is
the subject: `figure` names a published SVG or screenshot asset, `element`
names an HTML element, and `shape` names a shape primitive.

## Status vocabulary

The first five statements are used verbatim. Accessibility status is selected
at Slice 80 from actual candidate evidence rather than frozen in advance.

1. Chrome is the supported desktop browser. Edge, Safari, and Firefox are
   experimental.
2. Coral supports desktop browsers only. Mobile browsers are not supported.
3. AI generation requires a network connection. It does not work offline.
4. Voice input requires a network connection when the Whisper model loads.
   Voice processing remains local after the model loads for that session.
5. The on-device editing model is experimental. It requires a network
   connection to download. Its requests run in this browser and are not sent
   anywhere.

Accessibility support remains experimental. If no real evidence is collected,
use: `NVDA and VoiceOver support is experimental and untested. No screen-reader
evidence has been collected for the named candidate.` If evidence is collected,
state exactly which reader, browser, platform, and result were exercised without
broadening the support claim.

## Rules — information architecture (IA)

### DS-IA-001 — Path assigns audience and quadrant

**Statement**: A page's directory path MUST assign its audience and quadrant;
no frontmatter or other signal declares them.

**Given** a published documentation page
**When** its path is read
**Then** the first directory names the audience from the closed set `use`,
`embed`, `contribute`, the second names the quadrant from the closed set
`how-to`, `reference`, `explain`, no declaration of page type appears in the
page itself, and the only exempt patterns are `docs/index.md`,
`docs/<audience>/index.md`, and `docs/<audience>/get-started.md`.
Sub-directories beneath a quadrant are permitted and do not change the
quadrant.

**Conforming**

```text
docs/use/reference/notations.md#bpmn
```

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`.

### DS-IA-002 — No banned quadrant heading

**Statement**: A page MUST NOT carry a heading from its quadrant's
banned-heading list.

**Given** a page whose quadrant is assigned by DS-IA-001
**When** its headings are compared against Banned headings
**Then** no heading at any level matches an entry listed for that quadrant,
compared case insensitively.

**Conforming**

````markdown
# How to convert a Mermaid file

## Result

## Related
````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`.

### DS-IA-003 — Every page ends Related

**Statement**: Every docs page MUST end with a `## Related` section of 1 to 5
links.

**Given** a published documentation page
**When** its final H2 section is read
**Then** that section is `## Related`, it holds at least 1 and at most 5 links,
and a page in a declared sequence carries `Next:` and the next page as the
first bullet.

**Conforming**

````markdown
## Related

- Next: How to connect and route objects — how-to/connect-and-route-objects.md
- Understanding connection rules — explain/connection-rules.md
````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`.

### DS-IA-004 — Declined concept links explanation

**Statement**: A page that declines to explain a concept MUST link the
explanation page for that concept.

**Given** a page that names a Coral concept it does not define
**When** the sentence naming that concept is read
**Then** the concept is named and the explanation page that owns it is linked
in the same sentence or the one after it.

**Conforming**

````markdown
Coral refuses this connection because BPMN sequence flows cannot cross a pool
boundary. Understanding connection rules — explain/connection-rules.md
````

**Non-conforming**

````markdown
Coral refuses this connection because it is not allowed.
````

Repair: name the concept and link the explanation page that owns it.

**Enforcement**: review.

## Rules — component selection (CMP)

### DS-CMP-001 — Shape selects the component

**Statement**: Content MUST use the component the component selector table
assigns to its shape.

**Given** a passage of page content
**When** its shape is matched against the rows in Component selector
**Then** the passage uses the component that row assigns and does not use that
row's anti-pattern.

**Conforming**

````markdown
| Format | Use it for | Limits |
| --- | --- | --- |
| SVG | print and further editing | fonts come from the site stylesheet |
| PNG | slides and chat | fixed resolution |
````

**Non-conforming**

````markdown
Coral exports SVG, which suits print and further editing but takes its fonts
from the site stylesheet, and PNG, which suits slides but is fixed resolution.
````

Repair: two or more records sharing attributes become a table with the fixed
column set for that content.

**Enforcement**: review.

### DS-CMP-002 — Reference opens with table

**Statement**: A reference page's first block after its scope sentence MUST be
its lookup table.

**Given** a page under a `reference` directory
**When** the blocks after the H1 are read in order
**Then** the first block is one sentence of scope naming what is excluded, and
the second block is the lookup table, with no prose paragraph between them.

**Conforming**

````markdown
# Keyboard shortcuts

Every chord the editor binds. Commands with no chord are not listed.

| Chord | Action | Scope |
| --- | --- | --- |
| `Ctrl+Z` | Undo | Diagram editor |
````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`.

### DS-CMP-003 — One container per section

**Statement**: A section MUST carry at most one container, drawn only from the
callout trigger table.

**Given** an H2 section of a documentation page
**When** its containers are counted and classified
**Then** at most one container is present, its kind appears in Callout triggers
with a permitted trigger the section meets, and `danger` and `details` are
absent. Two containers are permitted on `browser-support.md` only.

**Conforming**

````markdown
::: warning
Clearing site data removes recovery data and settings.
:::
````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`.

## Rules — dual interface (UI)

### DS-UI-001 — Bold path, tagged fence

**Statement**: Application control actions MUST be bold names joined by `>`;
DSL, CLI and config MUST be language-tagged fences.

**Given** a numbered step that a reader performs
**When** its control action and its DSL counterpart are written
**Then** the control action is bold UI names joined by `>`, the DSL counterpart
is a fenced block carrying a language tag, both sit inside the same numbered
step, and a step with no counterpart carries the fixed sentence
`Application only — there is no DSL form for this.` or
`DSL only — there is no canvas control for this.`

**Conforming**

`````markdown
1. Add the first object.

   Canvas: **Insert** > **Task**

   DSL:

   ```coral
   node checkout : task
   ```

   The new object appears at the centre of the viewport.
`````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`. The
language tag is additionally covered by markdownlint `MD040`.

### DS-UI-002 — UI names match the application

**Statement**: Every bold UI name MUST match the shipped accessible or command
name verbatim, including case.

**Given** a bold UI name on a published page
**When** it is exercised in the mounted production fixture described by
ownership and provenance
**Then** it matches the application verbatim and case sensitively, and where
an action ships both an accessible name and a command-palette label, the
accessible-name form is the one written. Bold is reserved for UI names, so a
diagram object's own label is written unbolded and is never UI-name checked.

**Conforming**

````markdown
Press **Reflow layout**.
````

**Enforcement**: review, supported by mounted production fixture assertions in
the editor's existing test suite.

### DS-UI-003 — Steps state observable result

**Statement**: Each numbered step MUST state the observable result the reader
can check.

**Given** a numbered step on a tutorial or how-to page
**When** the step is read to its end
**Then** its final sentence names something the reader can see in the
application after performing the action.

**Conforming**

````markdown
3. Drag from the source object to the target object. The Properties panel
   shows the new connection.
````

**Non-conforming**

````markdown
3. Drag from the source object to the target object.
````

Repair: add one sentence naming what the reader can see once the action
succeeds.

**Enforcement**: review.

## Rules — terminology and facts (TRM)

### DS-TRM-001 — Product nouns from table

**Statement**: Product nouns MUST come from the terminology table; the listed
synonyms MUST NOT be used.

**Given** a sentence naming a Coral product concept
**When** each product noun in it is looked up in Terminology
**Then** every noun is a Use-column term, no Do-not-use synonym appears, and
the canvas-prose and DSL-prose split recorded in the Note column is respected.

**Conforming**

````markdown
Select the object on the canvas, then create a connection.
````

**Non-conforming**

````markdown
Select the item on the whiteboard, then create an arrow.
````

Repair: replace each synonym with the Use-column term from Terminology.

**Enforcement**: review.

### DS-TRM-002 — One owning page per fact

**Statement**: A fact listed in the fact-ownership table MUST appear in full
only on its owning page; other pages link to it.

**Given** an enumerated product fact listed in the fact-ownership table in
ownership and provenance
**When** a page other than its owning page needs that fact
**Then** the page states only the part its task needs and links the owning
page, and the full enumeration appears on the owning page alone.

**Conforming**

````markdown
The keyboard shortcuts reference owns the full chord list —
reference/keyboard-shortcuts.md
````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`, which
covers the generated blocks. Every other repetition is caught at review.

## Rules — register (REG)

### DS-REG-001 — No spec tokens published

**Statement**: A published page MUST NOT contain an all-caps RFC 2119 keyword,
a rule ID, a Given/When/Then block, or a banned opener.

**Given** a published surface — `docs/**`, `README.md`, or
`packages/*/README.md`
**When** it is scanned for specification tokens
**Then** no all-caps RFC 2119 keyword, no rule ID of the `DS-` form, no bold
Given, When, or Then line, and no phrase from Banned openers is present.
Ordinary prose such as "you must allow microphone access" is legal, because the
ban covers all-caps tokens only. Files under `dev/` are out of scope: they
legitimately use Given/When/Then and requirement IDs.

**Conforming**

````markdown
Coral saves your work in this browser. Clearing site data removes it.
````

**Enforcement**: check:docs, via `scripts/check-docs-structure.mjs`.

### DS-REG-002 — Status stated at use

**Statement**: An unsupported, experimental or platform-limited capability MUST
be stated at the point of use in the status vocabulary.

**Given** a page describing a capability that is unsupported, experimental, or
limited by platform
**When** the capability is first described
**Then** the matching sentence from Status vocabulary appears verbatim at that
point, not only on a support page.

**Conforming**

````markdown
AI generation requires a network connection. It does not work offline.
````

**Non-conforming**

````markdown
AI generation may not always be available.
````

Repair: replace the hedge with the matching sentence from Status vocabulary.

**Enforcement**: review.

## This note is not a model

The form of this note is not a model for the pages it governs. This note is a
specification read by agents; the pages it governs are read by people using
Coral.

None of the following may appear on a published page:

- Rule identifiers
- All-caps RFC 2119 keywords
- Given/When/Then blocks
- Enforcement columns
- Condition and failure clauses
- An appendix-of-rationale structure

That list is greppable, which is why DS-REG-001 checks it rather than trusting
it. The conforming examples above are written in the register a Coral user
should read — second person, present tense, answer near the top — on
purpose, because an agent pattern-matches to an example more strongly than to
rule text.

## Enforcement

Every rule above declares one value from the closed set `markdownlint`,
`check:docs`, `review`. Which command runs each of those today, what is in
`npm run verify` and what is not, and which single new script is authorised
are recorded once in
ownership and provenance.
This note does not restate that table.

Two consequences of it bind rule text here. Adding `check:docs` to
`npm run verify` is a prerequisite of Slice 60 closure, because a rule whose
gate runs only in CI cannot be self-certified. And a rule marked review says so
out loud rather than implying coverage it does not have.

Suppression is never a repair. Both markdownlint configurations set
`noInlineConfig`, so a failing check is fixed by changing content or by an
itemised ignore entry with a named owner.

## Open questions

1. An earlier draft's example for DS-UI-003 ended "The Properties panel shows
   the new edge." That wording uses `edge` in canvas prose, which DS-TRM-001
   reserves for DSL prose and reference pages. The example here says
   `connection` instead. Confirm the substitution or amend Terminology.
2. A2 requires exactly one enforcement value per rule, while the index assigns
   two mechanisms to DS-UI-001, DS-UI-002, and DS-TRM-002. This note reads the
   first as the deciding gate and the second as a supporting check, and each
   rule's Enforcement line names one value. Confirm that reading.
3. Resolved. Profile P rule 7 now separates repository-file targets, which stay
   relative and keep the `.md` extension, from external targets, which are
   inline absolute `https` links carrying link text. The Google Developer
   Documentation Style Guide may therefore be cited with its URL. This note
   still cites it by name only; adding the URL is a Slice 60 authoring task,
   not a change to this rule set.
4. A3's 320-line budget is read here as the fourteen rule sections, because
   fourteen sections at the stated 22-line ceiling is 308. The inline referent
   tables that Component selector through Status vocabulary carry cannot fit
   inside the same budget and are excluded from it. Measured: 243 non-blank
   lines across the rule sections, the longest section 22. Confirm the measure.
5. Three index statements exceed the 110-character target: DS-UI-001 at 112
   including its code-span backticks and 110 without them, DS-REG-001 at 119,
   and DS-REG-002 at 120. The statements are kept verbatim from the settled
   specification rather than reworded. Confirm, or supply shorter wording.

## Appendix A — Justification

### A1 — Why a delta rather than a full style guide

A full Coral style guide would restate grammar, voice, tense, capitalisation,
and a word list that the Google Developer Documentation Style Guide already
maintains and that no Coral reader benefits from having forked. Every restated
rule is a second source of truth that ages independently of the original. The
delta records only what is true of Coral and false of documentation in general:
a dual-interface product, eight notation libraries, and a set of facts that has
already drifted once.

### A2 — Why the precedence order is stated first

An agent assembling a page applies the rule it read most recently, not the rule
that outranks the others. If the layering appeared at the end, an agent that
read the Google guide last would emit raw HTML that Profile P bans, and the
failure would surface as a lint error with no explanation of which authority
won. Stating the order before any rule makes the resolution available at the
moment of conflict.

### A3 — Why the keyword lives inside the statement

A separate Level column is dropped whenever a rule is quoted, summarised, or
retrieved as a fragment, and a rule quoted without its level reads as advice. A
keyword inside the statement travels with the sentence. It also keeps each row
of the rule index a complete obligation, so the index alone is sufficient for
A1's first-run authoring test.

### A4 — Why 14 rules

Fourteen is what remains after every rule the Google guide already covers is
removed, and after every rule that could not name an enforcement handle is
removed. A rule with no enforcement handle is a review opinion wearing a rule's
clothes: it produces disagreement at review time with no way to settle it, and
it inflates the count the guide is measured by. Five rules here are marked
review, and they say so rather than implying a check exists.

The rule count is not offered as a defence against lifeless documentation. The
page templates in the information architecture
impose roughly eighty further constraints that are not counted as rules. The
defence is A5, the fresh verifier outcome test.

### A5 — Why examples carry the human register

The rules are read by agents and the pages are read by people, so both
registers must be present in one document without contaminating each other.
Rule text carries the machine register: identifiers, keywords, conditions.
Examples carry the human register: second person, present tense, imperative
steps, the answer near the top. An agent pattern-matches to the example more
strongly than to the rule text, so the example is where the human-facing result
is actually specified. DS-REG-001 exists to stop the machine register leaking
the other way.

### A6 — Why containers are a closed set

`details` is banned because collapsed content is invisible to Ctrl+F, which is
the only lookup mechanism guaranteed on every rendering surface, and invisible
to the Slice 60 walkthrough, which is the only test capable of detecting a page
that passes every rule and still fails a reader. `danger` is banned because
nothing Coral does is dangerous, and a permitted-but-unused container is
eventually used: severity inflation follows availability. Four permitted kinds
with named triggers keep containers rare enough to stay legible.

### A7 — Why tabs are rejected for canvas versus DSL

Four independent reasons, each sufficient on its own. The application and DSL
editor are concurrent views of one document, not alternative routes, so
presenting them as a choice misstates the product. `code-group` is code-only
and cannot hold a bold click-path, so a tabbed pair would have to drop the
control half or smuggle it into a fence. An inactive tab is invisible to Ctrl+F,
so half the instructions become unfindable. Collapsed or hidden text is
invisible to the walkthrough, so the verifier cannot confirm the half that is
not showing.

### A8 — Why enumerated facts are owned rather than repeated

The drift is verified, not hypothetical. `.claude/skills/coral-dsl/SKILL.md`
advertises 46 node types and 27 shape primitives. Neither number matches the
code it describes, and both were correct when written. A fact repeated on five
surfaces has five opportunities to age and one chance of being corrected
everywhere. Single ownership plus a link turns an accuracy problem into a
navigation problem, which the `## Related` obligation already solves.

### A9 — Vague-form replacement table

Guidance for whoever edits this note. It is not a checked rule, and no lint
enforces it: a banned-word grep over one file the team wrote, to catch the team
writing it, is machinery outrunning content.

| Vague form | Replacement |
| --- | --- |
| concise, brief | A line or word count, or the constraint that produced the limit |
| where appropriate | The condition under which it applies |
| avoid excessive | The number at which it becomes excessive |
| clear, readable | The property being asked for, or a conforming example |
| prefer, generally | MUST, SHOULD, or MAY, with the exception named |
| such as, etc. | The closed list, or a statement that the list is open |
| be consistent | The single form that is correct |
| is recommended | SHOULD, with the reason |
| usually, typically | The case that holds and the case that does not |

### A10 — What was deliberately not done

No restatement of any Google Developer Documentation Style Guide rule. No
Diataxis purity: the quadrants assign directories and banned headings, not
doctrine. No documentation versioning. No interactive or embedded Coral inside
documentation. No transclusion of any kind. No canonicalisation of the two
skill trees: documentation and skills both derive from code, and neither cites
the other. No rule that cannot name its enforcement mechanism. No repository
root style file, and no promotion of this note to `dev/documentation-style.md`,
which is Slice 70's move.
