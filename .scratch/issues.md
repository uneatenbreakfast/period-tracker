# Bloom issues

Local markdown tracker (no GitHub Issues). Prefix: `BLOOM-`.

## Open

### BLOOM-0001 — Sync: server blob endpoint
When sync feature is built: whole snapshot `serializeSnapshot()` uploads as blob; server stores opaque JSON; restore replaces local snapshot. Decide: endpoint shape, auth, conflict policy (last-write-wins probably, blob is atomic). Blocked on nothing; scheduled post-RN-planning. Not started.

### BLOOM-0002 — Settings: default cycle/period length
Allow user to set expected cycle length (default 28) used when < 2 logged cycles. Currently predictions need 2+ cycles. Not started.

## Done

### BLOOM-0003 — Today shortcut
Resolved 2026-08-18 by BLOOM-0005: scrollable calendar's "Today" pill scrolls back to the current month; no month-arrow nav remains to get lost in.

### BLOOM-0004 — Trends screen
CALENDAR/TRENDS tabs; Trends = stats grid (avg period length, avg estimated ovulation, avg cycle length) + MY CYCLES list with period/fertile/remainder bar, droplet + heart icons, chevron detail rows. Pure logic in `cycle.ts` (avgCycleLength rounds to nearest day; predicted entry shown for last cycle when < 2 completed cycles). Completed 2026-08-18. Verified: 53 unit tests + Playwright E2E (6 seeded cycles, bar geometry, tab switch, no JS errors). Design-fidelity QA 2026-08-18 (vs Fitbit ref `ref-mh.jpg` + Penpot board): bar segments (period = periodLen/cycleLen, fertile = ovulIdx−5…ovulIdx+2, heart at ovulIdx/len) match ref within ±2-3pt rendering noise; heart at 46.2% = ref crown at same fraction; ref omits bar on oldest row (Fitbit quirk) — app draws all 6, correct. No code changes needed.

### BLOOM-0005 — Scrollable calendar
Replaces single-month ‹ › nav with one vertically scrollable list of months: today ±12 months, extended back one month before the earliest logged entry. Sticky per-month header (month name + weekday row, "Today" badge on current month), day markers/tap unchanged, legend at bottom of card. Header "Today" pill scrolls back to current month; initial load auto-scrolls there. Pure helpers `addMonths`/`monthList` in `dates.ts`. Completed 2026-08-18. Verified: 56 unit tests (3 new for month helpers) + `scripts/bloom-calendar-e2e.cjs` (27 months, range extension, initial scroll, old-day tap → DaySheet, Today pill, no JS errors) + card/trends E2E unchanged green.