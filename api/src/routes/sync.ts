/**
 * Streamio API - Sync Routes
 * Full cross-device synchronization for library, history, collections, and settings
 */

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/index.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// LIBRARY SYNC
// =============================================================================

/**
 * GET /sync/library
 * Get full library for the user
 */
router.get(
  "/library",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const items = db
      .prepare(`SELECT * FROM library WHERE user_id = ? ORDER BY added_at DESC`)
      .all(req.userId);

    // Transform to match desktop format
    const library = items.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.media_type,
      title: item.title,
      year: item.year,
      poster: item.poster,
      backdrop: item.backdrop,
      rating: item.rating,
      genres: item.genres_json ? JSON.parse(item.genres_json) : [],
      runtime: item.runtime,
      isFavorite: !!item.is_favorite,
      watchlist: !!item.watchlist,
      userRating: item.user_rating,
      notes: item.notes,
      tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      addedAt: item.added_at,
    }));

    res.json({ success: true, library });
  }),
);

/**
 * POST /sync/library
 * Sync full library from client (merge strategy: client wins for conflicts by timestamp)
 */
router.post(
  "/library",
  asyncHandler(async (req: Request, res: Response) => {
    const { library } = req.body as { library: any[] };
    const db = getDb();

    if (!Array.isArray(library)) {
      res.status(400).json({ success: false, error: "Invalid library data" });
      return;
    }

    const upsertStmt = db.prepare(`
      INSERT INTO library (
        id, user_id, imdb_id, media_type, title, year, poster, backdrop,
        rating, genres_json, runtime, is_favorite, watchlist, user_rating,
        notes, tags_json, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, imdb_id) DO UPDATE SET
        title = excluded.title,
        year = excluded.year,
        poster = excluded.poster,
        backdrop = excluded.backdrop,
        rating = excluded.rating,
        genres_json = excluded.genres_json,
        runtime = excluded.runtime,
        is_favorite = excluded.is_favorite,
        watchlist = excluded.watchlist,
        user_rating = excluded.user_rating,
        notes = excluded.notes,
        tags_json = excluded.tags_json,
        added_at = excluded.added_at
    `);

    const syncMany = db.transaction((items: any[]) => {
      for (const item of items) {
        upsertStmt.run(
          item.id || uuidv4(),
          req.userId,
          item.imdbId,
          item.type,
          item.title,
          item.year,
          item.poster,
          item.backdrop,
          item.rating,
          item.genres ? JSON.stringify(item.genres) : null,
          item.runtime,
          item.isFavorite ? 1 : 0,
          item.watchlist ? 1 : 0,
          item.userRating,
          item.notes,
          item.tags ? JSON.stringify(item.tags) : null,
          item.addedAt || new Date().toISOString(),
        );
      }
    });

    syncMany(library);

    // Get current server imdbIds
    const serverItems = db
      .prepare(`SELECT imdb_id FROM library WHERE user_id = ?`)
      .all(req.userId) as { imdb_id: string }[];
    const serverImdbIds = new Set(serverItems.map((i) => i.imdb_id));

    // Delete items not in client library
    const clientImdbIds = new Set(library.map((i) => i.imdbId));
    const toDelete = [...serverImdbIds].filter((id) => !clientImdbIds.has(id));

    if (toDelete.length > 0) {
      const deleteStmt = db.prepare(
        `DELETE FROM library WHERE user_id = ? AND imdb_id = ?`,
      );
      for (const imdbId of toDelete) {
        deleteStmt.run(req.userId, imdbId);
      }
    }

    res.json({
      success: true,
      message: "Library synced",
      count: library.length,
    });
  }),
);

// =============================================================================
// WATCH HISTORY SYNC
// =============================================================================

/**
 * GET /sync/history
 * Get full watch history for the user
 */
router.get(
  "/history",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const items = db
      .prepare(
        `SELECT * FROM watch_history WHERE user_id = ? ORDER BY last_watched_at DESC`,
      )
      .all(req.userId);

    // Transform to match desktop format
    const history = items.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.season ? "series" : "movie",
      title: item.title,
      poster: item.poster,
      season: item.season,
      episode: item.episode,
      episodeTitle: item.episode_title,
      progress:
        item.duration_seconds > 0
          ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
          : 0,
      duration: item.duration_seconds,
      currentTime: item.current_time || item.progress_seconds,
      watchedAt: item.last_watched_at,
      subtitleId: item.subtitle_id,
      subtitleOffset: item.subtitle_offset,
      audioTrackId: item.audio_track_id,
      torrentInfoHash: item.torrent_info_hash,
      torrentTitle: item.torrent_title,
      torrentQuality: item.torrent_quality,
      torrentProvider: item.torrent_provider,
    }));

    res.json({ success: true, history });
  }),
);

/**
 * POST /sync/history
 * Sync full watch history from client
 */
router.post(
  "/history",
  asyncHandler(async (req: Request, res: Response) => {
    const { history } = req.body as { history: any[] };
    const db = getDb();

    if (!Array.isArray(history)) {
      res.status(400).json({ success: false, error: "Invalid history data" });
      return;
    }

    const upsertStmt = db.prepare(`
      INSERT INTO watch_history (
        id, user_id, imdb_id, season, episode, progress_seconds, duration_seconds,
        last_watched_at, title, poster, episode_title, current_time,
        subtitle_id, subtitle_offset, audio_track_id,
        torrent_info_hash, torrent_title, torrent_quality, torrent_provider
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, imdb_id, season, episode) DO UPDATE SET
        progress_seconds = excluded.progress_seconds,
        duration_seconds = excluded.duration_seconds,
        last_watched_at = excluded.last_watched_at,
        title = excluded.title,
        poster = excluded.poster,
        episode_title = excluded.episode_title,
        current_time = excluded.current_time,
        subtitle_id = excluded.subtitle_id,
        subtitle_offset = excluded.subtitle_offset,
        audio_track_id = excluded.audio_track_id,
        torrent_info_hash = excluded.torrent_info_hash,
        torrent_title = excluded.torrent_title,
        torrent_quality = excluded.torrent_quality,
        torrent_provider = excluded.torrent_provider
    `);

    const syncMany = db.transaction((items: any[]) => {
      for (const item of items) {
        const progressSeconds =
          item.currentTime || Math.round((item.progress / 100) * item.duration);
        upsertStmt.run(
          item.id || uuidv4(),
          req.userId,
          item.imdbId,
          item.season || null,
          item.episode || null,
          progressSeconds,
          item.duration || 0,
          item.watchedAt || new Date().toISOString(),
          item.title,
          item.poster,
          item.episodeTitle,
          item.currentTime || progressSeconds,
          item.subtitleId,
          item.subtitleOffset,
          item.audioTrackId,
          item.torrentInfoHash,
          item.torrentTitle,
          item.torrentQuality,
          item.torrentProvider,
        );
      }
    });

    syncMany(history);

    res.json({
      success: true,
      message: "History synced",
      count: history.length,
    });
  }),
);

// =============================================================================
// COLLECTIONS SYNC
// =============================================================================

/**
 * GET /sync/collections
 * Get all user collections
 */
router.get(
  "/collections",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const items = db
      .prepare(
        `SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC`,
      )
      .all(req.userId);

    const collections = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      items: item.items_json ? JSON.parse(item.items_json) : [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    res.json({ success: true, collections });
  }),
);

/**
 * POST /sync/collections
 * Sync all collections from client
 */
router.post(
  "/collections",
  asyncHandler(async (req: Request, res: Response) => {
    const { collections } = req.body as { collections: any[] };
    const db = getDb();

    if (!Array.isArray(collections)) {
      res
        .status(400)
        .json({ success: false, error: "Invalid collections data" });
      return;
    }

    // Clear existing collections and replace with client data
    db.prepare(`DELETE FROM collections WHERE user_id = ?`).run(req.userId);

    const insertStmt = db.prepare(`
      INSERT INTO collections (id, user_id, name, description, items_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const syncMany = db.transaction((items: any[]) => {
      for (const item of items) {
        insertStmt.run(
          item.id || uuidv4(),
          req.userId,
          item.name,
          item.description,
          JSON.stringify(item.items || []),
          item.createdAt || new Date().toISOString(),
          item.updatedAt || new Date().toISOString(),
        );
      }
    });

    syncMany(collections);

    res.json({
      success: true,
      message: "Collections synced",
      count: collections.length,
    });
  }),
);

// =============================================================================
// SETTINGS SYNC (Debrid keys, scrapers, preferences)
// =============================================================================

/**
 * GET /sync/settings
 * Get user settings (debrid keys, enabled scrapers, preferences)
 */
router.get(
  "/settings",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const row = db
      .prepare(`SELECT settings_json FROM user_settings WHERE user_id = ?`)
      .get(req.userId) as { settings_json: string } | undefined;

    const settings = row ? JSON.parse(row.settings_json) : {};

    res.json({ success: true, settings });
  }),
);

/**
 * POST /sync/settings
 * Sync user settings from client
 * Stores: debridCredentials, activeDebridService, enabledScrapers,
 *         useTorrentioBackup, subtitles, subtitleAppearance, etc.
 */
router.post(
  "/settings",
  asyncHandler(async (req: Request, res: Response) => {
    const { settings } = req.body as { settings: Record<string, any> };
    const db = getDb();

    if (!settings || typeof settings !== "object") {
      res.status(400).json({ success: false, error: "Invalid settings data" });
      return;
    }

    db.prepare(
      `
      INSERT INTO user_settings (user_id, settings_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = datetime('now')
    `,
    ).run(req.userId, JSON.stringify(settings));

    res.json({ success: true, message: "Settings synced" });
  }),
);

// =============================================================================
// FULL SYNC (All data at once)
// =============================================================================

/**
 * GET /sync/all
 * Get all user data in one request (for initial login on new device)
 */
router.get(
  "/all",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    // Library
    const libraryItems = db
      .prepare(`SELECT * FROM library WHERE user_id = ? ORDER BY added_at DESC`)
      .all(req.userId);
    const library = libraryItems.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.media_type,
      title: item.title,
      year: item.year,
      poster: item.poster,
      backdrop: item.backdrop,
      rating: item.rating,
      genres: item.genres_json ? JSON.parse(item.genres_json) : [],
      runtime: item.runtime,
      isFavorite: !!item.is_favorite,
      watchlist: !!item.watchlist,
      userRating: item.user_rating,
      notes: item.notes,
      tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      addedAt: item.added_at,
    }));

    // History
    const historyItems = db
      .prepare(
        `SELECT * FROM watch_history WHERE user_id = ? ORDER BY last_watched_at DESC`,
      )
      .all(req.userId);
    const history = historyItems.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.season ? "series" : "movie",
      title: item.title,
      poster: item.poster,
      season: item.season,
      episode: item.episode,
      episodeTitle: item.episode_title,
      progress:
        item.duration_seconds > 0
          ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
          : 0,
      duration: item.duration_seconds,
      currentTime: item.current_time || item.progress_seconds,
      watchedAt: item.last_watched_at,
      subtitleId: item.subtitle_id,
      subtitleOffset: item.subtitle_offset,
      audioTrackId: item.audio_track_id,
      torrentInfoHash: item.torrent_info_hash,
      torrentTitle: item.torrent_title,
      torrentQuality: item.torrent_quality,
      torrentProvider: item.torrent_provider,
    }));

    // Collections
    const collectionItems = db
      .prepare(
        `SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC`,
      )
      .all(req.userId);
    const collections = collectionItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      items: item.items_json ? JSON.parse(item.items_json) : [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    // Settings
    const settingsRow = db
      .prepare(`SELECT settings_json FROM user_settings WHERE user_id = ?`)
      .get(req.userId) as { settings_json: string } | undefined;
    const settings = settingsRow ? JSON.parse(settingsRow.settings_json) : {};

    res.json({
      success: true,
      data: {
        library,
        history,
        collections,
        settings,
      },
    });
  }),
);

/**
 * POST /sync/all
 * Sync all user data in one request
 */
router.post(
  "/all",
  asyncHandler(async (req: Request, res: Response) => {
    const { library, history, collections, settings } = req.body;
    const db = getDb();

    const results: Record<string, { success: boolean; count?: number }> = {};

    // Sync library
    if (Array.isArray(library)) {
      const upsertLibrary = db.prepare(`
        INSERT INTO library (
          id, user_id, imdb_id, media_type, title, year, poster, backdrop,
          rating, genres_json, runtime, is_favorite, watchlist, user_rating,
          notes, tags_json, added_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, imdb_id) DO UPDATE SET
          title = excluded.title, year = excluded.year, poster = excluded.poster,
          backdrop = excluded.backdrop, rating = excluded.rating,
          genres_json = excluded.genres_json, runtime = excluded.runtime,
          is_favorite = excluded.is_favorite, watchlist = excluded.watchlist,
          user_rating = excluded.user_rating, notes = excluded.notes,
          tags_json = excluded.tags_json, added_at = excluded.added_at
      `);

      db.transaction(() => {
        for (const item of library) {
          upsertLibrary.run(
            item.id || uuidv4(),
            req.userId,
            item.imdbId,
            item.type,
            item.title,
            item.year,
            item.poster,
            item.backdrop,
            item.rating,
            item.genres ? JSON.stringify(item.genres) : null,
            item.runtime,
            item.isFavorite ? 1 : 0,
            item.watchlist ? 1 : 0,
            item.userRating,
            item.notes,
            item.tags ? JSON.stringify(item.tags) : null,
            item.addedAt || new Date().toISOString(),
          );
        }
      })();
      results.library = { success: true, count: library.length };
    }

    // Sync history
    if (Array.isArray(history)) {
      const upsertHistory = db.prepare(`
        INSERT INTO watch_history (
          id, user_id, imdb_id, season, episode, progress_seconds, duration_seconds,
          last_watched_at, title, poster, episode_title, current_time,
          subtitle_id, subtitle_offset, audio_track_id,
          torrent_info_hash, torrent_title, torrent_quality, torrent_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, imdb_id, season, episode) DO UPDATE SET
          progress_seconds = excluded.progress_seconds, duration_seconds = excluded.duration_seconds,
          last_watched_at = excluded.last_watched_at, title = excluded.title, poster = excluded.poster,
          episode_title = excluded.episode_title, current_time = excluded.current_time,
          subtitle_id = excluded.subtitle_id, subtitle_offset = excluded.subtitle_offset,
          audio_track_id = excluded.audio_track_id, torrent_info_hash = excluded.torrent_info_hash,
          torrent_title = excluded.torrent_title, torrent_quality = excluded.torrent_quality,
          torrent_provider = excluded.torrent_provider
      `);

      db.transaction(() => {
        for (const item of history) {
          const progressSeconds =
            item.currentTime ||
            Math.round((item.progress / 100) * item.duration);
          upsertHistory.run(
            item.id || uuidv4(),
            req.userId,
            item.imdbId,
            item.season || null,
            item.episode || null,
            progressSeconds,
            item.duration || 0,
            item.watchedAt || new Date().toISOString(),
            item.title,
            item.poster,
            item.episodeTitle,
            item.currentTime || progressSeconds,
            item.subtitleId,
            item.subtitleOffset,
            item.audioTrackId,
            item.torrentInfoHash,
            item.torrentTitle,
            item.torrentQuality,
            item.torrentProvider,
          );
        }
      })();
      results.history = { success: true, count: history.length };
    }

    // Sync collections
    if (Array.isArray(collections)) {
      db.prepare(`DELETE FROM collections WHERE user_id = ?`).run(req.userId);
      const insertCollection = db.prepare(`
        INSERT INTO collections (id, user_id, name, description, items_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const item of collections) {
          insertCollection.run(
            item.id || uuidv4(),
            req.userId,
            item.name,
            item.description,
            JSON.stringify(item.items || []),
            item.createdAt || new Date().toISOString(),
            item.updatedAt || new Date().toISOString(),
          );
        }
      })();
      results.collections = { success: true, count: collections.length };
    }

    // Sync settings
    if (settings && typeof settings === "object") {
      db.prepare(
        `
        INSERT INTO user_settings (user_id, settings_json, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          settings_json = excluded.settings_json,
          updated_at = datetime('now')
      `,
      ).run(req.userId, JSON.stringify(settings));
      results.settings = { success: true };
    }

    res.json({ success: true, message: "Full sync complete", results });
  }),
);

export default router;
