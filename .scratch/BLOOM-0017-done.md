### BLOOM-0017 — Period selection styling differs on tinted (even) months
**Status**: Done.  
**Date**: 2026-08-26.

Drag-selection and committed period strips on even-month tinted blocks rendered gray (`bg-slate-100` from the month tint) instead of rose. Root cause: `bg-slate-100` was appended as a second background class after `bg-rose-400`, and Tailwind's stylesheet emission order let the tint win. Lone-day (`single`) shapes also lost their centered circle on tinted months (fell into the full-width month-block branch), and block-corner rounded classes appended over capsule caps.

**Fix** (BLOOM-0017): Extracted two pure helpers to `rangeStyle.ts` — `cellLayoutClass` (width/radius, shape-first so tint never overrides capsule/circle geometry) and `cellFillClass` (exactly ONE bg utility per cell, rose for all shaped periods). Suppressed `monthEdges` corner classes and scoop white overlays on shaped cells.

**Tests**: 10 new assertions covering both helpers — parity between tinted/untinted, lone-day circle, single-bg-per-cell, fertile/predicted preservation, and shape-wins-over-scoop. Full suite 192/192.
