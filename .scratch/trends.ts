// @ts-nocheck
import { cycleTrends, type DayEntry } from '../src/lib/cycle.ts';

const cycles = [
  { start: '2026-03-15', days: 6 },
  { start: '2026-04-10', days: 5 },
  { start: '2026-05-05', days: 6 },
  { start: '2026-05-31', days: 5 },
  { start: '2026-06-23', days: 5 },
  { start: '2026-07-21', days: 5 },
];
const entries: DayEntry[] = [];
for (const c of cycles) {
  for (let i = 0; i < c.days; i++) entries.push({ date: isoAdd(c.start, i), flow: 'heavy' });
}
function isoAdd(d: string, n: number) {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const t: any = cycleTrends(entries as any, '2026-08-18');
for (const r of t.rows) {
  console.log(r.label, '| period', r.periodLength, '| ovul', r.ovulationDay, '| len', r.cycleLength,
    '| periodFrac', r.periodFrac?.toFixed(3), 'fertStart', r.fertileStartFrac?.toFixed(3), 'fertEnd', r.fertileEndFrac?.toFixed(3));
}