# Pulse Analytics for Docusaurus

Privacy-first analytics for a Docusaurus site, in one plugin. No cookies, no
personal data, and the script it adds to your pages is under 3 KB.

[Pulse Analytics](https://pulse.ciphera.net) is built by [Ciphera](https://ciphera.net), a
company in Belgium, and hosted in Europe.

## Install

```bash
npm install @ciphera-net/pulse-docusaurus
```

```js
// docusaurus.config.js
module.exports = {
  url: 'https://example.com',
  plugins: [
    '@ciphera-net/pulse-docusaurus',
  ],
}
```

That is the whole setup. The domain comes from your site's `url` config, which
Docusaurus already requires you to set, so there is nothing else to configure.

To pass options, use the array form:

```js
plugins: [
  ['@ciphera-net/pulse-docusaurus', { companion: true }],
],
```

You need a Pulse Analytics account with a site registered for the same domain.
The free plan is enough to start.

## Options

| Option | Default | What it does |
|---|---|---|
| `domain` | from `url` | The domain your site is registered under in Pulse Analytics. Pass this when `url` is not the domain you track, for example on a preview deployment. |
| `companion` | `false` | Also record clicks, copies and form submits. A second, separate script — see below. |
| `api` | — | Route events through your own proxy origin. A bare origin (`https://example.com`), not a full URL: the tracker appends its own path. |
| `injectInDev` | `false` | Inject during `docusaurus start` too. Off by default — see below. |

## Three things worth knowing

**It does not run in `docusaurus start`.** The tracker has no localhost guard,
so a dev server would send real pageviews at your production dashboard. The
plugin disables itself outside a production build, exactly as Docusaurus's own
`@docusaurus/plugin-google-gtag` does. Set `injectInDev: true` if you actually
want it.

**The interaction capture is a second request on purpose.** The core script's
size is a published claim, and nothing gets folded into it to make a feature
look free. `companion: true` costs you a second, separate file.

**View-source shows the real tag, and there is no inline script.** This is worth
saying because it is not true of every Pulse integration — the Astro one and the
Google Tag Manager template both have to build the element at runtime, because
neither platform's injection API can carry attributes. Docusaurus's
`injectHtmlTags` serialises attributes directly, so what lands in your built HTML is:

```html
<script defer="defer" data-domain="example.com" src="https://js.ciphera.net/script.js"></script>
```

the same tag you would paste by hand. (The plugin emits a bare `defer`;
Docusaurus's HTML minifier re-serialises every boolean attribute into its
`name="name"` form, which it also does to Docusaurus's own script tags. The two
are identical in HTML5, where any value means true. Build with
`SKIP_HTML_MINIFICATION=true` and you will see the bare form.)

**A strict Content-Security-Policy needs no `unsafe-inline` and no nonce for
this plugin** — only `script-src https://js.ciphera.net` and
`connect-src https://pulse-api.ciphera.net`.

## A mistyped domain fails the build

`domain: "exmaple .com"` throws at build time rather than quietly falling back to
auto-detection. A typo there is an install that reports no data and looks fine,
which is the worst outcome an analytics plugin can produce, so it is worth a red
build instead.

If you set no `domain` **and** no `url`, the plugin warns and lets the tracker
auto-detect the browser's hostname — correct for a single-domain site, wrong for
a site served on several.

## What Pulse Analytics measures

Pageviews, referrers, countries, devices, time on page and scroll depth, plus
goals, funnels and campaigns. It sets no cookies and stores no personal data.
Visitors whose browser sends Do Not Track or Global Privacy Control are not
counted at all — so if you test in Brave or Firefox and see nothing, that is the
tracker behaving correctly. Safari is the easiest browser to verify an install in.

## Compatibility

`peerDependencies` claims what has actually been measured, not what seems
likely: each release is verified by building a real Docusaurus site and reading
the tag back out of the emitted HTML (`node scripts/verify-build.mjs 3.10.2 3.0.1`).
See `RELEASING.md` for the table.

## Licence

Copyright 2026 Ciphera BV. Licensed under the Apache License, Version 2.0 —
the `LICENSE` file is the licence text verbatim, so the copyright line lives
here rather than inside it.

This package has **zero runtime dependencies**, asserted in CI.

Docusaurus is a trademark of Meta Platforms, Inc.; this is an independent plugin
and is not affiliated with or endorsed by Meta or the Docusaurus project.
