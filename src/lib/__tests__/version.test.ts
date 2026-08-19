import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const VERSION_PATH = resolve(process.cwd(), 'VERSION')
const readVersion = () => Number(readFileSync(VERSION_PATH, 'utf8').trim())

describe('versioning system', () => {
  it('VERSION file holds a positive integer', () => {
    const v = readVersion()
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThan(0)
  })

  it('bump-version.sh auto-increments VERSION', () => {
    const before = readVersion()
    execFileSync('bash', [resolve(process.cwd(), 'scripts/bump-version.sh')], {
      cwd: process.cwd(),
    })
    try {
      expect(readVersion()).toBe(before + 1)
    } finally {
      // restore — tests must not leave the repo dirty
      writeFileSync(VERSION_PATH, `${before}\n`)
    }
  })

  it('predev and prebuild hooks trigger the bump', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.scripts.predev).toBe('bash scripts/bump-version.sh')
    expect(pkg.scripts.prebuild).toBe('bash scripts/bump-version.sh')
    // hook must actually exist as a file
    readFileSync(resolve(process.cwd(), 'scripts/bump-version.sh'))
  })
})