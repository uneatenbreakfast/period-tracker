# Bloom — PRD

## Product
Period tracker app ("Bloom"). Soft pastel feminine design approved.

## Decisions (confirmed 2026-08-17)
1. **Web SPA first** (React 19 + Vite + Tailwind 4). Mobile RN/Expo app only once web is mostly feature-complete.
2. **Local-first data**. App fully works offline; data lives in a versioned blob snapshot (`Snapshot`, v1) in localStorage.
3. **Sync = blob on server**. When sync arrives, the whole snapshot serializes (JSON) and uploads as one blob. No per-record server sync. Client owns serialization.
4. MVP scope accepted.
5. Pastel feminine palette: cream bg `#FFF7F4`, rose `#E58AA8`, lavender `#B9A7D9`/`#E4DCF3`, peach, sage accents, ink text `#57424E`, Nunito font.

## MVP scope (web)
- [x] Log period days + flow level (spotting/light/medium/heavy)
- [x] Calendar drag: click + drag across days logs the whole period range (start → end)
- [x] Log symptoms per day (cramps, headache, bloating, fatigue, mood swings, tender breasts, acne, backache, nausea, cravings) + free-text note
- [x] Month calendar: period days (rose), predicted period (dashed outline), fertile window (lavender tint), today ring
- [x] Predictions: next period start, fertile window, ovulation day, average cycle length
- [x] Cycle history: start dates + lengths
- [x] Trends view: avg period/ovulation/cycle stats + per-cycle bars (CALENDAR/HEALTH/TRENDS tabs; calendar tab shows only the calendar, menstrual health + cycle history cards live on the Health tab)
- [x] Persistence: localStorage snapshot, survives reload
- [x] Settings (period length, cycle length inputs) — post-MVP
- [ ] Server sync (blob) — post-MVP, after RN

## Out of scope (later)
- Server + auth (blob endpoint design TBD when sync lands)
- RN/Expo app (reuse `src/lib/*` pure logic + snapshot shape)
- Reminders/notifications, export/import

## Prediction model
- Cycle = run of period days; gap > 3 days starts a new cycle; cycle length = start-to-start days
- Next period = last cycle start + average cycle length
- Ovulation = next period start − 14; fertile window = ovulation − 5 … ovulation + 1 (calendar method)
- First cycle logged → history only; predictions need ≥ 2 cycles