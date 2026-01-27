/**
 * Debrid Safety Gate
 *
 * Enforces strict safety:
 * - NO P2P - streaming ONLY via debrid HTTPS after validation
 * - User must have a valid debrid API key
 * - Provides two modes: Discovery mode vs Playable mode
 */

import { TorrentResult } from "../scraping/types";
import { useSettingsStore } from "../../stores/settingsStore";
import { createDebridProvider } from "./providers";

// ============================================================================
// TYPES
// ============================================================================

export interface SafetyCheckResult {
  isValid: boolean;
  hasDebridKey: boolean;
  isKeyValidated: boolean;
  debridService: string | null;
  error?: string;
}

export interface DiscoveryModeResult {
  id: string;
  title: string;
  quality: string;
  size: string;
  seeds: number;
  provider: string;
  // Magnet/infoHash NOT exposed in discovery mode for safety
  isCached?: boolean;
}

export interface PlayableModeResult {
  torrentId: string;
  title: string;
  streamUrl: string; // HTTPS URL only
  filename: string;
  filesize: number;
  quality?: string;
  isInstant: boolean;
}

// ============================================================================
// SAFETY GATE
// ============================================================================

/**
 * Check if the user has a valid debrid configuration
 */
export async function checkDebridSafety(): Promise<SafetyCheckResult> {
  const settings = useSettingsStore.getState();

  // Check if a debrid service is selected
  if (settings.activeDebridService === "none") {
    return {
      isValid: false,
      hasDebridKey: false,
      isKeyValidated: false,
      debridService: null,
      error:
        "No debrid service configured. Please add a Real-Debrid or AllDebrid API key in settings.",
    };
  }

  // Check if API key exists
  const apiKey = settings.getActiveApiKey();
  if (!apiKey) {
    return {
      isValid: false,
      hasDebridKey: false,
      isKeyValidated: false,
      debridService: settings.activeDebridService,
      error: `No API key configured for ${settings.activeDebridService}. Please add your API key in settings.`,
    };
  }

  // Validate the API key
  const provider = createDebridProvider(settings.activeDebridService, apiKey);
  if (!provider) {
    return {
      isValid: false,
      hasDebridKey: true,
      isKeyValidated: false,
      debridService: settings.activeDebridService,
      error: `Unsupported debrid service: ${settings.activeDebridService}`,
    };
  }

  try {
    const isValid = await provider.validateApiKey();
    if (!isValid) {
      return {
        isValid: false,
        hasDebridKey: true,
        isKeyValidated: false,
        debridService: settings.activeDebridService,
        error:
          "API key is invalid or expired. Please check your debrid account.",
      };
    }

    return {
      isValid: true,
      hasDebridKey: true,
      isKeyValidated: true,
      debridService: settings.activeDebridService,
    };
  } catch (error) {
    return {
      isValid: false,
      hasDebridKey: true,
      isKeyValidated: false,
      debridService: settings.activeDebridService,
      error: `Failed to validate API key: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Convert torrent results to discovery mode (safe, no P2P links exposed)
 * This mode shows what's available without exposing magnet links
 */
export function toDiscoveryMode(
  results: TorrentResult[],
): DiscoveryModeResult[] {
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    quality: r.quality,
    size: r.sizeFormatted,
    seeds: r.seeds,
    provider: r.provider,
    // Magnet/infoHash intentionally NOT included
    isCached: undefined, // Will be filled by RD availability check
  }));
}

/**
 * Check if a debrid key is required before showing results
 * Returns true if the user should be prompted to add a key
 */
export function requiresDebridKey(): boolean {
  const settings = useSettingsStore.getState();
  return settings.activeDebridService === "none" || !settings.getActiveApiKey();
}

/**
 * Get a safe error message for missing debrid configuration
 */
export function getDebridSetupMessage(): string {
  const settings = useSettingsStore.getState();

  if (settings.activeDebridService === "none") {
    return "To stream content, you need a debrid service like Real-Debrid. This converts torrents to fast HTTPS streams without P2P.\n\nPlease add your Real-Debrid or AllDebrid API key in Settings.";
  }

  if (!settings.getActiveApiKey()) {
    return `Please add your ${settings.activeDebridService === "realdebrid" ? "Real-Debrid" : "AllDebrid"} API key in Settings to start streaming.`;
  }

  return "Debrid configuration error. Please check your settings.";
}

// ============================================================================
// CACHE CHECK (for instant availability)
// ============================================================================

export interface CacheCheckResult {
  infoHash: string;
  isCached: boolean;
  cachedFiles?: {
    filename: string;
    filesize: number;
  }[];
}

/**
 * Check which torrents are instantly available (cached) on the debrid service
 * This avoids any P2P download - only returns cached content
 */
export async function checkInstantAvailability(
  infoHashes: string[],
): Promise<Map<string, boolean>> {
  const safety = await checkDebridSafety();
  if (!safety.isValid) {
    throw new Error(safety.error || "Debrid not configured");
  }

  const settings = useSettingsStore.getState();
  const apiKey = settings.getActiveApiKey();
  if (!apiKey) {
    throw new Error("No API key");
  }

  const provider = createDebridProvider(settings.activeDebridService, apiKey);
  if (!provider) {
    throw new Error("Provider not available");
  }

  const availability = await provider.checkInstantAvailability(infoHashes);
  return new Map(Object.entries(availability));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const debridSafetyGate = {
  checkDebridSafety,
  toDiscoveryMode,
  requiresDebridKey,
  getDebridSetupMessage,
  checkInstantAvailability,
};
