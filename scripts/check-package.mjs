#!/usr/bin/env node
// Packaging guards, in a committed script rather than inline in `.woodpecker/`.
//
// 🔴 Why a file and not `node -e "…"` in the pipeline: the first version of these
// checks lived inline, and a regex in it died on the way through three layers of
// quoting — YAML block scalar → `sh` double quotes → `node -e` — which ate the
// backslash in `\/` and left node an unterminated group. It passed when I ran it
// locally through a heredoc, because the heredoc quoted differently from CI.
//
// A guard whose local run and CI run are not the same bytes is not a guard. This
// file is the same bytes in both, and it carries no shell-fragile characters at
// all: the path checks below are deliberately plain string comparisons rather
// than a regex, so there is nothing left to escape.
//
//   node scripts/check-package.mjs
//
// Exits non-zero, loudly, on the first violation.

import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("../package.json")

const failures = []
const ok = (msg) => console.log(`  ok  ${msg}`)
const fail = (msg) => {
  console.log(`  FAIL ${msg}`)
  failures.push(msg)
}

// ── The published package must stay dependency-free ─────────────────────────
// A runtime dependency here lands in every consumer's site, and this package
// exists to add under 3 KB to a page.
const depCount = Object.keys(pkg.dependencies ?? {}).length
if (depCount === 0) ok("zero runtime dependencies")
else fail(`expected zero runtime dependencies, found ${depCount}: ${Object.keys(pkg.dependencies).join(", ")}`)

// ── The entrypoint must stay CommonJS with a callable default export ─────────
// Every official Docusaurus plugin ships that shape, and it is the shape
// Docusaurus's loader is proven to accept from both an ESM and a CJS
// `docusaurus.config.js`. Flipping tsconfig's `module` to ESNext, or adding
// `"type": "module"` here, would still typecheck, still test green, still build
// — and break every consumer's site build. Nothing else can see that.
if (pkg.type === "module") {
  fail('package.json declares "type": "module" — Docusaurus plugins ship CommonJS')
} else {
  ok('no "type": "module"')
  const entry = require("../lib/index.js")
  if (typeof entry.default === "function") ok("lib/index.js default export is a function")
  else fail("lib/index.js has no callable default export")
  if (entry.__esModule === true) ok("lib/index.js carries the __esModule interop marker")
  else fail("lib/index.js is missing the __esModule interop marker")
}

// ── The tarball must be exactly LICENSE, README, lib/ and package.json ───────
// `lib/` is gitignored, so only `prepack` puts it there. A packaging regression
// ships an empty package that installs and silently does nothing, which no test
// in this repo would otherwise notice.
const ALLOWED_EXACT = new Set(["README.md", "LICENSE", "package.json"])
const ALLOWED_PREFIX = "lib/"

const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }))
const files = packed[0].files.map((f) => f.path).sort()
console.log(`  tarball: ${files.join(" ")}`)

const unexpected = files.filter((f) => !ALLOWED_EXACT.has(f) && !f.startsWith(ALLOWED_PREFIX))
if (unexpected.length === 0) ok("tarball contains nothing unexpected")
else fail(`unexpected files in the tarball: ${unexpected.join(" ")}`)

if (files.includes("lib/index.js")) ok("tarball contains lib/index.js")
else fail("tarball has no lib/index.js — prepack did not run")

// ── Done ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\nREFUSING: ${failures.length} packaging check(s) failed`)
  process.exit(1)
}
console.log("\nall packaging checks passed")
