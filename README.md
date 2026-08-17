# Bloom — period tracker

Pastel feminine period tracker. Web SPA first, React Native (Expo) after web is feature-complete.

- Stack: React 19 + Vite 6 + TypeScript + Tailwind CSS 4 (vitest for tests)
- Data: local-first, versioned blob snapshot in localStorage. Server sync (blob upload) comes later — never built per-record sync.
- Core cycle/prediction logic is pure TS in `src/lib/` (no DOM) so the RN app reuses it verbatim.

```bash
bun install
bun run dev     # dev server :5174
bun test        # vitest
bun run build   # tsc + vite build
```

Docs: `.scratch/PRD.md` (product decisions), `.scratch/issues.md` (issue tracker, local markdown).