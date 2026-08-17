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
(none yet — first issue batch created with project kickoff)