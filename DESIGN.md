---
name: ReceiptHub
description: A calm, accountant-grade receipt manager — dark Midnight Ledger by default, iOS-grouped light by choice.
colors:
  void-black: "#050505"
  surface: "#0c0c0c"
  surface-raised: "#161616"
  hairline: "#ffffff1a"
  ink: "#ffffff"
  ink-muted: "#888888"
  aurora-green: "#00ff66"
  accent-ink: "#000000"
  danger-rose: "#ff4d6d"
typography:
  title:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontWeight: 700
    fontSize: "1.5rem"
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "0.8125rem"
    lineHeight: 1.3
    letterSpacing: "normal"
  numeric:
    fontFamily: "ui-monospace, 'SF Mono', monospace"
    fontWeight: 600
    fontSize: "1rem"
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  chip: "9999px"
  field: "10px"
  secondary: "10px"
  button: "12px"
  card: "12px"
  nav: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.aurora-green}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.secondary}"
    padding: "8px 14px"
    typography: "{typography.label}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.aurora-green}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
  segmented-active:
    backgroundColor: "{colors.aurora-green}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
  segmented-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.button}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "4px 10px"
---

# Design System: ReceiptHub

## 1. Overview

**Creative North Star: "Midnight Ledger"**

A bookkeeper's ledger rendered for the dark: aurora-green figures ruled onto near-black, divided by hairlines rather than boxed in chrome. The system's job is to make a financial record feel *correct* — exact, legible, unhurried — and to disappear into the task of capturing and reconciling receipts. Restraint is the trust mechanism here: a tool that touches tax earns confidence by being quiet and precise, not by being decorated.

The default surface is near-pure black (`#050505`) with a single living color — aurora green (`#00ff66`) — reserved for what is *active*, *primary*, or *positive*. Figures are set in monospace so columns of money align and read like a statement. Structure comes from 1px hairlines, not shadows; the interface is flat at rest and only glows in one place (the primary action). A second, equally first-class skin — iOS grouped-list light mode with a mint accent — exists for daylight and desktop review; the two themes share one token contract so the system re-skins without redesign.

This explicitly rejects: **enterprise accounting bloat** (Xero/MYOB toolbar density), **playful consumer fintech** (gradients, mascots, confetti), **generic admin templates** (Material/Bootstrap card grids), and **skeuomorphic receipt kitsch** (faux thermal paper, torn edges, register-tape fonts).

**Key Characteristics:**
- Near-black canvas, one aurora-green accent used sparingly and meaningfully
- Monospace for every figure; system sans for everything else
- Flat by default — hairline borders carry all structure, shadows do not
- Exactly one glow (the primary CTA) and one glass surface (the nav)
- Calm density: one task per screen, breathing room over chrome
- Two co-equal themes (dark Midnight Ledger / light iOS-grouped) on one token contract

## 2. Colors

A monochrome near-black field with a single saturated voice and one alarm color. The palette is **Restrained** — one accent doing real semantic work, never decoration.

### Primary
- **Aurora Green** (`#00ff66` dark / `#0f9d6a` light): the one living color. Reserved for primary actions, the active/selected state of any control, positive amounts (income), and the brand period in the wordmark. It is never used to decorate. On dark it is pure neon; on light it deepens to a mint that holds 4.5:1 on white.

### Tertiary (semantic alarm)
- **Danger Rose** (`#ff4d6d` dark / `#d64545` light): expenses, overspend deltas, destructive actions, and validation errors. The deliberate counterweight to aurora green — the two together encode the system's core duality (money in vs. money out).

### Neutral
- **Void Black** (`#050505`): the page canvas. Near-pure black, not charcoal — the ledger is meant to recede entirely.
- **Surface** (`#0c0c0c`): cards, fields, list rows. One step off the void.
- **Surface Raised** (`#161616`): secondary buttons, chips, nested fills — the only "lifted" tone, achieved tonally, never with shadow.
- **Ink** (`#ffffff`): primary text and figures.
- **Ink Muted** (`#888888`): labels, captions, inactive controls, placeholders. Verify it clears 4.5:1 on `#050505` before using it for anything a user must read.
- **Hairline** (`#ffffff1a`, white at 10%): every border and divider. This is the structural workhorse of the whole system.

> Light mode re-binds the same roles: bg `#f2f2f7` (iOS systemGroupedBackground), surface `#ffffff`, surface-raised `#e9e9ee`, ink `#1c1c1e`, ink-muted `#8a8a8e`, hairline `#e4e4e9`, accent-ink `#ffffff`.

### Named Rules
**The Single Voice Rule.** Aurora green appears on a small fraction of any screen and only with meaning: primary action, active selection, or a positive figure. The moment it decorates something neutral, it stops reading as "this matters."

**The Green-In / Red-Out Rule.** Income and positive net are aurora green; expense and negative deltas are danger rose. Color reinforces the `+` / `−` sign prefix — it never replaces it (color-blind users read the sign).

## 3. Typography

**Display / Body Font:** `-apple-system, system-ui, sans-serif` (the native system sans on every platform)
**Numeric Font:** `ui-monospace, 'SF Mono', monospace`

**Character:** One system sans carries headings, labels, body, and buttons — there is no display/body pairing, because a financial tool wants familiarity, not flourish. The one deliberate split is monospace for figures, so money aligns into columns and reads like a statement.

### Hierarchy
- **Title** (700, 1.5rem, line-height 1.2): screen titles and section headers. Hierarchy comes from weight + size, never from an all-caps tracked eyebrow.
- **Body** (400, 1rem, line-height 1.5): the 16px floor is mandatory — see the rule below. Prose caps at 65–75ch.
- **Label** (600, ~0.8125rem): control labels, tab text, chips, captions.
- **Numeric** (600, mono, tabular): every monetary amount and GST figure. Often tinted aurora-green (positive) or danger-rose (negative).

### Named Rules
**The 16px Floor Rule.** No input font-size below 16px, ever. iOS Safari force-zooms the page when focusing a sub-16px field and never zooms back. `.field` is locked at 1rem.

**The Figures-in-Mono Rule.** Money is always set in `--font-numeric`. A dollar amount in the body sans is a bug — columns won't align and the statement loses its ledger feel.

## 4. Elevation

The system is **flat by default**. Depth is conveyed by tonal layering (void → surface → surface-raised) and 1px hairline borders, not by shadows. There is no ambient/resting shadow vocabulary at all — adding a drop shadow to a card is off-system.

Two — and only two — deliberate exceptions exist, both functional:

### The "Lit" Vocabulary (exceptions only)
- **CTA Glow** (`box-shadow: 0 0 28px color-mix(in srgb, var(--color-accent) 28%, transparent)`): the single neon halo, applied only to the enabled primary action button. Removed entirely when the button is disabled.
- **Nav Glass** (`backdrop-filter: blur(20px) saturate(1.4)` over a 72%-opacity bg): the top navigation dock only. Per CLAUDE.md, `backdrop-filter` is confined to purely visual shells and never placed on a container that hosts absolute/fixed popups.

### Named Rules
**The Hairline Rule.** Structure is drawn with 1px borders at `#ffffff1a` (dark) / `#e4e4e9` (light), not with shadows. If a surface needs to feel separated, it gets a hairline or a tonal step — never a shadow.

**The Single Glow Rule.** Exactly one element glows (the primary CTA) and exactly one frosts (the nav). Any third glow or blur is a regression.

## 5. Components

### Buttons
- **Shape:** gently rounded (12px, `rounded-xl`). All buttons share an `:active { transform: scale(0.96) }` press response on iOS easing `cubic-bezier(.32,.72,0,1)`.
- **Primary:** aurora-green fill (`#00ff66`), black ink, bold, full-width, ~12px vertical padding, carries the CTA glow. Disabled → 40% opacity, glow removed.
- **Secondary:** surface-raised fill (`#161616`), ink text, 10px radius, 600 weight. Used for all secondary actions — never a bare text-link, which reads as unfinished on mobile.
- **Outline:** transparent fill, aurora-green text, 1.5px aurora-green border. The "alternate primary" (e.g. a second capture path).
- **Disabled:** 40% opacity, no glow, no press scale.

### Segmented controls / filters
- A pill row where the **active** segment takes aurora-green fill + black ink and **inactive** segments are transparent + ink-muted. This is the *same* active-state signal used by the nav and the month picker — selection looks identical everywhere.

### Chips
- **Style:** full-radius pills. Filled chips use surface-raised; the "add new" chip is a dashed ink-muted outline that becomes an inline input (surface-raised fill, 1.5px aurora-green border) on tap. Enter/blur commits, Esc cancels.

### Cards / Containers
- **Corner Style:** 12px (`--radius-card`).
- **Background:** surface (`#0c0c0c`) on void.
- **Border:** 1px hairline. **Shadow Strategy:** none — see Elevation.
- **Internal Padding:** 16px. Nested cards are forbidden.

### Inputs / Fields (`.field`)
- **Style:** surface fill, 1px hairline border, 10px radius, **16px font (hard floor)**.
- **Focus:** border shifts toward aurora-green; no heavy glow.
- **Date input:** never the native `<input type="date">` (its locale follows iOS, not the page). Use the custom `DateField` bottom-sheet calendar.

### Navigation (glass dock)
- **Top-anchored, always.** A frosted pill bar (glass blur) holding the three high-frequency tabs (Capture / Receipts / Stats) inline, with low-frequency items (Export / Settings) in a `⋯` context menu that pops on iOS-spring easing.
- Active tab = aurora-green fill + black ink; inactive = ink-muted. The blur lives on a no-filter outer wrapper so the popup menu escapes the stacking context.
- **Why top, not bottom:** iOS standalone PWAs mis-measure the bottom viewport; critical UI is never anchored to the bottom edge (the most expensive lesson in CLAUDE.md).

### Signature Component — the Amount
- A monetary figure is the system's hero: monospace, sign-prefixed (`+` / `−`), and tinted aurora-green (positive) or danger-rose (negative). The GST line shows its derivation (`× 3/23`) rather than just a result, so the math is always checkable.

## 6. Do's and Don'ts

### Do:
- **Do** keep aurora green rare and meaningful — primary action, active state, positive figures only (The Single Voice Rule).
- **Do** set every monetary figure in `--font-numeric` (mono), sign-prefixed and color-tinted by direction.
- **Do** build structure from 1px hairlines and tonal steps; stay flat (The Hairline Rule).
- **Do** keep all input font-sizes ≥ 16px (The 16px Floor Rule).
- **Do** anchor navigation at the top and let only scrollable content touch the bottom edge.
- **Do** reinforce income/expense with the `+` / `−` sign, not color alone.
- **Do** give every interactive element the `scale(0.96)` press response on the shared iOS easing, with a `prefers-reduced-motion` fallback.

### Don't:
- **Don't** look like **enterprise accounting bloat** (Xero / MYOB / QuickBooks): no toolbar-everywhere chrome, no intimidating multi-column forms.
- **Don't** look like **playful consumer fintech**: no gradients, mascots, confetti, gamified streaks, or candy blobs.
- **Don't** look like a **generic admin template**: no Material/Bootstrap card grids, no hero-metric tiles, no default component kit with no point of view.
- **Don't** look like **skeuomorphic receipt kitsch**: no faux thermal-paper texture, torn edges, or dot-matrix/register-tape fonts.
- **Don't** add a second glow or a second glass surface (The Single Glow Rule).
- **Don't** use drop shadows for elevation — that's off-system.
- **Don't** use `background-clip: text` gradient text, or `border-left/right` > 1px colored side-stripes.
- **Don't** use the native `<input type="date">` (locale ignores page language); use the custom `DateField`.
- **Don't** let aurora green decorate neutral content; the moment it's everywhere it means nothing.
