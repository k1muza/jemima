/**
 * Signed photo links kept in localStorage between visits. A fresh signature
 * means a new URL, which the browser can't match to its cached copy, so every
 * reload used to download every photo again. Reusing the link keeps the URL
 * stable and the photo comes from the browser cache instead.
 *
 * Each link is saved with the photo row's `updated_at`: overwriting a file
 * always updates its row too, so a changed version asks for a new link (and so
 * a new download), even when the edit happened on another device.
 *
 * Fails soft: without localStorage, every load just signs again.
 */
const STORAGE_KEY = "jemimas-designs:signed-photo-links";

type Entry = { url: string; version: string; expiresAt: number };
type Cache = Record<string, Entry>;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(store: Storage | null): Cache {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

export type SignRequest = { path: string; version: string };

/**
 * Links for `requests`: reused while they're on the same version and still
 * valid for at least `minRemainingMs`; the rest come from `sign`. Saves only
 * the links asked for this time, so deleted photos drop out of the cache.
 */
export async function cachedSignedUrls(
  requests: SignRequest[],
  sign: (paths: string[]) => Promise<{ path: string | null; signedUrl: string | null }[]>,
  { lifetimeMs, minRemainingMs, now = Date.now(), store = storage() }: {
    lifetimeMs: number;
    minRemainingMs: number;
    now?: number;
    store?: Storage | null;
  },
): Promise<Map<string, string>> {
  const cache = read(store);
  const next: Cache = {};
  const stale: string[] = [];
  for (const { path, version } of requests) {
    const entry = cache[path];
    if (entry?.version === version && typeof entry.url === "string" && entry.expiresAt - now >= minRemainingMs) {
      next[path] = entry;
    } else {
      stale.push(path);
    }
  }

  if (stale.length) {
    const versions = new Map(requests.map((r) => [r.path, r.version]));
    for (const { path, signedUrl } of await sign(stale)) {
      if (path && signedUrl) next[path] = { url: signedUrl, version: versions.get(path) ?? "", expiresAt: now + lifetimeMs };
    }
  }

  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Full or blocked storage: the links still work for this visit.
  }
  return new Map(Object.entries(next).map(([path, entry]) => [path, entry.url]));
}

/** Forget every saved link, e.g. on sign-out, so the next person on this browser signs their own. */
export function clearSignedUrlCache() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved to clear.
  }
}
