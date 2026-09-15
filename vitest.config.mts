import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // No jsdom here, unlike pulse-astro. This plugin never builds a DOM node:
    // `injectHtmlTags` hands Docusaurus a plain object and Docusaurus does the
    // serialising, so the unit under test really is a plain object. The
    // serialiser itself is verified by a real `docusaurus build` — see
    // RELEASING.md, "Verified against a real build".
    include: ["src/**/*.test.ts"],
  },
})
