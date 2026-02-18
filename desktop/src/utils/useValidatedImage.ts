import { useState, useEffect } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Module-level cache so validated URLs persist across component
 * mounts / re-renders without re-fetching.
 */
const cache = new Map<string, boolean>();

/**
 * Validate an image URL using Tauri's HTTP plugin (goes through Rust,
 * so the browser console never sees a 404). Returns the URL only when
 * the server responds with HTTP 2xx; otherwise returns `null`.
 */
export function useValidatedImage(
  url: string | undefined | null,
): string | null | undefined {
  const [validUrl, setValidUrl] = useState<string | null | undefined>(() => {
    if (!url) return null;
    if (cache.has(url)) return cache.get(url) ? url : null;
    return undefined; // unknown yet
  });

  useEffect(() => {
    if (!url) {
      setValidUrl(null);
      return;
    }

    // Already resolved
    if (cache.has(url)) {
      setValidUrl(cache.get(url) ? url : null);
      return;
    }

    setValidUrl(undefined);

    let cancelled = false;

    tauriFetch(url, { method: "HEAD" })
      .then((res) => {
        const ok = res.ok;
        cache.set(url, ok);
        if (!cancelled) setValidUrl(ok ? url : null);
      })
      .catch(() => {
        cache.set(url, false);
        if (!cancelled) setValidUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return validUrl;
}
