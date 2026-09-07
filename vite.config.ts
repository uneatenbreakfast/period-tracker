import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build counter — bumped by scripts/bump-version.sh (predev/prebuild hooks).
const appVersion = (() => {
  try {
    return parseInt(readFileSync(resolve(process.cwd(), 'VERSION'), 'utf8').trim(), 10) || 0
  } catch {
    return 0
  }
})()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: { port: 5174, allowedHosts: ['.ts.net'] },
  // Relative base → assets resolve under /period-tracker/ on GitHub Pages
  // (default "/" makes /assets/... point at site root → 404 → blank page).
  base: './',
})