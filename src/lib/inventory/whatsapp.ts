/**
 * WhatsApp Business catalogue item links, e.g. https://wa.me/p/7429384729384723/263771234567
 * (`/p/<product id>/<shop phone number>`). Stored in one canonical form, which the
 * `products_whatsapp_catalog_url_format` database constraint also enforces.
 */
export const WHATSAPP_CATALOG_URL_PATTERN = /^https:\/\/wa\.me\/p\/[0-9]{1,30}\/[0-9]{6,15}$/;

/**
 * The canonical form of a WhatsApp catalogue item link: https, bare `wa.me` host, no
 * query, fragment or trailing slash. The product id and phone number are kept as given.
 * `""` for a blank input (no link); `null` when it isn't a WhatsApp catalogue item link.
 */
export function normalizeWhatsappCatalogUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return "";
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  if (url.hostname !== "wa.me" && url.hostname !== "www.wa.me") return null;
  const match = /^\/p\/([0-9]+)\/([0-9]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  const canonical = `https://wa.me/p/${match[1]}/${match[2]}`;
  return WHATSAPP_CATALOG_URL_PATTERN.test(canonical) ? canonical : null;
}
