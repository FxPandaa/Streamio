import { scrapers, Scraper } from "./scrapers.ts";
import { TorrentResult, MediaQuery, ScrapingResult } from "./types";
import { useSettingsStore } from "../../stores/settingsStore";
import { scrapingDebugger } from "./debugger";
import {
  rankAndFilterTorrents,
  getConfigFromPreferences,
  RankedTorrent,
  QualityPreset,
} from "./ranking";

export class ScrapingEngine {
  private timeout: number;
  private debugMode: boolean = false;

  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
    if (enabled) {
      scrapingDebugger.enableDebugMode();
    } else {
      scrapingDebugger.disableDebugMode();
    }
  }

  async search(query: MediaQuery): Promise<ScrapingResult[]> {
    const settings = useSettingsStore.getState();
    // Get enabled scrapers but exclude torrentio (handled separately as backup)
    const enabledScrapers = scrapers.filter(
      (s: Scraper) =>
        settings.enabledScrapers.includes(s.id) && s.id !== "torrentio",
    );

    if (enabledScrapers.length === 0) {
      console.warn("No in-app scrapers enabled");
      return [];
    }

    console.log(
      `Running ${enabledScrapers.length} scrapers:`,
      enabledScrapers.map((s) => s.id),
    );

    // Start debug tracking
    if (this.debugMode) {
      scrapingDebugger.startSearch(query);
    }

    // Run all scrapers in parallel with timeout
    const results = await Promise.allSettled(
      enabledScrapers.map((scraper: Scraper) =>
        this.runScraper(scraper, query),
      ),
    );

    return results.map(
      (result: PromiseSettledResult<ScrapingResult>, index: number) => {
        const scraper = enabledScrapers[index];

        if (result.status === "fulfilled") {
          return result.value;
        } else {
          return {
            provider: scraper.name,
            results: [],
            error: result.reason?.message || "Unknown error",
            duration: 0,
          };
        }
      },
    );
  }

  private async runScraper(
    scraper: Scraper,
    query: MediaQuery,
  ): Promise<ScrapingResult> {
    const startTime = Date.now();

    // Start provider debug tracking
    if (this.debugMode) {
      scrapingDebugger.startProvider(scraper.id, scraper.name);
    }

    try {
      const results = await Promise.race([
        scraper.search(query),
        this.timeoutPromise(),
      ]);

      // End provider debug tracking
      if (this.debugMode) {
        scrapingDebugger.endProvider(
          scraper.id,
          results as TorrentResult[],
          200,
        );
      }

      return {
        provider: scraper.name,
        results: results as TorrentResult[],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorType = errorMessage.includes("timeout")
        ? "timeout"
        : errorMessage.includes("network") || errorMessage.includes("fetch")
          ? "network"
          : "unknown";

      // End provider debug tracking with error
      if (this.debugMode) {
        scrapingDebugger.endProvider(
          scraper.id,
          [],
          undefined,
          errorMessage,
          errorType,
        );
      }

      return {
        provider: scraper.name,
        results: [],
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Scraper timeout")), this.timeout);
    });
  }

  // Aggregate and sort results from all providers
  aggregateResults(scrapingResults: ScrapingResult[]): TorrentResult[] {
    const allResults: TorrentResult[] = [];

    for (const result of scrapingResults) {
      allResults.push(...result.results);
    }

    // Sort by quality and seeds
    return this.sortResults(allResults);
  }

  private sortResults(results: TorrentResult[]): TorrentResult[] {
    const qualityOrder: Record<string, number> = {
      "2160p": 5,
      "4K": 5,
      UHD: 5,
      "1080p": 4,
      "720p": 3,
      HDTV: 2,
      "480p": 1,
      Unknown: 0,
    };

    return results.sort((a, b) => {
      // First sort by quality
      const qualityDiff =
        (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
      if (qualityDiff !== 0) return qualityDiff;

      // Then by seeds
      return b.seeds - a.seeds;
    });
  }

  // Filter results based on user preferences
  filterByQuality(
    results: TorrentResult[],
    preferredQuality: string,
  ): TorrentResult[] {
    if (preferredQuality === "auto") {
      return results;
    }

    const qualityMap: Record<string, string[]> = {
      "4k": ["2160p", "4K", "UHD"],
      "1080p": ["1080p"],
      "720p": ["720p"],
      "480p": ["480p"],
    };

    const preferredQualities = qualityMap[preferredQuality] || [];

    // First try to find exact matches
    const exactMatches = results.filter((r) =>
      preferredQualities.some((q) =>
        r.quality.toLowerCase().includes(q.toLowerCase()),
      ),
    );

    // If no exact matches, return all results
    return exactMatches.length > 0 ? exactMatches : results;
  }

  // Remove duplicates based on info hash
  deduplicateResults(results: TorrentResult[]): TorrentResult[] {
    const seen = new Set<string>();
    return results.filter((result) => {
      if (!result.infoHash) return true; // Keep results without infoHash
      if (seen.has(result.infoHash)) {
        return false;
      }
      seen.add(result.infoHash);
      return true;
    });
  }

  /**
   * Get debug report from the last search
   */
  getDebugReport() {
    return scrapingDebugger.getReport();
  }

  /**
   * Export debug report as JSON
   */
  exportDebugReportJSON(): string {
    return scrapingDebugger.exportReportAsJSON();
  }

  /**
   * Get human-readable debug summary
   */
  getDebugSummary(): string {
    return scrapingDebugger.generateSummary();
  }
}

// Export singleton instance
export const scrapingEngine = new ScrapingEngine();

/**
 * Enhanced search function with new ranking system
 */
export async function searchTorrents(
  query: MediaQuery,
  options?: {
    debugMode?: boolean;
    qualityPreset?: QualityPreset;
  },
): Promise<TorrentResult[]> {
  const settings = useSettingsStore.getState();
  // Use a shorter timeout for faster results (15s instead of 30s)
  const engine = new ScrapingEngine(Math.min(settings.scrapingTimeout, 15000));

  // Enable debug mode if requested
  if (options?.debugMode) {
    engine.setDebugMode(true);
  }

  console.log("Starting search with query:", query);
  console.log("Torrentio backup enabled:", settings.useTorrentioBackup);

  // Run in-app scrapers AND Torrentio in parallel for speed
  const torrentioScraper = settings.useTorrentioBackup
    ? scrapers.find((s: Scraper) => s.id === "torrentio")
    : null;

  const [inAppResultsRaw, torrentioResults] = await Promise.all([
    engine.search(query),
    torrentioScraper
      ? torrentioScraper.search(query).catch((err) => {
          console.error("Torrentio failed:", err);
          return [] as TorrentResult[];
        })
      : Promise.resolve([] as TorrentResult[]),
  ]);

  let aggregated = engine.aggregateResults(inAppResultsRaw);
  console.log(`In-app scrapers returned ${aggregated.length} results`);

  // Store in-app results for comparison
  const inAppResults = [...aggregated];

  // Merge Torrentio results if available
  if (torrentioResults.length > 0) {
    console.log(`Torrentio returned ${torrentioResults.length} results`);

    // Record comparison if debug mode
    if (options?.debugMode) {
      scrapingDebugger.recordTorrentioComparison(
        torrentioResults,
        inAppResults,
      );
    }

    // Merge results (Torrentio results come after in-app results)
    aggregated = [...aggregated, ...torrentioResults];
  }

  // Use new ranking system
  const rankingConfig = getConfigFromPreferences(
    settings.preferredQuality,
    options?.qualityPreset || "balanced",
  );

  const { ranked, stats } = rankAndFilterTorrents(aggregated, rankingConfig);

  console.log(`Ranking stats:`, stats);

  // Record aggregation in debug mode
  if (options?.debugMode) {
    scrapingDebugger.recordAggregation(ranked);
    scrapingDebugger.recordFiltering({
      inputCount: stats.inputCount,
      afterDeduplication: stats.afterDedupe,
      afterQualityFilter: stats.afterHardFilter,
      afterHealthFilter: stats.afterDedupe,
      finalCount: stats.finalCount,
      removedByDedupe: stats.inputCount - stats.afterDedupe,
      removedByQuality: 0,
      removedByHealth: 0,
    });
    scrapingDebugger.endSearch(ranked);
  }

  console.log(`Final results after ranking: ${ranked.length}`);

  // Return ranked results as TorrentResult[]
  return ranked.map((r: RankedTorrent) => ({
    id: r.id,
    title: r.title,
    size: r.size,
    sizeFormatted: r.sizeFormatted,
    seeds: r.seeds,
    peers: r.peers,
    quality: r.quality,
    codec: r.parsedInfo.codec || r.codec,
    source: r.parsedInfo.source || r.source,
    magnetUri: r.magnetUri,
    infoHash: r.infoHash,
    provider: r.provider,
  }));
}

/**
 * Search with debug mode enabled, returns results + debug report
 */
export async function searchTorrentsWithDebug(
  query: MediaQuery,
  qualityPreset?: QualityPreset,
) {
  const results = await searchTorrents(query, {
    debugMode: true,
    qualityPreset,
  });

  return {
    results,
    debugReport: scrapingDebugger.getReport(),
    debugSummary: scrapingDebugger.generateSummary(),
    debugJSON: scrapingDebugger.exportReportAsJSON(),
  };
}
