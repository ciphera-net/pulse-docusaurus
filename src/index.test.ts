import { afterEach, describe, expect, it } from "vitest"
import type { LoadContext } from "@docusaurus/types"
import pulseAnalytics from "./index"
import { SCRIPT_URL } from "./pulse"

/** Just enough of a LoadContext for the plugin factory. The factory reads
 *  exactly one field, and saying so here is the point of the cast. */
function ctx(url?: string): LoadContext {
  return { siteConfig: { url } } as unknown as LoadContext
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
})

describe("the plugin factory", () => {
  it("self-disables outside a production build, because the tracker has no localhost guard", () => {
    process.env.NODE_ENV = "development"
    expect(pulseAnalytics(ctx("https://example.com"), {})).toBeNull()
  })

  it("returns null and never undefined when disabled — Docusaurus throws on undefined", () => {
    process.env.NODE_ENV = "development"
    const result = pulseAnalytics(ctx("https://example.com"), {})
    expect(result).toBeNull()
    expect(result).not.toBeUndefined()
  })

  it("injects in dev when asked to explicitly", () => {
    process.env.NODE_ENV = "development"
    const plugin = pulseAnalytics(ctx("https://example.com"), { injectInDev: true })
    expect(plugin).not.toBeNull()
    expect(plugin!.name).toBe("pulse-analytics")
  })

  it("injects the tag on a production build, with the domain taken from `url`", () => {
    process.env.NODE_ENV = "production"
    const plugin = pulseAnalytics(ctx("https://docs.example.com/"), {})
    const tags = plugin!.injectHtmlTags!({ content: undefined }) as {
      headTags: { tagName: string; attributes: Record<string, string | boolean> }[]
    }
    expect(tags.headTags).toHaveLength(1)
    expect(tags.headTags[0]!.attributes).toEqual({
      defer: true,
      "data-domain": "docs.example.com",
      src: SCRIPT_URL,
    })
  })

  it("lets an explicit domain override the site url", () => {
    process.env.NODE_ENV = "production"
    const plugin = pulseAnalytics(ctx("https://preview.example.com"), { domain: "example.com" })
    const tags = plugin!.injectHtmlTags!({ content: undefined }) as {
      headTags: { attributes: Record<string, string | boolean> }[]
    }
    expect(tags.headTags[0]!.attributes["data-domain"]).toBe("example.com")
  })

  it("fails the site build on a mistyped domain rather than silently auto-detecting", () => {
    process.env.NODE_ENV = "production"
    expect(() => pulseAnalytics(ctx("https://example.com"), { domain: "not a domain" })).toThrow(
      /is not a valid domain/,
    )
  })

  it("survives a config with no url at all, falling back to auto-detection", () => {
    process.env.NODE_ENV = "production"
    const plugin = pulseAnalytics(ctx(undefined), {})
    const tags = plugin!.injectHtmlTags!({ content: undefined }) as {
      headTags: { attributes: Record<string, string | boolean> }[]
    }
    expect(tags.headTags[0]!.attributes).not.toHaveProperty("data-domain")
  })

  it("builds the tags once, at plugin construction, not per call", () => {
    process.env.NODE_ENV = "production"
    const plugin = pulseAnalytics(ctx("https://example.com"), {})
    const a = plugin!.injectHtmlTags!({ content: undefined })
    const b = plugin!.injectHtmlTags!({ content: undefined })
    expect(a.headTags).toBe(b.headTags)
  })
})
