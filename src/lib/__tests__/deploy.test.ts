import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIST_HTML = resolve(process.cwd(), "dist/index.html");
const html = readFileSync(DIST_HTML, "utf8");

// Regressions caused by vite base unset (default "/"):
// built HTML referenced /assets/... which resolves to the SITE ROOT on
// GitHub Pages (/period-tracker/ lives at a subpath) → 404 → blank page.
describe("github pages deploy (dist artifact)", () => {
  it("built asset URLs are relative (./assets/...), never absolute (/assets/...)", () => {
    // Only local build assets — font preconnects + data: favicon are fine.
    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => u.includes("assets/"));

    expect(assetUrls.length).toBeGreaterThan(0);
    for (const url of assetUrls) {
      expect(
        url.startsWith("/"),
        `absolute asset URL breaks GH Pages subpath: ${url}`,
      ).toBe(false);
      expect(url.startsWith("./")).toBe(true);
    }
  });

  it("contains no root-anchored asset references at all", () => {
    expect(html).not.toMatch(/["']\/assets\//);
    expect(html).not.toMatch(/["']\/index\./);
  });

  it("vite base stays relative so future builds keep working", () => {
    const viteConfig = readFileSync(
      resolve(process.cwd(), "vite.config.ts"),
      "utf8",
    );
    expect(viteConfig).toMatch(/base:\s*['"]\.\/['"]/);
  });
});
