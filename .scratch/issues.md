# Bloom issues

Local markdown tracker (no GitHub Issues). Prefix: `BLOOM-`.

## Open

### BLOOM-0001 — Sync: server blob endpoint
When sync feature is built: whole snapshot `serializeSnapshot()` uploads as blob; server stores opaque JSON; restore replaces local snapshot. Decide: endpoint shape, auth, conflict policy (last-write-wins probably, blob is atomic). Blocked on nothing; scheduled post-RN-planning. Not started.

### BLOOM-0002 — Settings: default cycle/period length
BLOOM-0002 core shipped as hardcoded Fitbit defaults (28-day cycle / 5-day period). Settings screen to let the user customize those defaults (Fitbit setup step) = future enhancement. Not started.

## Done

### BLOOM-0009 — Long-press gates drag range selection
Drag no longer anchors on immediate pointerdown — a fast flick/scroll can't start a bogus selection. Press-and-hold a day for `LONG_PRESS_MS` (400ms) without moving beyond `SLOP_PX` (10px) arms the selection; then dragging extends the live rose highlight and release commits (unchanged from BLOOM-0007/0008 semantics). Moving beyond slop before the timer fires aborts the gesture (scroll wins); a long-press tap (hold, release in place) commits nothing and still opens DaySheet. State machine in `src/lib/rangeDrag.ts` (`beginDrag` → arm timer → `armDrag` → `extendDrag` → `endDrag`), pure/no DOM. Completed 2026-08-19. Verified: 12 unit tests for the armed semantics (rapid drag before timer → not armed; hold → armed + extend; in-slop move still arms; release before timer → no commit; post-arm drag commits; backward/cross-month ranges unchanged) + calendar E2E updated (hold 600ms before drag, fast-drag rejection assert, long-press-tap still opens DaySheet) + card/trends E2E unchanged green + tsc + build green. Drag E2E pattern now requires the hold — see `references/drag-range-selection.md` § Long-press gate.

### BLOOM-0008 — Drag range replaces the month's period marking
Dragging a new range now clears any previously marked period days in the month(s) the range touches — the drag means "my period this month was exactly these days". Days keep their symptoms/notes; pure flow days (no symptoms/notes) are removed entirely; per-day flow levels inside the new range still win. Pure helper `replaceRangeFlow` (storage.ts), wired into App `commitRange`. Completed 2026-08-19. Verified: 80 unit tests (7 new for replaceRangeFlow: same-month clear, symptoms/notes preserved, other months untouched, cross-month clears both touched months, per-day flow preserved in-range, order-agnostic) + range E2E updated (backward 20→17 drag clears 10..13, touch drag 22..25 clears 17..20, storage counts 12→4→4) + tsc + build green.

### BLOOM-0007 — Drag to log a period range
Calendar: click a day, drag across days, release → the whole range is logged as the period (start day → end day). Live rose highlight while dragging; committed on mouseup with `DEFAULT_FLOW` ('medium') on days that have no flow yet — per-day flow levels already set are preserved. Single click (no drag) still opens DaySheet; the trailing click after a drag is swallowed. Pure helpers: `dateRange` (dates.ts), `setRangeFlow` (storage.ts). Completed 2026-08-19. Verified: 64 unit tests (3 dateRange + 3 setRangeFlow) + calendar E2E STEP 6 (live mid-drag highlight, no DaySheet on drag, committed range all rose + 5 persisted flow days, plain click still opens DaySheet) + card/trends E2E unchanged green; pixel-verified computed bg rgb(229,138,168) = palette rose on all range days.

### BLOOM-0003 — Today shortcut
Resolved 2026-08-18 by BLOOM-0005: scrollable calendar's "Today" pill scrolls back to the current month; no month-arrow nav remains to get lost in.

### BLOOM-0004 — Trends screen
CALENDAR/TRENDS tabs; Trends = stats grid (avg period length, avg estimated ovulation, avg cycle length) + MY CYCLES list with period/fertile/remainder bar, droplet + heart icons, chevron detail rows. Pure logic in `cycle.ts` (avgCycleLength rounds to nearest day; predicted entry shown for last cycle when < 2 completed cycles). Completed 2026-08-18. Verified: 53 unit tests + Playwright E2E (6 seeded cycles, bar geometry, tab switch, no JS errors). Design-fidelity QA 2026-08-18 (vs Fitbit ref `ref-mh.jpg` + Penpot board): bar segments (period = periodLen/cycleLen, fertile = ovulIdx−5…ovulIdx+2, heart at ovulIdx/len) match ref within ±2-3pt rendering noise; heart at 46.2% = ref crown at same fraction; ref omits bar on oldest row (Fitbit quirk) — app draws all 6, correct. No code changes needed.

### BLOOM-0005 — Scrollable calendar
Replaces single-month ‹ › nav with one vertically scrollable list of months: today ±12 months, extended back one month before the earliest logged entry. Sticky per-month header (month name + weekday row, "Today" badge on current month), day markers/tap unchanged, legend at bottom of card. Header "Today" pill scrolls back to current month; initial load auto-scrolls there. Pure helpers `addMonths`/`monthList` in `dates.ts`. Completed 2026-08-18. Verified: 56 unit tests (3 new for month helpers) + `scripts/bloom-calendar-e2e.cjs` (27 months, range extension, initial scroll, old-day tap → DaySheet, Today pill, no JS errors) + card/trends E2E unchanged green.

### BLOOM-0006 — Fitbit prediction model
Bloom prediction now follows Fitbit's officially documented model: `averageCycleLength` = recency-weighted mean (linear weights, Fitbit "relies on recent data"; exact weights proprietary) falling back to `DEFAULT_CYCLE_LENGTH` 28 when < 2 cycles; `averagePeriodLength` falls back to `DEFAULT_PERIOD_LENGTH` 5. Predictions + cycle ring + trends rows now work after ONE logged period (default 28 anchor); "Waiting for data" only when no period logged. Fertile window ov−5..ov+1 already matched. OPK override NOT built (needs OPK logging UI). Completed 2026-08-18. Verified: 56 unit tests (new: recency weighting ×2, single-cycle prediction/ring/trends, defaults) + card E2E (new: single-cycle prediction "In 21 days", default avg 28, fertile row, symptoms-only waiting state) + trends E2E; tsc clean. Copy updated: welcome "predictions start after your first logged period", waiting "log your period to start predictions", fertile placeholder "log your period to predict".