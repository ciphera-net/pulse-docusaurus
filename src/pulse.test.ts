import { describe, expect, it } from "vitest"
import {
  buildHeadTags,
  COMPANION_URL,
  hostnameFromUrl,
  isValidDomain,
  normalizeDomain,
  resolveDomain,
  SCRIPT_URL,
  type HtmlTagObject,
} from "./pulse"

/** A faithful transcription of Docusaurus's own serialiser, read out of
 *  `@docusaurus/core@3.10.2/lib/server/htmlTags.js` on 15-09-2026.
 *
 *  ⚠️ Stated honestly: this is a COPY of their algorithm, so these assertions
 *  prove what OUR tag objects become under the behaviour we measured — not that
 *  Docusaurus still behaves that way. The check that can actually fail on a
 *  Docusaurus change is `scripts/verify-build.mjs`, which builds a real site
 *  and greps the emitted HTML. This is here because attribute ORDER and
 *  boolean-vs-string attributes are the two things easiest to get wrong and
 *  hardest to see in an object literal. */
function serialize(tag: HtmlTagObject): string {
  const attrs = Object.keys(tag.attributes)
    .map((attr) => {
      const value = tag.attributes[attr]
      if (typeof value === "boolean") return value ? attr : undefined
      return `${attr}="${String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")}"`
    })
    .filter((s): s is string => Boolean(s))
  return `<${[tag.tagName, ...attrs].join(" ")}></${tag.tagName}>`
}

describe("normalizeDomain", () => {
  it("strips a scheme, path, query, hash and port", () => {
    expect(normalizeDomain("https://example.com/docs?a=1#b")).toBe("example.com")
    expect(normalizeDomain("http://example.com:8080")).toBe("example.com")
  })

  it("lower-cases and trims", () => {
    expect(normalizeDomain("  ExAmPle.COM  ")).toBe("example.com")
  })

  it("drops a fully-qualified trailing dot but keeps www", () => {
    expect(normalizeDomain("www.example.com.")).toBe("www.example.com")
  })
})

describe("isValidDomain", () => {
  it("accepts ordinary registrable hostnames", () => {
    expect(isValidDomain("example.com")).toBe(true)
    expect(isValidDomain("docs.example.co.uk")).toBe(true)
    expect(isValidDomain("my-site.dev")).toBe(true)
  })

  it("rejects a bare label, so `localhost` can never be registered as a site", () => {
    expect(isValidDomain("localhost")).toBe(false)
  })

  it("rejects a leading hyphen and a numeric TLD", () => {
    expect(isValidDomain("-bad.com")).toBe(false)
    expect(isValidDomain("example.123")).toBe(false)
  })

  it("rejects anything that could break out of an HTML attribute", () => {
    expect(isValidDomain('example.com" onload="x')).toBe(false)
    expect(isValidDomain("example.com x")).toBe(false)
    expect(isValidDomain("example.com>")).toBe(false)
  })
})

describe("hostnameFromUrl", () => {
  it("reads the hostname out of the site url", () => {
    expect(hostnameFromUrl("https://docs.example.com")).toBe("docs.example.com")
  })

  it("returns null for a dev server, so a build there auto-detects instead", () => {
    expect(hostnameFromUrl("http://localhost:3000")).toBeNull()
  })

  it("returns null for nothing and for garbage rather than throwing", () => {
    expect(hostnameFromUrl(undefined)).toBeNull()
    expect(hostnameFromUrl(null)).toBeNull()
    expect(hostnameFromUrl("not a url")).toBeNull()
  })
})

describe("resolveDomain", () => {
  it("prefers an explicit option over the site url", () => {
    expect(resolveDomain({ domain: "chosen.com" }, "https://ignored.com")).toEqual({
      domain: "chosen.com",
      source: "option",
    })
  })

  it("falls back to the site url", () => {
    expect(resolveDomain({}, "https://example.com/docs/")).toEqual({
      domain: "example.com",
      source: "url",
    })
  })

  it("falls back to browser auto-detection when there is nothing to go on", () => {
    expect(resolveDomain({}, undefined)).toEqual({ domain: null, source: "browser" })
  })

  it("throws on an explicit domain that cannot be a hostname — a typo is a silent no-data install", () => {
    expect(() => resolveDomain({ domain: "not a domain" }, "https://example.com")).toThrow(
      /is not a valid domain/,
    )
  })
})

describe("buildHeadTags", () => {
  it("emits the literal Pulse tag, in the canonical attribute order", () => {
    const tags = buildHeadTags("example.com")
    expect(tags).toHaveLength(1)
    expect(serialize(tags[0]!)).toBe(
      `<script defer data-domain="example.com" src="${SCRIPT_URL}"></script>`,
    )
  })

  it("passes `defer` as a boolean so Docusaurus emits a bare attribute", () => {
    // A string "true" would serialise as defer="true" — valid, but not the tag
    // the Pulse docs show, and the three surfaces must emit one tag shape.
    expect(buildHeadTags("example.com")[0]!.attributes["defer"]).toBe(true)
  })

  it("omits data-domain entirely when auto-detecting", () => {
    const tags = buildHeadTags(null)
    expect(tags[0]!.attributes).not.toHaveProperty("data-domain")
    expect(serialize(tags[0]!)).toBe(`<script defer src="${SCRIPT_URL}"></script>`)
  })

  it("carries a custom api origin as data-api, with trailing slashes stripped", () => {
    const tags = buildHeadTags("example.com", { api: "https://proxy.example.com/" })
    expect(serialize(tags[0]!)).toBe(
      `<script defer data-domain="example.com" data-api="https://proxy.example.com" src="${SCRIPT_URL}"></script>`,
    )
  })

  it("adds the companion as a SECOND script, never folded into the first", () => {
    const tags = buildHeadTags("example.com", { companion: true })
    expect(tags).toHaveLength(2)
    expect(serialize(tags[1]!)).toBe(`<script defer src="${COMPANION_URL}"></script>`)
  })

  it("does not repeat data-domain on the companion", () => {
    const tags = buildHeadTags("example.com", { companion: true })
    expect(tags[1]!.attributes).not.toHaveProperty("data-domain")
  })

  it("refuses to inject a domain that did not come through resolveDomain", () => {
    expect(() => buildHeadTags('bad" onload="x')).toThrow(/refusing to inject/)
  })

  it("emits no inline script at all, so the plugin needs no CSP nonce", () => {
    const tags = buildHeadTags("example.com", { companion: true, api: "https://p.example.com" })
    for (const tag of tags) {
      expect(tag).not.toHaveProperty("innerHTML")
      expect(tag.attributes["src"]).toMatch(/^https:\/\/js\.ciphera\.net\//)
    }
  })

  it("points at js.ciphera.net and nowhere else", () => {
    expect(SCRIPT_URL).toBe("https://js.ciphera.net/script.js")
    expect(COMPANION_URL).toBe("https://js.ciphera.net/script.interactions.js")
  })
})
