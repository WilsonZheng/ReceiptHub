# Product

## Register

product

## Users

A solo owner-operator in New Zealand managing their own books — this is a self-use tool, not a multi-tenant product. They work in two distinct spaces: **company** (GST-registered, reconciliation matters) and **personal** (no GST). They are bilingual (中文 / English) and switch freely.

Two usage contexts, both first-class:

- **Field capture (primary, mobile):** standing at a counter or in the car, one-handed on an iPhone (installed as a PWA). Snap or upload a receipt, let AI fill the fields, move on. Speed and low friction win here.
- **Desk review & filing (periodic, desktop):** sitting down to check entries, fix categories, and export. Correctness and legibility win here.

## Product Purpose

Capture invoices and receipts (camera / photo library / PDF / drag-drop / paste), have **Gemini AI extract** the merchant, date, amount, income-vs-expense, category, line items, and notes, then store everything **local-first** (IndexedDB, offline-capable, zero-latency search) and sync to a **private GitHub repo** as the backend.

It computes **New Zealand GST** automatically (GST-inclusive price × 3/23, to the cent, manual override allowed), reconciles **output GST − input GST** into the net amount owed to IRD, and exports **CSV** (with line items) for filing.

Success: the owner trusts that every dollar and every GST cent is captured correctly across devices and never silently lost; capturing a receipt takes seconds; and tax time is a clean export rather than a reconstruction. It runs at **$0/month with no backend** and must keep working offline.

## Brand Personality

**Calm financial trust** — steady, legible, accountant-grade. Three words: *trustworthy, clear, composed.*

- **Voice:** plain and precise, bilingual with full parity (no second-class language). It states what happened and what a number means; it never hypes. Button labels say what will happen ("导出 CSV" / "Export CSV"), not "OK".
- **Emotional goal:** confidence and calm. The opposite of tax-time dread. The user should feel the numbers are correct and the tool is quietly competent.
- **Restraint as trust:** a financial tool earns trust by being unhurried and uncluttered, not by being flashy. Delight lives in moments (a clean capture, a satisfying reconcile), never in decoration.

> Note on the current visual direction: `src/theme/tokens.css` implements a dark "Midnight Ledger" / Linear-Vercel aesthetic (near-black, aurora-green accent, hairline borders) plus an iOS-grouped light mode. That aesthetic is one valid expression of "calm financial trust" — but the personality is the trust and legibility, not the dark-tech look itself. Visual specifics live in DESIGN.md.

## Anti-references

This must NOT look or feel like any of these (the user rejected all four explicitly):

- **Enterprise accounting bloat** — Xero / MYOB / QuickBooks density: toolbars everywhere, intimidating multi-column forms, chrome that buries the task.
- **Playful consumer fintech** — gradients, mascots, confetti, gamified streaks, big rounded candy blobs. Too cute for something that touches tax.
- **Generic admin template** — Material / Bootstrap dashboard with no point of view: identical card grids, default component kit, hero-metric tiles.
- **Skeuomorphic receipt kitsch** — faux thermal-paper texture, torn paper edges, dot-matrix or "register tape" fonts.

## Design Principles

1. **Correctness is the product.** "Trust the numbers" is the #1 outcome. Make the math visible and checkable (show the GST derivation, allow override, never hide a discrepancy), and never silently lose or double-count an entry. This is a strategic stance, not just a UI nicety — it's why soft-delete tombstones and transparent GST exist.
2. **Calm over dense.** Reject enterprise-bloat reflexes. One clear task per screen, generous breathing room, hairline structure over heavy chrome. Density only where the user genuinely needs it (lists, export).
3. **Capture-first, reconcile-later.** Honor both modes: a fast, one-handed, AI-assisted capture path on mobile, and a deliberate, legible review-and-export path on desktop. Neither compromises the other.
4. **Earned familiarity, never novelty.** A financial tool should not surprise. Use standard, trustworthy affordances executed precisely; avoid both off-the-shelf genericness and gimmicks. The tool disappears into the task.
5. **Bilingual & local-first by construction.** Full 中/英 parity (compile-time enforced), NZ conventions baked in (GST, NZ timezone, IRD export), offline-first and data-integrity-safe across languages and devices.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**, pragmatically applied:

- Body text ≥ 4.5:1 contrast; large/bold text ≥ 3:1. Watch the dark-mode muted gray (`#888`) and aurora green on near-black — verify, don't assume.
- Every animation has a `prefers-reduced-motion: reduce` alternative (crossfade or instant).
- Input fields ≥ 16px to prevent iOS focus-zoom (already a hard rule in CLAUDE.md).
- Income vs. expense must be distinguishable **without color alone** — the existing `+` / `−` sign prefix carries the meaning for color-blind users; keep it.
- Keyboard-reachable interactive elements with visible focus states.
- `html lang` follows the active language so screen readers and native controls localize correctly.
