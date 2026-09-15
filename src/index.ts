import type { LoadContext, Plugin, HtmlTagObject } from "@docusaurus/types"
import { buildHeadTags, resolveDomain, type HtmlTagObject as PulseHtmlTag, type PulseOptions } from "./pulse"

export type { PulseOptions }
export {
  SCRIPT_URL,
  COMPANION_URL,
  normalizeDomain,
  isValidDomain,
  hostnameFromUrl,
  buildHeadTags,
  resolveDomain,
} from "./pulse"

/** Compile-time proof that the tag shape `pulse.ts` builds — which is declared
 *  there without importing Docusaurus, so the logic stays unit-testable — is
 *  still the shape Docusaurus accepts. If their type moves, this reddens the
 *  build instead of shipping a tag Docusaurus will reject at site-build time. */
const _tagShapeMatches: (t: PulseHtmlTag) => HtmlTagObject = (t) => t
void _tagShapeMatches

/**
 * Pulse Analytics — privacy-first web analytics for Docusaurus.
 *
 *   // docusaurus.config.js
 *   plugins: [
 *     ['@ciphera-net/pulse-docusaurus', { domain: 'example.com' }],
 *   ]
 *
 * The domain comes from the site's own `url` config unless you pass one.
 */
export default function pulseAnalytics(
  context: LoadContext,
  options: PulseOptions = {},
): Plugin | null {
  // The tracker has no localhost guard, so `docusaurus start` would send real
  // pageviews at production. Returning null is the sanctioned way for a plugin
  // to self-disable (facebook/docusaurus#10286) and is what
  // `@docusaurus/plugin-google-gtag` does; returning undefined would throw.
  const isProd = process.env.NODE_ENV === "production"
  if (!isProd && !options.injectInDev) return null

  // Throws on an explicitly supplied domain that cannot be a hostname. A typo
  // there is a silent no-data install, which is worth a build error.
  const { domain, source } = resolveDomain(options, context.siteConfig?.url)

  if (source === "browser") {
    console.warn(
      "[pulse-docusaurus] no `url` in docusaurus.config and no `domain` option — the tag will auto-detect the browser's hostname. Set one of them if this site is served on more than one domain.",
    )
  }

  const headTags = buildHeadTags(domain, options)

  return {
    name: "pulse-analytics",
    injectHtmlTags() {
      return { headTags }
    },
  }
}
