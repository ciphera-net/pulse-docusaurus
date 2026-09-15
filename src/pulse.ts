// Pure logic for the Pulse Docusaurus plugin: what tags to inject, and what
// domain to inject them with. No Docusaurus API in this file, so all of it is
// unit-tested.
//
// The decisions here deliberately mirror `pulse-astro/src/pulse.ts` and
// `pulse-framer/src/pulse.ts`. Two Pulse install surfaces disagreeing about
// what the tag looks like is a drift bug waiting to happen, so the URLs, the
// domain grammar and the rule that the companion is a SECOND script are
// copied, not re-derived.

export const SCRIPT_URL = "https://js.ciphera.net/script.js"
export const COMPANION_URL = "https://js.ciphera.net/script.interactions.js"

/** A registrable hostname: labels of letters, digits and hyphens, at least one
 *  dot, a letter-only TLD. Deliberately strict — the value lands inside an HTML
 *  attribute, and this shape cannot carry a quote, a space or a bracket.
 *
 *  Docusaurus escapes attribute values itself (`escape-html` in
 *  `core/lib/server/htmlTags.js`), so this is the second of two guards rather
 *  than the only one. It is kept anyway: a domain that cannot be a hostname is
 *  a typo, and a typo is a silent no-data install. */
const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/

/** Lower-case, drop a scheme, path, port and trailing dot. Keeps `www.` — the
 *  Pulse site may be registered either way and the user can override it. */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  s = s.replace(/[/?#].*$/, "")
  s = s.replace(/:.*$/, "")
  s = s.replace(/\.$/, "")
  return s
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain)
}

/** The hostname of Docusaurus's `url` config value, or null when it is unset or
 *  does not parse as a registrable domain. `url` is mandatory in a Docusaurus
 *  config, so this is the near-universal path — the Docusaurus equivalent of
 *  Astro's `site` and of the Framer plugin reading `getPublishInfo()`.
 *
 *  `http://localhost:3000` deliberately returns null: `localhost` has no dot
 *  and no TLD, so it fails `isValidDomain` and the caller falls back to
 *  auto-detection instead of registering a site called "localhost". */
export function hostnameFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const host = new URL(String(url)).hostname.toLowerCase().replace(/\.$/, "")
    return isValidDomain(host) ? host : null
  } catch {
    return null
  }
}

export interface PulseOptions {
  /** The domain the site is registered under in Pulse. Defaults to the
   *  hostname of Docusaurus's `url` config. If neither is available the tag is
   *  injected without `data-domain` and the tracker falls back to the browser's
   *  own hostname — which is correct for a single-domain site. */
  domain?: string
  /** Also load the companion script, which records clicks, copies and form
   *  submits. A SECOND request on purpose: the core script's size is a
   *  published claim and nothing may be folded into it. */
  companion?: boolean
  /** Route events through your own proxy origin. The tracker appends its own
   *  path, so this is a bare origin (`https://example.com`), not a full URL. */
  api?: string
  /** Inject during `docusaurus start` as well. Off by default: the tracker has
   *  no localhost guard, so a dev server would send real pageviews at
   *  production. */
  injectInDev?: boolean
}

export type DomainSource = "option" | "url" | "browser"

export interface Resolution {
  domain: string | null
  source: DomainSource
}

/** Resolve the domain, saying WHERE it came from so the caller can log it.
 *  Never throws for a missing domain — a null domain is a working install that
 *  auto-detects — but an explicitly supplied domain that cannot be a hostname
 *  is a typo, and that does throw rather than silently auto-detect something
 *  the user did not ask for. */
export function resolveDomain(
  options: PulseOptions,
  siteUrl: string | undefined | null,
): Resolution {
  if (options.domain !== undefined) {
    const d = normalizeDomain(options.domain)
    if (!isValidDomain(d)) {
      throw new Error(
        `[pulse-docusaurus] "${options.domain}" is not a valid domain. Pass the hostname your site is registered under in Pulse, e.g. domain: "example.com".`,
      )
    }
    return { domain: d, source: "option" }
  }
  const fromUrl = hostnameFromUrl(siteUrl)
  if (fromUrl) return { domain: fromUrl, source: "url" }
  return { domain: null, source: "browser" }
}

/** The shape Docusaurus's `injectHtmlTags` accepts, declared here so this file
 *  stays free of Docusaurus imports. `src/index.ts` asserts at compile time
 *  that it is assignable to Docusaurus's own `HtmlTagObject`, so a drift in
 *  their type reddens the build rather than shipping. */
export interface HtmlTagObject {
  tagName: string
  attributes: Record<string, string | boolean>
}

/** Exactly the tag Pulse's install panel emits, as tag objects.
 *
 *  🔑 This is the one surface in the queue that can emit the LITERAL tag.
 *  Astro's `injectScript` takes JavaScript source and GTM's sandboxed
 *  `injectScript(url, …)` has no attribute parameter, so both have to build the
 *  element at runtime or configure through `window.pulseConfig`. Docusaurus
 *  serialises `{tagName, attributes}` straight into the HTML, honouring
 *  arbitrary `data-*` keys, so view-source here shows the real tag and there is
 *  no inline script — which means no CSP nonce and no `unsafe-inline`.
 *
 *  Attribute ORDER is the canonical install order (`defer`, `data-domain`,
 *  `data-api`, `src`) because Docusaurus serialises `Object.keys` in insertion
 *  order, and a tag a user can diff against the docs is worth the care.
 *
 *  No `preconnect` hints, deliberately — `@docusaurus/plugin-google-gtag` emits
 *  two, but Framer, Astro and GTM emit none, and one surface quietly performing
 *  differently from the others is exactly the drift this file exists to stop. */
export function buildHeadTags(
  domain: string | null,
  options: PulseOptions = {},
): HtmlTagObject[] {
  if (domain !== null && !isValidDomain(domain)) {
    throw new Error(`[pulse-docusaurus] refusing to inject an invalid domain: ${domain}`)
  }

  const attributes: Record<string, string | boolean> = { defer: true }
  if (domain !== null) attributes["data-domain"] = domain
  if (options.api) attributes["data-api"] = String(options.api).replace(/\/+$/, "")
  attributes["src"] = SCRIPT_URL

  const tags: HtmlTagObject[] = [{ tagName: "script", attributes }]

  if (options.companion) {
    // No `data-domain` on the companion: the tracker resolves the domain once,
    // from the core script, and a second copy is a second thing to keep in step.
    tags.push({ tagName: "script", attributes: { defer: true, src: COMPANION_URL } })
  }

  return tags
}
