/**
 * Query Builder - Provider-specific query construction with fallback strategies
 *
 * Implements query parity with Torrentio by:
 * - Normalizing titles (punctuation, apostrophes, etc.)
 * - Supporting alternative titles from Cinemeta
 * - Providing provider-specific query formats
 * - Implementing fallback query strategies
 */

import { MediaQuery } from "./types";

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface QueryVariant {
  query: string;
  type: "primary" | "fallback" | "alternative";
  description: string;
}

export interface ProviderQueryConfig {
  supportsImdb: boolean;
  supportsYear: boolean;
  episodeFormat: "SxxExx" | "seasonXepisodeY" | "xXX" | "episode";
  needsUrlEncoding: boolean;
  maxQueryLength?: number;
}

// ============================================================================
// TITLE NORMALIZATION
// ============================================================================

/**
 * Normalize a title for search queries
 */
export function normalizeTitle(title: string): string {
  return (
    title
      // Remove special characters but keep alphanumeric and spaces
      .replace(/[^\w\s'-]/g, " ")
      // Normalize apostrophes
      .replace(/[''`]/g, "'")
      // Replace & with and
      .replace(/&/g, "and")
      // Collapse multiple spaces
      .replace(/\s+/g, " ")
      // Trim
      .trim()
  );
}

/**
 * Create a simplified query for fallback searches
 */
export function simplifyTitle(title: string): string {
  return (
    title
      // Remove everything in parentheses or brackets
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      // Remove common suffixes
      .replace(/:\s*.*$/, "")
      // Remove "The" prefix for better matching
      .replace(/^The\s+/i, "")
      // Normalize
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Extract alternative titles that might help with searches
 */
export function getAlternativeTitles(
  originalTitle: string,
  alternativeTitles?: string[],
): string[] {
  const alternatives: string[] = [];

  // Add normalized original
  const normalized = normalizeTitle(originalTitle);
  if (normalized !== originalTitle) {
    alternatives.push(normalized);
  }

  // Add simplified version
  const simplified = simplifyTitle(originalTitle);
  if (simplified !== originalTitle && simplified !== normalized) {
    alternatives.push(simplified);
  }

  // Add provided alternatives (from Cinemeta)
  if (alternativeTitles) {
    for (const alt of alternativeTitles) {
      const normalizedAlt = normalizeTitle(alt);
      if (
        !alternatives.includes(normalizedAlt) &&
        normalizedAlt !== originalTitle
      ) {
        alternatives.push(normalizedAlt);
      }
    }
  }

  // Handle "X: Y" -> "X" pattern
  if (originalTitle.includes(":")) {
    const firstPart = originalTitle.split(":")[0].trim();
    if (firstPart.length > 3 && !alternatives.includes(firstPart)) {
      alternatives.push(firstPart);
    }
  }

  return alternatives.slice(0, 5); // Limit to 5 alternatives
}

// ============================================================================
// EPISODE FORMATTING
// ============================================================================

export function formatEpisode(
  season: number,
  episode: number,
  format: ProviderQueryConfig["episodeFormat"],
): string {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");

  switch (format) {
    case "SxxExx":
      return `S${s}E${e}`;
    case "seasonXepisodeY":
      return `season ${season} episode ${episode}`;
    case "xXX":
      return `${season}x${e}`;
    case "episode":
      return `${episode}`;
    default:
      return `S${s}E${e}`;
  }
}

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

export const PROVIDER_QUERY_CONFIGS: Record<string, ProviderQueryConfig> = {
  yts: {
    supportsImdb: true,
    supportsYear: true,
    episodeFormat: "SxxExx",
    needsUrlEncoding: true,
  },
  eztv: {
    supportsImdb: true,
    supportsYear: false,
    episodeFormat: "SxxExx",
    needsUrlEncoding: true,
  },
  "1337x": {
    supportsImdb: false,
    supportsYear: true,
    episodeFormat: "SxxExx",
    needsUrlEncoding: true,
    maxQueryLength: 100,
  },
  tpb: {
    supportsImdb: false,
    supportsYear: true,
    episodeFormat: "SxxExx",
    needsUrlEncoding: true,
  },
  torrentgalaxy: {
    supportsImdb: true,
    supportsYear: true,
    episodeFormat: "SxxExx",
    needsUrlEncoding: true,
  },
  nyaa: {
    supportsImdb: false,
    supportsYear: false,
    episodeFormat: "episode",
    needsUrlEncoding: true,
  },
  rutor: {
    supportsImdb: false,
    supportsYear: true,
    episodeFormat: "SxxExx",
    needsUrlEncoding: true,
  },
  torrentio: {
    supportsImdb: true,
    supportsYear: false,
    episodeFormat: "SxxExx",
    needsUrlEncoding: false,
  },
};

// ============================================================================
// QUERY BUILDER
// ============================================================================

export class QueryBuilder {
  private config: ProviderQueryConfig;
  public readonly providerId: string;

  constructor(providerId: string) {
    this.providerId = providerId;
    this.config = PROVIDER_QUERY_CONFIGS[providerId] || {
      supportsImdb: false,
      supportsYear: true,
      episodeFormat: "SxxExx",
      needsUrlEncoding: true,
    };
  }

  /**
   * Build query variants for a media query
   * Returns primary query first, then fallbacks
   */
  buildQueries(
    query: MediaQuery,
    alternativeTitles?: string[],
  ): QueryVariant[] {
    const variants: QueryVariant[] = [];

    // If provider supports IMDB search, use that as primary
    if (this.config.supportsImdb && query.imdbId) {
      variants.push({
        query: query.imdbId,
        type: "primary",
        description: "IMDB ID search",
      });
    }

    // Build title-based queries
    if (query.type === "movie") {
      variants.push(...this.buildMovieQueries(query, alternativeTitles));
    } else {
      variants.push(...this.buildSeriesQueries(query, alternativeTitles));
    }

    return variants;
  }

  private buildMovieQueries(
    query: MediaQuery,
    alternativeTitles?: string[],
  ): QueryVariant[] {
    const variants: QueryVariant[] = [];
    const normalizedTitle = normalizeTitle(query.title);

    // Primary: title + year
    if (this.config.supportsYear && query.year) {
      variants.push({
        query: `${normalizedTitle} ${query.year}`,
        type: "primary",
        description: "Title + year",
      });
    } else {
      variants.push({
        query: normalizedTitle,
        type: "primary",
        description: "Title only",
      });
    }

    // Fallback: title without year
    if (query.year) {
      variants.push({
        query: normalizedTitle,
        type: "fallback",
        description: "Title without year",
      });
    }

    // Fallback: simplified title
    const simplified = simplifyTitle(query.title);
    if (simplified !== normalizedTitle && simplified.length > 3) {
      variants.push({
        query:
          this.config.supportsYear && query.year
            ? `${simplified} ${query.year}`
            : simplified,
        type: "fallback",
        description: "Simplified title",
      });
    }

    // Alternative titles
    const alternatives = getAlternativeTitles(query.title, alternativeTitles);
    for (const alt of alternatives) {
      if (!variants.some((v) => v.query.includes(alt))) {
        variants.push({
          query:
            this.config.supportsYear && query.year
              ? `${alt} ${query.year}`
              : alt,
          type: "alternative",
          description: `Alternative: ${alt}`,
        });
      }
    }

    return this.applyLimits(variants);
  }

  private buildSeriesQueries(
    query: MediaQuery,
    alternativeTitles?: string[],
  ): QueryVariant[] {
    const variants: QueryVariant[] = [];
    const normalizedTitle = normalizeTitle(query.title);
    const episodeStr =
      query.season !== undefined && query.episode !== undefined
        ? formatEpisode(query.season, query.episode, this.config.episodeFormat)
        : "";

    // Primary: title + episode
    variants.push({
      query: episodeStr ? `${normalizedTitle} ${episodeStr}` : normalizedTitle,
      type: "primary",
      description: "Title + episode",
    });

    // Fallback: title + season only
    if (query.season !== undefined && query.episode !== undefined) {
      const seasonOnly = `S${String(query.season).padStart(2, "0")}`;
      variants.push({
        query: `${normalizedTitle} ${seasonOnly}`,
        type: "fallback",
        description: "Title + season only",
      });
    }

    // Fallback: title + year + episode
    if (query.year && episodeStr) {
      variants.push({
        query: `${normalizedTitle} ${query.year} ${episodeStr}`,
        type: "fallback",
        description: "Title + year + episode",
      });
    }

    // Fallback: simplified title + episode
    const simplified = simplifyTitle(query.title);
    if (simplified !== normalizedTitle && simplified.length > 3) {
      variants.push({
        query: episodeStr ? `${simplified} ${episodeStr}` : simplified,
        type: "fallback",
        description: "Simplified title + episode",
      });
    }

    // Alternative titles with episode
    const alternatives = getAlternativeTitles(query.title, alternativeTitles);
    for (const alt of alternatives.slice(0, 2)) {
      if (!variants.some((v) => v.query.includes(alt))) {
        variants.push({
          query: episodeStr ? `${alt} ${episodeStr}` : alt,
          type: "alternative",
          description: `Alternative: ${alt}`,
        });
      }
    }

    return this.applyLimits(variants);
  }

  private applyLimits(variants: QueryVariant[]): QueryVariant[] {
    if (!this.config.maxQueryLength) return variants;

    return variants.map((v) => ({
      ...v,
      query: v.query.slice(0, this.config.maxQueryLength),
    }));
  }

  /**
   * Get the primary query string
   */
  getPrimaryQuery(query: MediaQuery): string {
    const variants = this.buildQueries(query);
    return variants.find((v) => v.type === "primary")?.query || query.title;
  }

  /**
   * Get all fallback queries (excluding primary)
   */
  getFallbackQueries(
    query: MediaQuery,
    alternativeTitles?: string[],
  ): string[] {
    const variants = this.buildQueries(query, alternativeTitles);
    return variants.filter((v) => v.type !== "primary").map((v) => v.query);
  }
}

/**
 * Create a query builder for a specific provider
 */
export function createQueryBuilder(providerId: string): QueryBuilder {
  return new QueryBuilder(providerId);
}

/**
 * Quick helper to get the best search query for a provider
 */
export function getSearchQuery(
  providerId: string,
  query: MediaQuery,
  _alternativeTitles?: string[],
): string {
  const builder = new QueryBuilder(providerId);
  const config = PROVIDER_QUERY_CONFIGS[providerId];

  // Use IMDB if supported
  if (config?.supportsImdb && query.imdbId) {
    return query.imdbId;
  }

  // Note: alternativeTitles could be used for fallback queries
  return builder.getPrimaryQuery(query);
}
