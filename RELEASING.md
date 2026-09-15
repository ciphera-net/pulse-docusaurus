# Releasing @ciphera-net/pulse-docusaurus

Two things are separate here and worth keeping separate in your head:

1. **The package.** npm-only and ungated — no account beyond npm, no review, no
   fee. Publishing makes the plugin installable. Nothing gates this.
2. **The listing.** Docusaurus has *two* directories, and they are not the same
   kind of thing. See "Listings" below.

## Verified against a real build

`peerDependencies` claims what has been measured. The check is
`node scripts/verify-build.mjs <version> [...]`, which packs the plugin, builds a
real Docusaurus site against each version and reads the tag back out of
`build/index.html`.

Measured 15-09-2026, Node 24.13.0, 30 assertions, all passing:

| Docusaurus | fixture builds | tag in emitted HTML |
|---|---|---|
| 3.10.2 (latest) | ok | yes — domain, `data-api`, companion, and the two absence checks |
| 3.7.0 | ok¹ | yes |
| 3.4.0 | ok¹ | yes |
| 3.1.1 | ok¹ | yes |
| 3.0.1 (earliest 3.x) | ok¹ | yes |

So `peerDependencies` claims **`^3.0.0`** — the whole 3.x line, measured end to
end. It does **not** claim `^4.0.0`: Docusaurus 4 exists only as a `canary` tag,
and a compatibility claim against an unreleased version is exactly the kind of
assumption this table exists to replace. Widen it when 4.0.0 ships, by running
this script against it.

¹ 🔴 **Docusaurus before 3.10 cannot be freshly installed and built today**
without pinning webpack, and this has nothing to do with this plugin. Those
versions declare `webpack: ^5.88.1` and ship `webpackbar@6.0.1`; npm resolves
webpack 5.111+, whose tightened `ProgressPlugin` schema rejects the options
webpackbar passes, and the build dies before any plugin runs
(`Invalid options object. Progress Plugin … must NOT have additional
properties`). **Proven to be unrelated to us**: the same version built with *no
Pulse plugin at all* failed identically, and pinning `webpack: 5.97.1` made that
control build pass. `verify-build.mjs` applies the pin automatically below 3.10.
Without it the run reports failures against a plugin that is entirely correct —
which is worth remembering the next time a fixture reddens: **prove the failure
is yours with a control before you go looking in your own code.**

🔴 **Assert against the SHIPPED bytes.** The plugin hands Docusaurus
`{defer: true}` and `@docusaurus/core`'s serialiser writes a bare `defer` — but
Docusaurus then pipes the page through an HTML minifier (`@swc/html` by default
since 3.10) which parses and re-serialises it, so what actually ships is
`defer="defer"`. It does the same to Docusaurus's own `/assets/js/main.*` tags,
and the two forms are identical in HTML5 where any value means true.

The first version of `verify-build.mjs` asserted the pre-minification form and
reported four failures against a plugin that was completely correct. Build with
`SKIP_HTML_MINIFICATION=true` to see the unminified form. **The artefact you
assert against must be the one that ships, not the one your code emits** — the
same mistake, in a different costume, as diffing against a spec instead of
against a file the store has already accepted.

⚠️ The unit tests in `src/pulse.test.ts` contain a transcription of Docusaurus's
serialiser so that attribute order and boolean-vs-string attributes are visible.
That is a copy of their algorithm and proves our expectation of it, **not** their
behaviour. Only `verify-build.mjs` can fail when Docusaurus changes.

## 🔴 Publish to BOTH registries

npm routes a registry per **scope**, never per package, and every Ciphera
machine's `~/.npmrc` maps `@ciphera-net` to GitHub Packages because Facet and
friends are private and live there. A public `@ciphera-net` package that exists
only on npmjs is **uninstallable from any estate machine**, and the error reads
`No matching version found` — like a wrong version rather than a wrong registry.

⚠️ A bare `npm publish` therefore goes to the WRONG registry. Always pass
`--registry` and an explicit `--userconfig`.

```bash
# 1. public npmjs
umask 077; NPMRC=$(mktemp)
printf '//registry.npmjs.org/:_authToken=%s\n@ciphera-net:registry=https://registry.npmjs.org/\n' "$NPMJS_TOKEN" > "$NPMRC"
npm publish --registry=https://registry.npmjs.org --access public --userconfig "$NPMRC"

# 2. GitHub Packages — so the estate can install it
printf '//npm.pkg.github.com/:_authToken=%s\n@ciphera-net:registry=https://npm.pkg.github.com/\n' "$GH_NPM_WRITE_TOKEN" > "$NPMRC"
npm publish --registry=https://npm.pkg.github.com --userconfig "$NPMRC"

rm -f "$NPMRC"
```

Never put a token on a command line; write it to a `umask 077` file and delete it.

### ✅ Publish state, 16-09-2026 — BOTH REGISTRIES

| Registry | State |
|---|---|
| **GitHub Packages** | 🟢 `1.0.0` — readable immediately, no propagation lag |
| **npmjs** | 🟢 `1.0.0` |

🔴 **Use `CIPHERA_SCOPE_NPMJS_TOKEN` from the workspace `.env`, not
`NPMJS_TOKEN`.** The `.env` holds three npm tokens; only that one can write
under the `@ciphera-net` scope. The others authenticate fine — `npm whoami`
returns `uz1mani` for all of them — so **authenticating proves nothing**. The
one-request test that separates them:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  https://registry.npmjs.org/-/org/ciphera-net/user
```

**200** (returning `{"uz1mani":"owner"}`) is the working token; **403** is not.
A publish with the wrong one fails as `404 … could not be found or you do not
have permission`, which reads like a missing package rather than a wrong
credential, and cost an hour of diagnosing the wrong thing.

### 🔑 Two npm 404s that point in opposite directions

- A 404 **from** the publish call (`npm publish` exits non-zero) is a
  **credential** problem — almost certainly the wrong token, see above.
- A 404 **after** a successful publish (`npm publish` exits 0) is
  **propagation**, and means nothing. See below.

The status code is identical. What separates them is the exit code.

### ⏳ npmjs takes about four minutes to become readable

A successful publish prints `+ @ciphera-net/pulse-docusaurus@1.0.0` and exits 0
**before the packument is fetchable**. Measured on `pulse-astro`, 15-09-2026: 404
for 220 seconds, 200 at t+240s, and an *authenticated* read 404s identically, so
it is not a public-CDN artefact. **An early 404 is not a failed publish.**

### 🔴 A granular token cannot unpublish

`npm unpublish` returns `403 Forbidden … Granular access tokens that bypass
two-factor authentication may not perform this action`. `npm deprecate` works
with the same token. Deleting needs 2FA — the website, or a classic token. Same
shape on GitHub Packages, which wants `delete:packages`; the estate's
`NODE_AUTH_TOKEN` carries only `write:packages`.

## Listings

**Owner decision, 15-09-2026: take BOTH — community directory first, Meta CLA
separately.**

### 1. `docusaurus.community` — CLA-free, do this one first

Community-run (not Meta), CC BY-SA 4.0. Submission is a **comment on a GitHub
Discussion**, not a PR: `github.com/homotechsual/docusaurus.community`
discussion #3. The maintainer says so explicitly — a PR is technically possible
but *"apart from small edits, we prefer to handle the PR ourselves"*.

The comment carries these fields:

| Field | Value |
|---|---|
| Plugin name | ≤60 chars, and **must not contain "Docusaurus Plugin"** — use `Pulse Analytics` |
| Description | ≤120 chars |
| Plugin website | `https://pulse.ciphera.net` |
| Plugin source URL | `https://github.com/ciphera-net/pulse-docusaurus` |
| Tags | from `favorite, search, api, utility, content, theme, markdown, analytics, integration` — ours is **`analytics`** |
| Author | Ciphera |
| Maintained | true |
| NPM Packages | `["@ciphera-net/pulse-docusaurus"]` |
| Minimum Version | the semver floor measured in the table above |

They take the screenshot themselves. No account beyond GitHub, no fee, no CLA,
no published review SLA. The directory is being refactored towards per-plugin
YAML self-submission — if that has landed by the time you read this, check the
repo before commenting.

**Ready to paste**, once the npm package is readable (it is, since 16-09-2026):

```
Plugin name: Pulse Analytics
Plugin description: Privacy-first analytics in one plugin. No cookies, no personal data, under 3 KB.
Plugin website: https://pulse.ciphera.net
Plugin source URL: https://github.com/ciphera-net/pulse-docusaurus
Tags: analytics
Author: Ciphera
Maintained: true
NPM Packages: ["@ciphera-net/pulse-docusaurus"]
Minimum Version: 3.0.0
```

The description is 94 characters, inside the 120 cap; the name is 16, inside 60,
and contains no "Docusaurus Plugin" (which the template forbids). **Minimum
Version is `3.0.0`, not `3.10.2`** — that is what the compatibility table above
actually measured, and claiming the newest version tested would understate the
range for no reason.

### 2. The official list — costs a Meta CLA

A PR to `facebook/docusaurus` editing `website/community/2-resources.mdx`. The
CLA bot blocks the merge until a CLA is signed at `code.facebook.com/cla`. No
review SLA is published. This is a deliberate, owner-approved exception to the
sovereignty rule (no new US companies in the critical path) on the grounds that
it is a documentation table row and grants nothing operational.

🔑 **The plugin ships and is installable without either listing.** Neither is a
release gate — do not hold a publish on a directory.

## No platform logo on any listing card

`opensource.fb.com/legal/trademark/` excludes the logo from even the narrowest
nominative use: *"the name may be used, but not the stylized wording or the
logo"*, with a catch-all that everything else needs written permission. The
listing card for this integration is therefore `svg: null` in
`pulse-framer/listing/platforms.mjs` — Pulse mark alone, Docusaurus named in
text. This is the rule for every platform in the queue, not a Docusaurus quirk:
**a platform logo goes on a Pulse card only when that platform's policy permits
it in words, and silence reads as no.**

The README carries an independence disclaimer naming Meta. Keep it there.

## Release steps

1. Bump `version` in `package.json`.
2. Merge to `main`. `.woodpecker/test.yml` runs on the PR **and** on the push:
   typecheck, tests, a test-count floor, build, a zero-runtime-dependency
   assertion, a CommonJS-entrypoint assertion and a tarball-contents assertion.
3. `node scripts/verify-build.mjs 3.10.2 …` and update the table above. Widening
   the peer range means running this again, not editing the string.
4. Tag: `git tag -a vX.Y.Z -m "Release X.Y.Z" && git push origin vX.Y.Z`.
5. `npm pack --dry-run` — LICENSE, README, `lib/` and `package.json`, nothing
   else. `prepack` rebuilds `lib/`, which is gitignored, so a fresh clone cannot
   ship an empty package.
6. Publish to both registries (above).
7. Confirm with `npm view @ciphera-net/pulse-docusaurus version` against **each**
   registry explicitly. A single `npm view` answers from whichever registry the
   scope happens to be mapped to and will happily report the other one's version.
8. First release only: post the docusaurus.community comment, and open the
   `facebook/docusaurus` PR once the CLA is signed.

## A CI release pipeline is deliberately NOT here

A `publish.yml` referencing a secret that does not exist would **halt the whole
pipeline, `test` included** — a missing secret is a pipeline-level error in
Woodpecker, not a step-level one, and zero steps run. Add `npmjs_token` to this
repo in Woodpecker first, then copy `Tessera/tessera-ts/.woodpecker/publish.yml`,
which is the worked example: a step per registry, `test -n "$NODE_AUTH_TOKEN"`
guards that fail loudly when a secret is not injected, and an idempotent publish
that tolerates a re-tag. Release by **tagging**, not by a manual trigger.
