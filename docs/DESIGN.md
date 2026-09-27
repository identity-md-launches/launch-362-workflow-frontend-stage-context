# Badges design

This document is located in `docs/` because the assignment's overriding write scope excludes a root `DESIGN.md`. It describes the final frontend source, not a proposed redesign.

## Overview

Badges is a small Sepolia experiment for creating and awarding nontransferable tokens. The page uses warm paper, dark green ink, serif headlines and a restrained lime badge illustration. The intended hierarchy is introduction → wallet state → create/award/swap → public profiles. This direction was inferred from the brief; it is not a claim of separately approved branding.

The local source of truth is `web/src/styles.css`, with component markup and states in `web/src/App.tsx`. The circular hero seal is explicitly labelled an illustration; actual badges appear only after contract reads.

## Colors

Tokens are defined at `web/src/styles.css:1`. There is one light theme. No external palette or font service is used.

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#f3f0e8` | Page and disabled controls |
| `--surface` | `#fffdf8` | Panels, fields, light button text |
| `--ink` | `#222b25` | Main text and wallet button |
| `--muted` | `#60645b` | Supporting copy, labels and disabled text |
| `--line` | `#d5d7c9` | Structural dividers and disabled borders |
| `--control-border` | `#858b7b` | Enabled input/button outlines |
| `--accent` / `--accent-hover` | `#315541` / `#244331` | Primary create action and hover |
| `--accent-soft` | `#e8eddf` | Swap panel, selected type and hover surfaces |
| `--seal` / `--seal-ink` | `#dfeb9f` / `#33432b` | Decorative hero illustration only |
| `--error` | `#963f2c` | Errors and holder burn control |
| `--focus` | `#705baf` | 3px keyboard outline, offset 4px |

Measured rendered pairs: ink/surface 14.34:1, supporting copy/surface 5.95:1, supporting copy/swap panel 5.07:1, wallet button 14.34:1, burn button 6.79:1. These are the identified opaque pairs in `docs/evidence/design-checks.json`, not a claim that every conceivable state was measured. Errors and transaction states also use explanatory text.

## Typography

- Body: Arial, Helvetica, sans-serif; root 16px, weight 400, line-height 1.6. Paragraph measure is capped at 68ch.
- Display and section headings: Georgia, Times New Roman, serif. H1 uses `clamp(2.8rem, 5vw, 4.6rem)`, line-height 1.13, letter spacing −0.055em. It contains a serif italic second line. The narrow breakpoint uses `clamp(2.5rem, 10vw, 3.2rem)`.
- H2 uses `--text-title: 1.75rem`, with deliberate profile-heading and responsive variants; H3 uses 1.2rem. Headings use balanced wrapping; paragraphs use pretty wrapping.
- Form labels use 0.8125rem and weight 600; input text remains 1rem. Eyebrows use small uppercase labels and positive tracking. Lowercase text is preserved in source.
- Changing balances and addresses use tabular numerals. Long addresses wrap and remain accessible through explorer links; the connected address is also shown in full. Displayed balances are shortened to five fractional places with the full value in a title; quote minimums use exact token decimals.
- System fonts use native fallbacks and `font-synthesis: none`. CSS family selection was inspected; exact platform font files/weight mapping across operating systems were not verified. No downloadable font assets are required.

## Layout

`.shell` has a 1240px maximum width, automatic inline margins and 40px desktop inline padding. Repeated form groups use 12–24px gaps; panels use 28px padding. The workspace uses a 1.6fr/1fr grid: create and manage on the left, swap on the right. DOM, keyboard and mobile stacking order are create, swap, manage. Each region is separately labelled and reachable by native controls.

Breakpoints are 64rem, 48rem and 34rem. The 64rem rule reduces spacing and heading sizes. At 48rem all workspace panels span the available width, header navigation hides, account state becomes two columns and profile search wraps. At 34rem the hero stacks, fields/actions wrap, profile badge cards become one column and margins reduce to 18px. Profile cards otherwise use three columns, then two below 48rem. No fixed-position transaction controls obscure content.

Rendered widths checked: 1440, 900, 768, 390 and 320 CSS px. None overflow after the decorative ring correction. A 200% root-font enlargement at 390px also reflowed without horizontal overflow; this is not browser-native zoom evidence.

## Elevation & Depth

Panels are flat with 1px structural borders. The swap surface uses a tonal background. Only the decorative seal has an offset shadow (`10px 14px 0 var(--accent-soft)`) and a rotated elliptical outline. Real badge images have a 1px black 10% inset outline. There are no custom overlays, dropdown portals or loading skeleton animations; destructive confirmations use the browser's native confirm dialog.

## Shapes

`--radius: 16px` is used for panels/empty states, controls use 8px and badge cards 12px. Step markers and decorative seals are circles; small fee/type pills have 20px rounding. Inputs/buttons are at least 44px high, generally 48px for fields. The mobile ring is 230px wide to stay inside the 320px viewport when rotated.

## Components

| Pattern | Source | Behavior |
| --- | --- | --- |
| `Field` | `web/src/App.tsx:95` | Wrapping native label, visible field title, optional hint; no placeholder-only labels |
| `Seal` | `web/src/App.tsx` | Decorative SVG/CSS preview; no image-generation or remote asset dependency |
| `.panel`, `.section-heading`, `.step` | `web/src/styles.css` | Reusable form section, number and heading grouping |
| Buttons | `web/src/styles.css` | Neutral default, primary create action, quiet refresh, destructive burn; native disabled, hover, active and focus states |
| `note(scope)` | `web/src/App.tsx` | Persistent local status/error region, pending text and explorer transaction link |
| `.selected-type` | `web/src/styles.css` | Name, type ID and issuer shown together before award/handover |
| `.badge-card` / `.empty-state` | `web/src/App.tsx`, `web/src/styles.css` | On-chain image and identifiers; explanatory empty/loading/error states; holder-only burn |
| Native `details` | `web/src/App.tsx` | Explicit disclosure affordance for handover and type directory |
| `.pagination` | `web/src/styles.css` | Six records per page, previous/next buttons disabled at boundaries |

Skip-to-content focuses `main`. Native forms work with Enter; buttons work with keyboard activation. Focus uses a visible 3px outline; forced-color mode restores system colors. Hover styling applies only to hover-capable devices. Only button background/press feedback animates (120ms, scale 0.96), gated by `prefers-reduced-motion: no-preference`.

## Do's and Don'ts

Reuse `.shell`, `.panel`, `Field` and the existing spacing before adding new page-specific structure. Keep one primary creation action and use neutral controls for supporting actions. Keep a badge's ID and issuer beside its name. Explain missing prerequisites near disabled controls. Keep transaction failures visible until the next action.

Do not style static status as a clickable control, hide addresses without an explorer/full-value path, synthesize a badge collection before reads, or enable a write solely because a wallet connected. New sections should use an H2, labelled native forms, a local feedback region and the existing mobile breakpoints. A future route requires a new static export or anchor navigation; server rewrites are not available.

Design review used Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method used Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. See [attribution](DESIGN_ATTRIBUTION.md) and [validation](VALIDATION.md).
