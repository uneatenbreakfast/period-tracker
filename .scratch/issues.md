# Bloom issues

Local markdown tracker (no GitHub Issues). Prefix: `BLOOM-`.

## Open

### BLOOM-0001 — Sync: server blob endpoint
When sync feature is built: whole snapshot `serializeSnapshot()` uploads as blob; server stores opaque JSON; restore replaces local snapshot. Decide: endpoint shape, auth, conflict policy (last-write-wins probably, blob is atomic). Blocked on nothing; scheduled post-RN-planning. Not started.

### BLOOM-0002 — Settings: default cycle/period length
Allow user to set expected cycle length (default 28) used when < 2 logged cycles. Currently predictions need 2+ cycles. Not started.

### BLOOM-0003 — Today shortcut
Header month nav lacks "Today" jump when browsing other months (E2E had to click ‹ 6× to reach January). Not started.

## Done

### BLOOM-0004 — Trends screen
CALENDAR/TRENDS tabs; Trends = stats grid (avg period length, avg estimated ovulation, avg cycle length) + MY CYCLES list with period/fertile/remainder bar, droplet + heart icons, chevron detail rows. Pure logic in `cycle.ts` (avgCycleLength rounds to nearest day; predicted entry shown for last cycle when < 2 completed cycles). Completed 2026-08-18. Verified: 53 unit tests + Playwright E2E (6 seeded cycles, bar geometry, tab switch, no JS errors).