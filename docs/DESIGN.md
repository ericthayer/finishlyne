# Finishlyne design spec

**Status:** v3 (2026-10-18): Eric asked for a more vibrant palette and a new typeface; layout, spacing, type scale and component shapes are unchanged from v2 (locked 2026-10-10). Changes to the visual language go through this doc.

**Live spec:** [Finishlyne design system](https://claude.ai/artifact/H24xMhZE5icRofmFfSeJ7P) (brand book, tokens, every component with previews, the Overview and Resume screens).

## Direction

Dark-first command center. A violet-black shell that fills the screen (icon rail, top bar with search, KPI strip, panels on a 12-column grid, activity rail on the right) with saturated accents: electric violet for action, cyan, mint, orange and hot pink for status, and one reserved loud colour, electric lime, for what is in play. The track idea stays underneath: three lanes are the WIP cap, `+9d` split times measure staleness.

| Decision | Choice | Why |
|---|---|---|
| Theme | Dark default; light is a designed alternate via `data-theme="light"` | Eric's daily driver is dark; light still passes AA |
| Shell | Rail · top bar · main · activity rail, no max-width | Fills a 2K display instead of leaving margins |
| Fluid scale | Type, spacing and shell sizes `clamp()` from 1280px to 2560px viewports | Body 14px → 18px; panels get roomier, not just wider |
| Accent | `signal` lime on the Next action band, filled lanes and lane-card edges only | One loud thing per screen is the product's thesis; lime is the one hue no other token uses |
| Primary | `brand` electric violet button (deep violet in light), one per view | Separates "act" from "attend"; dark text on violet in dark, white in light |
| Status | Idea grey-violet, Ready cyan, Active lime, Paused violet, Shipped mint; warning orange, danger hot pink | Saturated on dark; deepened in light to hold 4.5:1 as text and inside 16% tinted chips |
| Type | Plus Jakarta Sans and Geist Mono, self-hosted variable woff2, Latin subset | Geometric and friendly like the references, keeps tabular figures; ~50 KB of fonts, sans preloaded, `font-display: swap` |
| Shape | 3/6/12px radii, 1px hairlines, no panel shadows | Elevation is reserved for dialogs |
| Overview | KPI strip, Now lanes, Finish rate, Projects by status, Projects table, Recent activity | Decision screen, not a kanban board |
| Celebration | None | Shipping is its own reward; no gamification |

## Principles

1. **Resume beats overview.** The Resume screen is the hero: name, next action, handoff brief, then context.
2. **Colour never carries meaning alone.** Status and staleness always pair colour with a word and a glyph.
3. **Gates explain themselves.** Errors say what to add ("Add an outcome to move this to Ready").
4. **WCAG 2.2 AA in both themes.** Text 4.5:1 on every surface and inside every tinted chip; control borders, focus rings and chart marks 3:1, including inside the lime band (`focus-on-signal`).
5. **Fluid, not breakpoint-stepped.** Sizes scale continuously with the viewport; container queries decide layout per panel.

## Files

| Path | Role |
|---|---|
| `design/tokens.json` | Source of truth for colour (light + dark), type, spacing, radius, motion |
| `design/build-tokens.mjs` | Compiles tokens to CSS custom properties, per-style `--text-*` variables and `.style` type classes |
| `src/ui/tokens/tokens.css` | Generated; never edit. `npm run tokens` rebuilds, a test fails if it drifts |
| `src/ui/styles/components.css` | Locked component styles (`fl-*` classes), token values only |
| `src/ui/components/` | The Custom Elements in strict TypeScript, one module per component; the source of truth for code |
| `design/reference/components.js` | The spec's original bundle, kept for comparison with the live design system |

## Theming

Dark is `:root`. Set `data-theme="light"` on `<html>` for light; `<fl-theme-toggle>` does this and remembers the choice. Dark is designed, not inverted: `surface-sunken` is lighter than `surface-raised` in dark so inputs read as fields, and `brand` flips between near-white and near-black.

## Components

Shell classes (`fl-app`, `fl-rail`, `fl-topbar`, `fl-main`, `fl-aside`, `fl-dash`, `fl-panel`), Button and Field classes, and Custom Elements: Icon, StatusPill, StaleBadge, Kpi, WipLanes, ProjectCard, StageBars, FinishRate, ActivityFeed, ProjectTable, ThemeToggle, NextAction, HandoffBrief, ShipChecklist, ParkDialog. Screens: Overview and Resume. Light DOM; data enters via attributes, properties and `textContent`, never `innerHTML`. APIs and events are documented per component in the live spec.

## Open

- No logo yet; the rail shows a three-lane placeholder mark.
- Status colours are brighter than the chart validator's dark lightness band because they double as text colours; every chart mark is labelled in text, so identity never rests on colour.
- Fonts are self-hosted in `public/fonts` (OFL); no Google Fonts request.
