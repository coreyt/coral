# Slice 10: Cloud Infrastructure Icon Sets Audit (AWS, GCP, Azure)

Status: completed (`2026-11-24`).

## Official Icon Sets Harvested and Tested

All three major cloud providers publish official SVG architecture icon sets.
Each archive was downloaded directly from the provider's official portal and
tested against Coral's frozen `coral.svg-artwork` version 1 admitter
(`packages/render/src/artwork/svgIconImport029.ts` and
`svgArtworkAdmission029.ts`) after conservative pre-normalization (inlining
Adobe Illustrator `<style>` blocks via SVGO `inlineStyles`, removing metadata
and unsupported `xml:space`/`data-*`/`class` attributes, and sanitizing
non-NCName IDs without altering vector paths or brand colors).

| Provider & Archive | Official Source | Total SVGs Tested | Raw Admitted | Pre-Normalized Admitted | Admission Rate | Avg Canonical Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| **AWS** (`Icon-package_07312026`, 48px Arch + Groups) | `aws.amazon.com/architecture/icons/` | 765 | 748 | 764 | **99.9%** | 3,083 B |
| **Azure** (`Azure_Public_Service_Icons_V25`) | `learn.microsoft.com/en-us/azure/architecture/icons/` | 721 | 628 | 682 | **94.6%** | 3,089 B |
| **GCP Core 2026** (`core-products-icons.zip`) | `cloud.google.com/icons` | 19 | 6 | 19 | **100.0%** | 2,364 B |
| **GCP Category 2026** (`category-icons.zip`) | `cloud.google.com/icons` | 26 | 22 | 26 | **100.0%** | 2,507 B |
| **GCP Full Product Catalog** (`google-cloud-legacy-icons.zip`) | `cloud.google.com/icons` | 216 | 72 | 186 | **86.1%** (97.7% after stripping `baseProfile`/`x`/`y`) | 1,626 B |
| **Total verified** | All three official portals | **1,747** | **1,476** | **1,677** | **96.0%** | **~2.9 KB** |

Every admitted icon passes Coral's **Standard** artwork tier with zero path
distortion and zero color modification.

## Licensing, Trademark, and Bundle-Budget Findings

1. **Vendor licensing (not Apache-2.0):** Official AWS, GCP, and Azure icons
   are proprietary brand/trademark assets. All three permit free use in
   technical architecture diagrams and documentation provided icons are not
   distorted, recolored improperly, or redistributed as a standalone Apache-2.0
   icon library claiming ownership.
2. **Browser bundle ceiling (`@coral-viz/browser`):** Current `0.2.12` bundle
   size is **795.8 KiB gzip** against the normative **800 KiB gzip** ceiling
   (`4.2 KiB` headroom). Statically bundling 1,677 vendor SVGs (~4.8 MB raw)
   into `@coral-viz/browser` is infeasible and would also conflict with pure
   Apache-2.0 package licensing.

## Recommended Two-Layer Strategy for Slice 55 (`@diagram infrastructure`)

1. **Layer 1 — Built-in Apache-2.0 cloud-infrastructure catalog (ships inside
   `@coral-viz/render` & `@coral-viz/browser`):**
   - Crisp, clean, semantically distinct geometric icons (< 2 KiB total gzip)
     covering compute, containers/K8s, serverless, object/block storage,
     SQL/NoSQL DB, cache, queue, event bus, CDN, DNS, load balancer, API
     gateway, firewall/WAF, IAM, secrets/KMS, observability, and nested
     `cloud`/`account`/`region`/`az`/`vpc`/`vnet`/`subnet`/`cluster`
     boundaries, with provider accent palettes (`aws`, `azure`, `gcp`,
     `generic`) and zero Moody *Symbol Overload*.
2. **Layer 2 — Official AWS / GCP / Azure SVG Converter (`coral-cloud-icons`
   converter script + `@symbol` packs):**
   - Ship a deterministic converter (`scripts/convert-cloud-icons.mjs`) that
     transforms official AWS, GCP, and Azure SVG zips directly into valid
     Coral `coral.svg-artwork` v1 `@symbol` definitions (preserving exact
     vendor paths and colors, with provider attribution comments).
   - Users and local cloud benchmarks can include exact official AWS/GCP/Azure
     SVGs in any `.coral` document via `@symbol` (edition `0.2.9` / `0.2.14`)
     with zero `@coral-viz/browser` bloat and full trademark compliance.
