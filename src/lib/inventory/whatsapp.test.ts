import { describe, expect, it } from "vitest";

import { normalizeWhatsappCatalogUrl, WHATSAPP_CATALOG_URL_PATTERN } from "./whatsapp";

const ITEM = "https://wa.me/p/7429384729384723/263771234567";

describe("normalizeWhatsappCatalogUrl", () => {
  it("accepts a wa.me/p/ catalogue item link as is", () => {
    expect(normalizeWhatsappCatalogUrl(ITEM)).toBe(ITEM);
  });

  it.each([
    ["surrounding spaces", `  ${ITEM}  `],
    ["no scheme", "wa.me/p/7429384729384723/263771234567"],
    ["http", "http://wa.me/p/7429384729384723/263771234567"],
    ["www host", "https://www.wa.me/p/7429384729384723/263771234567"],
    ["upper-case host", "https://WA.ME/p/7429384729384723/263771234567"],
    ["trailing slash", `${ITEM}/`],
    ["query and fragment", `${ITEM}?app_absent=0#x`],
  ])("stores one canonical form (%s)", (_, input) => {
    expect(normalizeWhatsappCatalogUrl(input)).toBe(ITEM);
  });

  it("keeps the product id and phone number exactly, leading zeros included", () => {
    expect(normalizeWhatsappCatalogUrl("https://wa.me/p/0012345/0771234567")).toBe("https://wa.me/p/0012345/0771234567");
  });

  it("treats a blank input as no link", () => {
    expect(normalizeWhatsappCatalogUrl("")).toBe("");
    expect(normalizeWhatsappCatalogUrl("   ")).toBe("");
  });

  it.each([
    ["not a URL", "not a link"],
    ["another domain", "https://example.com/p/7429384729384723/263771234567"],
    ["a look-alike domain", "https://wa.me.example.com/p/7429384729384723/263771234567"],
    ["a subdomain", "https://shop.wa.me/p/7429384729384723/263771234567"],
    ["a chat link", "https://wa.me/263771234567"],
    ["a whole-catalogue link", "https://wa.me/c/263771234567"],
    ["no phone number", "https://wa.me/p/7429384729384723"],
    ["a non-numeric product id", "https://wa.me/p/abc/263771234567"],
    ["an extra path segment", `${ITEM}/extra`],
    ["a phone number that's too short", "https://wa.me/p/7429384729384723/12345"],
    ["another scheme", "ftp://wa.me/p/7429384729384723/263771234567"],
    ["javascript", "javascript:alert(1)"],
    ["credentials", "https://user:pass@wa.me/p/7429384729384723/263771234567"],
    ["a port", "https://wa.me:8443/p/7429384729384723/263771234567"],
  ])("rejects %s", (_, input) => {
    expect(normalizeWhatsappCatalogUrl(input)).toBeNull();
  });

  it("only produces links the database constraint accepts", () => {
    expect(WHATSAPP_CATALOG_URL_PATTERN.test(normalizeWhatsappCatalogUrl(`${ITEM}/?x=1`)!)).toBe(true);
    expect(WHATSAPP_CATALOG_URL_PATTERN.test(`${ITEM}/`)).toBe(false);
  });
});
