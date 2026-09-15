#!/usr/bin/env node
// Build a real Docusaurus site against a packed copy of this plugin and read
// the tag back out of the emitted HTML.
//
// Why this exists: the unit tests assert the OBJECTS handed to Docusaurus, and
// the serialiser that turns them into HTML lives in `@docusaurus/core`. A test
// that reimplements that serialiser proves our expectation of their behaviour,
// not their behaviour — so the only check that can fail when Docusaurus changes
// is one that runs Docusaurus. Compatibility is measured, not asserted.
//
//   node scripts/verify-build.mjs 3.10.2 [3.0.1 ...]
//
// Exits non-zero on the first version whose build does not carry the tag.

import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const HERE = resolve(import.meta.dirname, "..")
const VERSIONS = process.argv.slice(2)
if (VERSIONS.length === 0) {
  console.error("usage: node scripts/verify-build.mjs <docusaurus-version> [...]")
  process.exit(2)
}

const run = (cmd, args, cwd, env = {}) =>
  execFileSync(cmd, args, { cwd, stdio: "pipe", encoding: "utf8", env: { ...process.env, ...env } })

// Pack once. `prepack` rebuilds lib/, which is gitignored — so this also proves
// a fresh clone produces a publishable tarball.
console.log("packing the plugin…")
const packOut = run("npm", ["pack", "--json", "--silent"], HERE)
const tarball = join(HERE, JSON.parse(packOut)[0].filename)
console.log(`  ${tarball}`)

// 🔴 Assert against the SHIPPED bytes, not the bytes we emit.
//
// The plugin hands Docusaurus `{defer: true}` and `@docusaurus/core`'s own
// serialiser writes a bare `defer`. Docusaurus then pipes the whole page
// through an HTML minifier (`@swc/html` by default since 3.10), which parses
// and RE-SERIALISES it, turning every boolean attribute into its canonical
// `name="name"` form — `defer="defer"`. It does this to Docusaurus's own
// `/assets/js/main.*` tags too, so it is the minifier and not us, and the two
// forms are identical in HTML5 where any value means true.
//
// The first version of this script asserted the pre-minification form and
// reported four failures against a plugin that was entirely correct. Asserting
// against the artefact you emit rather than the artefact that ships is the same
// mistake as diffing against a spec rather than against a file the store has
// already accepted.
const SCRIPT_RE = "https://js\\.ciphera\\.net/script";
const DEFER = (suffix, attrs) =>
  new RegExp(
    `<script defer(?:="defer")?${attrs ? ` ${attrs}` : ""} src="${SCRIPT_RE}${suffix}\\.js"></script>`,
  );

/** Docusaurus < 3.10 cannot be freshly installed and built today without
 *  pinning webpack — see the comment on `overrides` below. */
function needsWebpackPin(version) {
  const [major, minor] = version.split(".").map(Number)
  return major === 3 && minor < 10
}

const CASES = [
  {
    name: "domain from `url`",
    options: "{}",
    expect: [DEFER("", 'data-domain="example\\.com"')],
    reject: [/script\.interactions\.js/, /data-api/],
  },
  {
    name: "explicit domain + api + companion",
    options: `{ domain: 'chosen.dev', api: 'https://proxy.example.com/', companion: true }`,
    expect: [
      DEFER("", 'data-domain="chosen\\.dev" data-api="https://proxy\\.example\\.com"'),
      DEFER(".interactions", ""),
    ],
    reject: [/data-domain="example\.com"/],
  },
]

let failures = 0

for (const version of VERSIONS) {
  const root = mkdtempSync(join(tmpdir(), `pulse-docusaurus-${version}-`))
  console.log(`\n=== Docusaurus ${version} — ${root}`)
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: "pulse-docusaurus-fixture",
          private: true,
          dependencies: {
            "@docusaurus/core": version,
            "@docusaurus/preset-classic": version,
            "@ciphera-net/pulse-docusaurus": `file:${tarball}`,
            // React 18 satisfies every Docusaurus 3.x peer range (3.10.2 accepts
            // ^18 || ^19, 3.0.x accepts ^18 only), so one fixture spans the range.
            react: "^18.0.0",
            "react-dom": "^18.0.0",
          },
          // ⚠️ A FIXTURE fix, not a plugin fix, and it is load-bearing for an
          // honest result. Docusaurus before 3.10 declares `webpack: ^5.88.1`
          // and ships `webpackbar@6.0.1`; npm resolves webpack 5.111+, whose
          // tightened ProgressPlugin schema rejects the options webpackbar
          // passes, and the build dies before any plugin runs. Proven to be
          // unrelated to us by building the same version with NO Pulse plugin
          // at all — it failed identically — and by this pin making that
          // control build pass. Without the pin the run reports failures
          // against a plugin that is entirely correct.
          ...(needsWebpackPin(version) ? { overrides: { webpack: "5.97.1" } } : {}),
        },
        null,
        2,
      ),
    )
    mkdirSync(join(root, "src", "pages"), { recursive: true })
    writeFileSync(
      join(root, "src", "pages", "index.js"),
      `import React from 'react';\nexport default function Home(){return React.createElement('main',null,'fixture');}\n`,
    )

    console.log("  installing…")
    run("npm", ["install", "--silent", "--no-audit", "--no-fund"], root)

    for (const testCase of CASES) {
      writeFileSync(
        join(root, "docusaurus.config.js"),
        `module.exports = {
  title: 'fixture',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'ignore',
  presets: [['classic', { docs: false, blog: false, theme: {} }]],
  plugins: [['@ciphera-net/pulse-docusaurus', ${testCase.options}]],
};\n`,
      )
      rmSync(join(root, "build"), { recursive: true, force: true })
      rmSync(join(root, ".docusaurus"), { recursive: true, force: true })
      console.log(`  building: ${testCase.name}`)
      run("npx", ["docusaurus", "build"], root)
      const html = readFileSync(join(root, "build", "index.html"), "utf8")

      for (const re of testCase.expect) {
        if (re.test(html)) {
          console.log(`    ✅ ${re}`)
        } else {
          console.log(`    ❌ MISSING ${re}`)
          failures++
        }
      }
      for (const re of testCase.reject) {
        if (re.test(html)) {
          console.log(`    ❌ UNEXPECTEDLY PRESENT ${re}`)
          failures++
        } else {
          console.log(`    ✅ absent: ${re}`)
        }
      }
    }
  } catch (err) {
    console.log(`  ❌ ${version} failed: ${err.stderr?.toString().slice(-2000) ?? err.message}`)
    failures++
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

rmSync(tarball, { force: true })
console.log(failures === 0 ? "\nALL VERIFIED" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
