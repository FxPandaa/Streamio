/**
 * Embedded MPV Player Component
 *
 * This component provides a fully-featured video player using embedded MPV
 * with audio/subtitle track switching, seek controls, and fullscreen support.
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  embeddedMpvService,
  type EmbeddedPlayerState,
  type AudioTrack,
  type SubtitleTrack,
} from "../services/embeddedMpvService";
import { openSubtitlesService, type Subtitle } from "../services";
import { useSettingsStore } from "../stores/settingsStore";
import "./EmbeddedMpvPlayer.css";

export interface EpisodeInfo {
  id: string;
  episodeNumber: number;
  name: string;
  still?: string;
  progress?: number;
}

interface EmbeddedMpvPlayerProps {
  url: string;
  title?: string;
  imdbId?: string;
  season?: number;
  episode?: number;
  onClose?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onProgress?: (position: number, duration: number) => void;
  initialPosition?: number;
  preferredAudioLang?: string;
  preferredSubtitleLang?: string;
  autoPlay?: boolean;
  // Episode navigation
  isSeries?: boolean;
  currentEpisode?: number;
  episodes?: EpisodeInfo[];
  onEpisodeSelect?: (episodeNumber: number) => void;
  onNextEpisode?: () => void;
  blurUnwatched?: boolean;
}

export function EmbeddedMpvPlayer({
  url,
  title,
  imdbId,
  season,
  episode,
  onClose,
  onEnded,
  onError,
  onProgress,
  initialPosition,
  preferredAudioLang = "eng",
  preferredSubtitleLang = "eng",
  autoPlay = true,
  isSeries = false,
  currentEpisode,
  episodes = [],
  onEpisodeSelect,
  onNextEpisode,
  blurUnwatched = false,
}: EmbeddedMpvPlayerProps) {
  const [state, setState] = useState<EmbeddedPlayerState | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showEpisodeMenu, setShowEpisodeMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subtitleDelay, setSubtitleDelay] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Online subtitles (Stremio OpenSubtitles addon)
  const [onlineSubtitles, setOnlineSubtitles] = useState<Subtitle[]>([]);
  const [isLoadingOnlineSubtitles, setIsLoadingOnlineSubtitles] =
    useState(false);
  const [activeOnlineSubtitleId, setActiveOnlineSubtitleId] = useState<
    string | null
  >(null);
  const onlineSubtitleToMpvSidRef = useRef<Map<string, number>>(new Map());

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedPreferences = useRef(false);
  const hasSeekToInitial = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = state?.isPlaying ?? false;
  }, [state?.isPlaying]);

  // Initialize MPV and load the video
  useEffect(() => {
    // Skip if already loaded this URL
    if (loadedUrlRef.current === url) {
      console.log("Already loaded this URL, skipping:", url);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const initAndPlay = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize MPV
        console.log("Initializing MPV for URL:", url);
        await embeddedMpvService.initialize();

        if (!mounted) return;

        // Set video margins - no margins for true fullscreen
        // The controls overlay on top with gradients
        await embeddedMpvService.setMargins({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        });

        // Subscribe to state changes
        unsubscribe = embeddedMpvService.onPropertyChange(
          (updates: Partial<EmbeddedPlayerState>) => {
            if (!mounted) return;

            setState((prev: EmbeddedPlayerState | null) => ({
              ...(prev || embeddedMpvService.getState()),
              ...updates,
            }));

            // Check for EOF
            if (updates.eofReached) {
              onEnded?.();
            }

            // Report progress
            if (
              updates.position !== undefined ||
              updates.duration !== undefined
            ) {
              const currentState = embeddedMpvService.getState();
              onProgress?.(currentState.position, currentState.duration);
            }
          },
        );

        // Load the file
        console.log("Loading file in MPV:", url);
        await embeddedMpvService.loadFile(url);

        if (!mounted) {
          unsubscribe?.();
          return;
        }

        // Mark this URL as loaded
        loadedUrlRef.current = url;

        // Handle initial pause state
        if (autoPlay) {
          console.log("Auto-playing...");
          // Wait a moment for MPV to finish loading before setting pause state
          await new Promise((r) => setTimeout(r, 100));
          await embeddedMpvService.play();

          // Some mpv builds can briefly re-assert `pause` while loading.
          // Retry unpausing to ensure autoplay works reliably.
          setTimeout(() => {
            if (!mounted) return;
            const state = embeddedMpvService.getState();
            if (state.isPaused) {
              embeddedMpvService.play().catch((e) => {
                console.warn("Retry autoplay failed:", e);
              });
            }
          }, 750);
        } else {
          // Explicitly pause if autoplay is disabled
          await new Promise((r) => setTimeout(r, 100));
          await embeddedMpvService.pause().catch(() => undefined);
        }

        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        console.error("MPV initialization/load error:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
      }
    };

    initAndPlay();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Apply preferred language once tracks are available
  useEffect(() => {
    if (hasAppliedPreferences.current) return;
    if (!state?.audioTracks.length) return;

    // Wait longer to ensure tracks are fully registered in MPV
    // Some formats take time to parse all streams
    const timer = setTimeout(() => {
      if (hasAppliedPreferences.current) return;
      hasAppliedPreferences.current = true;

      console.log("Applying preferred tracks:", {
        audioTracks: state.audioTracks.length,
        subtitleTracks: state.subtitleTracks.length,
      });

      // Find and select preferred audio track
      const preferredAudio = state.audioTracks.find((t: AudioTrack) =>
        t.lang?.toLowerCase().includes(preferredAudioLang.toLowerCase()),
      );
      if (preferredAudio && !preferredAudio.selected) {
        console.log("Setting preferred audio:", preferredAudio);
        embeddedMpvService.setAudioTrack(preferredAudio.id).catch((e) => {
          console.warn("Failed to set preferred audio track:", e);
        });
      }

      // Find and select preferred subtitle track
      if (state.subtitleTracks.length > 0) {
        const preferredSub = state.subtitleTracks.find((t: SubtitleTrack) =>
          t.lang?.toLowerCase().includes(preferredSubtitleLang.toLowerCase()),
        );
        if (preferredSub) {
          console.log("Setting preferred subtitle:", preferredSub);
          embeddedMpvService.setSubtitleTrack(preferredSub.id).catch((e) => {
            console.warn("Failed to set preferred subtitle track:", e);
          });
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    state?.audioTracks,
    state?.subtitleTracks,
    preferredAudioLang,
    preferredSubtitleLang,
  ]);

  // Seek to initial position once duration is known
  useEffect(() => {
    if (hasSeekToInitial.current) return;
    if (!initialPosition || !state?.duration) return;

    hasSeekToInitial.current = true;
    embeddedMpvService.seek(initialPosition);
  }, [initialPosition, state?.duration]);

  // Handle controls visibility and cursor hiding
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      // Use ref to get current playing state
      if (isPlayingRef.current) {
        setShowControls(false);
        setShowAudioMenu(false);
        setShowSubtitleMenu(false);
        setShowEpisodeMenu(false);
      }
    }, 3000);
  }, []);

  // Mouse movement shows controls
  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          embeddedMpvService.togglePause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          embeddedMpvService.seekRelative(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          embeddedMpvService.seekRelative(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          embeddedMpvService.setVolume(
            Math.min(100, (state?.volume || 100) + 5),
          );
          break;
        case "ArrowDown":
          e.preventDefault();
          embeddedMpvService.setVolume(Math.max(0, (state?.volume || 100) - 5));
          break;
        case "m":
          e.preventDefault();
          embeddedMpvService.toggleMute();
          break;
        case "f":
          e.preventDefault();
          handleToggleFullscreen();
          break;
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state?.volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      embeddedMpvService.stop();
    };
  }, []);

  // Click on video area toggles play/pause and shows controls
  const handleVideoAreaClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      embeddedMpvService.togglePause();
      showControlsTemporarily();
    },
    [showControlsTemporarily],
  );

  // Load online subtitles (OpenSubtitles via Stremio addon) for embedded MPV
  useEffect(() => {
    if (!imdbId) return;

    const { subtitles: subPrefs } = useSettingsStore.getState();
    if (!subPrefs.autoLoad) {
      setOnlineSubtitles([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoadingOnlineSubtitles(true);
      try {
        const languages = [
          subPrefs.defaultLanguage || preferredSubtitleLang,
          ...subPrefs.secondaryLanguages,
        ].filter(Boolean);

        const subs = await openSubtitlesService.search({
          imdbId,
          season,
          episode,
          languages,
        });

        if (cancelled) return;
        setOnlineSubtitles(subs);

        // Auto-select best subtitle: default language first, then top-rated.
        if (subs.length > 0) {
          const defaultLang = subPrefs.defaultLanguage || preferredSubtitleLang;
          const defaultLangSubs = subs.filter(
            (s) => s.languageCode === defaultLang,
          );
          const pool = defaultLangSubs.length > 0 ? defaultLangSubs : subs;
          const best = pool[0];

          // Prefer hearing impaired if enabled
          const bestHi = subPrefs.preferHearingImpaired
            ? pool.find((s) => s.hearing_impaired)
            : undefined;

          const chosen = bestHi || best;

          // Only autoload if we haven't selected something yet
          if (!activeOnlineSubtitleId) {
            await handleSelectOnlineSubtitle(chosen, true);
          }
        }
      } catch (e) {
        console.warn("Failed to load online subtitles:", e);
      } finally {
        if (!cancelled) setIsLoadingOnlineSubtitles(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imdbId, season, episode]);

  const handleSelectOnlineSubtitle = useCallback(
    async (subtitle: Subtitle | null, isAuto: boolean = false) => {
      if (!subtitle) {
        setActiveOnlineSubtitleId(null);
        try {
          await embeddedMpvService.setSubtitleTrack(0);
        } catch (e) {
          console.warn("Failed to disable subtitles:", e);
        }
        if (!isAuto) showControlsTemporarily();
        return;
      }

      const existingSid = onlineSubtitleToMpvSidRef.current.get(subtitle.id);
      if (existingSid) {
        setActiveOnlineSubtitleId(subtitle.id);
        try {
          await embeddedMpvService.setSubtitleTrack(existingSid);
        } catch (e) {
          console.warn("Failed to select existing online subtitle:", e);
        }
        if (!isAuto) showControlsTemporarily();
        return;
      }

      const sid = await embeddedMpvService.addExternalSubtitle(
        subtitle.downloadUrl,
        true,
      );

      if (sid) {
        onlineSubtitleToMpvSidRef.current.set(subtitle.id, sid);
        setActiveOnlineSubtitleId(subtitle.id);
      } else {
        console.warn("mpv did not report a selected sid after sub-add");
      }
      if (!isAuto) showControlsTemporarily();
    },
    [showControlsTemporarily],
  );

  const handleToggleFullscreen = useCallback(async () => {
    const window = getCurrentWindow();
    const newFullscreenState = !isFullscreen;
    await window.setFullscreen(newFullscreenState);
    setIsFullscreen(newFullscreenState);
  }, [isFullscreen]);

  const handleClose = useCallback(async () => {
    // Exit fullscreen before closing if needed
    if (isFullscreen) {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
    }
    await embeddedMpvService.stop();
    onClose?.();
  }, [onClose, isFullscreen]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseFloat(e.target.value);
    embeddedMpvService.seek(position);
  }, []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const volume = parseFloat(e.target.value);
      embeddedMpvService.setVolume(volume);
    },
    [],
  );

  const handleAudioTrackSelect = useCallback(async (track: AudioTrack) => {
    console.log("Selecting audio track:", track);
    setShowAudioMenu(false);
    try {
      await embeddedMpvService.setAudioTrack(track.id);
      console.log("Audio track set successfully");
    } catch (e) {
      console.error("Failed to set audio track:", e);
    }
  }, []);

  const handleSubtitleTrackSelect = useCallback(
    async (track: SubtitleTrack | null) => {
      console.log("Selecting embedded subtitle track:", track);
      // Clear online subtitle selection when selecting embedded track
      setActiveOnlineSubtitleId(null);
      setShowSubtitleMenu(false);

      try {
        if (track === null) {
          await embeddedMpvService.setSubtitleTrack(0);
        } else {
          await embeddedMpvService.setSubtitleTrack(track.id);
        }
        console.log("Subtitle track set successfully");
      } catch (e) {
        console.error("Failed to set subtitle track:", e);
      }
    },
    [],
  );

  const handleSubtitleDelayChange = useCallback(
    (delta: number) => {
      const newDelay = subtitleDelay + delta;
      setSubtitleDelay(newDelay);
      embeddedMpvService.setSubtitleDelay(newDelay);
    },
    [subtitleDelay],
  );

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Language code to name mapping
  const langNames: Record<string, string> = {
    eng: "English",
    en: "English",
    jpn: "Japanese",
    ja: "Japanese",
    spa: "Spanish",
    es: "Spanish",
    fre: "French",
    fr: "French",
    ger: "German",
    de: "German",
    ita: "Italian",
    it: "Italian",
    por: "Portuguese",
    pt: "Portuguese",
    rus: "Russian",
    ru: "Russian",
    chi: "Chinese",
    zh: "Chinese",
    kor: "Korean",
    ko: "Korean",
    ara: "Arabic",
    ar: "Arabic",
    hin: "Hindi",
    hi: "Hindi",
    und: "Unknown",
  };

  // Group tracks by language for better organization
  // Puts the preferred language first
  const groupTracksByLanguage = <T extends AudioTrack | SubtitleTrack>(
    tracks: T[],
    preferredLang: string,
  ): Map<string, T[]> => {
    const grouped = new Map<string, T[]>();

    tracks.forEach((track) => {
      const lang = track.lang?.toLowerCase() || "und";
      const langName = langNames[lang] || lang.toUpperCase();

      if (!grouped.has(langName)) {
        grouped.set(langName, []);
      }
      grouped.get(langName)!.push(track);
    });

    // Get preferred language name for sorting
    const prefLangName =
      langNames[preferredLang.toLowerCase()] || preferredLang.toUpperCase();

    // Sort by language name: English always first, then preferred (if not English), then alphabetical
    const sorted = new Map<string, T[]>();
    const entries = Array.from(grouped.entries()).sort((a, b) => {
      // English always first
      if (a[0] === "English") return -1;
      if (b[0] === "English") return 1;
      // Then preferred language (if not English)
      if (a[0] === prefLangName) return -1;
      if (b[0] === prefLangName) return 1;
      return a[0].localeCompare(b[0]);
    });
    entries.forEach(([key, value]) => sorted.set(key, value));

    return sorted;
  };

  // Get grouped audio and subtitle tracks - use preferred languages for ordering
  const groupedAudioTracks = state?.audioTracks
    ? groupTracksByLanguage(state.audioTracks, preferredAudioLang)
    : new Map();
  const groupedSubtitleTracks = state?.subtitleTracks
    ? groupTracksByLanguage(state.subtitleTracks, preferredSubtitleLang)
    : new Map();

  // Calculate progress percentage for CSS
  const progressPercent = state?.duration
    ? ((state?.position || 0) / state.duration) * 100
    : 0;

  if (error) {
    return (
      <div className="embedded-mpv-player embedded-mpv-player--error">
        <div className="embedded-mpv-error">
          <span className="embedded-mpv-error__icon">⚠️</span>
          <h3>Playback Error</h3>
          <p>{error}</p>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`embedded-mpv-player ${showControls ? "embedded-mpv-player--controls-visible" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (state?.isPlaying) {
          setShowControls(false);
          setShowAudioMenu(false);
          setShowSubtitleMenu(false);
        }
      }}
    >
      {/* The MPV video renders behind this transparent div - click to play/pause */}
      <div
        className="embedded-mpv-player__video-area"
        onClick={handleVideoAreaClick}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="embedded-mpv-player__loading">
          <div className="embedded-mpv-player__spinner" />
          <p>Loading...</p>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`embedded-mpv-player__controls ${showControls ? "visible" : ""}`}
      >
        {/* Top bar */}
        <div className="embedded-mpv-controls__top">
          <button
            className="embedded-mpv-btn embedded-mpv-btn--back"
            onClick={handleClose}
          >
            ← Back
          </button>
          <h2 className="embedded-mpv-controls__title">{title}</h2>
          <div className="embedded-mpv-controls__spacer" />
        </div>

        {/* Bottom bar */}
        <div className="embedded-mpv-controls__bottom">
          {/* Progress bar */}
          <div className="embedded-mpv-controls__progress">
            <span className="embedded-mpv-controls__time">
              {formatTime(state?.position || 0)}
            </span>
            <input
              type="range"
              className="embedded-mpv-controls__slider"
              min={0}
              max={state?.duration || 100}
              value={state?.position || 0}
              onChange={handleSeek}
              style={
                { "--progress": `${progressPercent}%` } as React.CSSProperties
              }
            />
            <span className="embedded-mpv-controls__time">
              {formatTime(state?.duration || 0)}
            </span>
          </div>

          {/* Control buttons */}
          <div className="embedded-mpv-controls__buttons">
            {/* Play/Pause */}
            <button
              className="embedded-mpv-btn"
              onClick={() => embeddedMpvService.togglePause()}
              title={state?.isPaused ? "Play" : "Pause"}
            >
              {state?.isPaused ? "▶" : "⏸"}
            </button>

            {/* Volume */}
            <button
              className="embedded-mpv-btn"
              onClick={() => embeddedMpvService.toggleMute()}
              title={state?.muted ? "Unmute" : "Mute"}
            >
              {state?.muted || (state?.volume ?? 100) === 0 ? "🔇" : "🔊"}
            </button>
            <input
              type="range"
              className="embedded-mpv-controls__volume-slider"
              min={0}
              max={100}
              value={state?.muted ? 0 : (state?.volume ?? 100)}
              onChange={handleVolumeChange}
            />

            <div className="embedded-mpv-controls__spacer" />

            {/* Episodes button for series */}
            {isSeries && episodes.length > 0 && (
              <button
                className="embedded-mpv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEpisodeMenu(!showEpisodeMenu);
                  setShowAudioMenu(false);
                  setShowSubtitleMenu(false);
                }}
                title="Episodes"
              >
                📺 Episodes
              </button>
            )}

            {/* Next Episode button for series */}
            {isSeries && onNextEpisode && (
              <button
                className="embedded-mpv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextEpisode();
                }}
                title="Next Episode"
              >
                ⏭
              </button>
            )}

            {/* Audio track selector */}
            <div className="embedded-mpv-controls__dropdown">
              <button
                className="embedded-mpv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAudioMenu(!showAudioMenu);
                  setShowSubtitleMenu(false);
                  setShowEpisodeMenu(false);
                }}
                title="Audio Track"
              >
                🔈 Audio
              </button>
              {showAudioMenu && (
                <div
                  className="embedded-mpv-dropdown__menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="embedded-mpv-dropdown__header">
                    Audio Tracks
                  </div>
                  {groupedAudioTracks.size === 0 ? (
                    <div className="embedded-mpv-dropdown__item">
                      No audio tracks
                    </div>
                  ) : (
                    Array.from(groupedAudioTracks.entries()).map(
                      ([langName, tracks]) => (
                        <div
                          key={langName}
                          className="embedded-mpv-dropdown__group"
                        >
                          <div className="embedded-mpv-dropdown__group-header">
                            {langName}
                          </div>
                          {tracks.map((track: AudioTrack) => (
                            <button
                              key={track.id}
                              className={`embedded-mpv-dropdown__item ${track.selected ? "selected" : ""}`}
                              onClick={() => handleAudioTrackSelect(track)}
                            >
                              {track.selected && "✓ "}
                              {track.codec?.toUpperCase() || ""}{" "}
                              {track.channels
                                ? track.channels === 6
                                  ? "5.1"
                                  : track.channels === 8
                                    ? "7.1"
                                    : `${track.channels}ch`
                                : ""}
                            </button>
                          ))}
                        </div>
                      ),
                    )
                  )}
                </div>
              )}
            </div>

            {/* Subtitle selector */}
            <div className="embedded-mpv-controls__dropdown">
              <button
                className="embedded-mpv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubtitleMenu(!showSubtitleMenu);
                  setShowAudioMenu(false);
                  setShowEpisodeMenu(false);
                }}
                title="Subtitles"
              >
                CC
              </button>
              {showSubtitleMenu && (
                <div
                  className="embedded-mpv-dropdown__menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="embedded-mpv-dropdown__header">Subtitles</div>

                  {/* Off button at top */}
                  <button
                    className={`embedded-mpv-dropdown__item ${!activeOnlineSubtitleId && state?.currentSubtitleTrack === 0 ? "selected" : ""}`}
                    onClick={() => {
                      setActiveOnlineSubtitleId(null);
                      handleSubtitleTrackSelect(null);
                    }}
                  >
                    {!activeOnlineSubtitleId &&
                      state?.currentSubtitleTrack === 0 &&
                      "✓ "}
                    Off
                  </button>

                  <div className="embedded-mpv-dropdown__divider" />

                  {/* Merged subtitles by language - Embedded and Online mixed together */}
                  {(() => {
                    // Build a combined map: language -> {embedded: [], online: []}
                    const mergedByLang = new Map<
                      string,
                      { embedded: SubtitleTrack[]; online: Subtitle[] }
                    >();

                    // Add embedded tracks
                    if (groupedSubtitleTracks.size > 0) {
                      Array.from(groupedSubtitleTracks.entries()).forEach(
                        ([langName, tracks]) => {
                          if (!mergedByLang.has(langName)) {
                            mergedByLang.set(langName, {
                              embedded: [],
                              online: [],
                            });
                          }
                          mergedByLang.get(langName)!.embedded = tracks;
                        },
                      );
                    }

                    // Add online subtitles
                    if (
                      !isLoadingOnlineSubtitles &&
                      onlineSubtitles.length > 0
                    ) {
                      onlineSubtitles.forEach((s) => {
                        const langName =
                          s.language || s.languageCode || "Unknown";
                        if (!mergedByLang.has(langName)) {
                          mergedByLang.set(langName, {
                            embedded: [],
                            online: [],
                          });
                        }
                        mergedByLang.get(langName)!.online.push(s);
                      });
                    }

                    // Sort languages: English first, then alphabetical
                    const sortedEntries = Array.from(
                      mergedByLang.entries(),
                    ).sort(([a], [b]) => {
                      const aIsEnglish = a.toLowerCase() === "english";
                      const bIsEnglish = b.toLowerCase() === "english";
                      if (aIsEnglish && !bIsEnglish) return -1;
                      if (!aIsEnglish && bIsEnglish) return 1;
                      return a.localeCompare(b);
                    });

                    if (sortedEntries.length === 0) {
                      return (
                        <div className="embedded-mpv-dropdown__item">
                          {isLoadingOnlineSubtitles
                            ? "Loading subtitles..."
                            : "No subtitles available"}
                        </div>
                      );
                    }

                    return sortedEntries.map(
                      ([langName, { embedded, online }]) => {
                        // Sort online subs by rating
                        const sortedOnline = [...online]
                          .sort((x, y) => {
                            if (y.rating !== x.rating)
                              return y.rating - x.rating;
                            return (y.downloads || 0) - (x.downloads || 0);
                          })
                          .slice(0, 20);

                        return (
                          <div
                            key={`merged-${langName}`}
                            className="embedded-mpv-dropdown__group"
                          >
                            <div className="embedded-mpv-dropdown__group-header">
                              {langName}
                            </div>
                            {/* Embedded tracks first */}
                            {embedded.map((track) => (
                              <button
                                key={`emb-${track.id}`}
                                className={`embedded-mpv-dropdown__item ${!activeOnlineSubtitleId && track.selected ? "selected" : ""}`}
                                onClick={() => handleSubtitleTrackSelect(track)}
                              >
                                {!activeOnlineSubtitleId &&
                                  track.selected &&
                                  "✓ "}
                                📁{" "}
                                {track.title ||
                                  track.codec?.toUpperCase() ||
                                  `Track ${track.id}`}
                              </button>
                            ))}
                            {/* Online subtitles after */}
                            {sortedOnline.map((sub) => (
                              <button
                                key={`onl-${sub.id}`}
                                className={`embedded-mpv-dropdown__item ${activeOnlineSubtitleId === sub.id ? "selected" : ""}`}
                                onClick={() => handleSelectOnlineSubtitle(sub)}
                                title={sub.fileName}
                              >
                                {activeOnlineSubtitleId === sub.id && "✓ "}🌐 ★{" "}
                                {sub.rating.toFixed(1)}
                                {sub.hearing_impaired ? " • HI" : ""}
                              </button>
                            ))}
                          </div>
                        );
                      },
                    );
                  })()}

                  <div className="embedded-mpv-dropdown__divider" />
                  <div className="embedded-mpv-dropdown__header">
                    Subtitle Delay
                  </div>
                  <div className="embedded-mpv-dropdown__delay">
                    <button onClick={() => handleSubtitleDelayChange(-0.1)}>
                      -0.1s
                    </button>
                    <span>{subtitleDelay.toFixed(1)}s</span>
                    <button onClick={() => handleSubtitleDelayChange(0.1)}>
                      +0.1s
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              className="embedded-mpv-btn"
              onClick={handleToggleFullscreen}
              title="Fullscreen"
            >
              {isFullscreen ? "⊙" : "⛶"}
            </button>
          </div>
        </div>
      </div>

      {/* Episode Menu Overlay */}
      {showEpisodeMenu && isSeries && episodes.length > 0 && (
        <div
          className="embedded-mpv-episode-overlay"
          onClick={() => setShowEpisodeMenu(false)}
        >
          <div
            className="embedded-mpv-episode-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="embedded-mpv-episode-header">
              <h3>Episodes</h3>
              <button
                className="embedded-mpv-episode-close"
                onClick={() => setShowEpisodeMenu(false)}
              >
                ✕
              </button>
            </div>
            <div className="embedded-mpv-episode-list">
              {episodes.map((ep) => {
                const isCurrent = ep.episodeNumber === currentEpisode;
                const isWatched = ep.progress !== undefined && ep.progress > 0;
                const shouldBlur = blurUnwatched && !isWatched && ep.still;
                return (
                  <div
                    key={ep.id}
                    className={`embedded-mpv-episode-item ${isCurrent ? "current" : ""}`}
                    onClick={() => {
                      if (!isCurrent && onEpisodeSelect) {
                        onEpisodeSelect(ep.episodeNumber);
                        setShowEpisodeMenu(false);
                      }
                    }}
                  >
                    <div
                      className={`embedded-mpv-episode-thumbnail ${shouldBlur ? "blur" : ""}`}
                    >
                      {ep.still ? (
                        <img src={ep.still} alt={ep.name} />
                      ) : (
                        <div className="embedded-mpv-episode-placeholder">
                          📺
                        </div>
                      )}
                      {isCurrent && (
                        <div className="embedded-mpv-episode-playing">
                          ▶ Now Playing
                        </div>
                      )}
                      {ep.progress !== undefined &&
                        ep.progress > 0 &&
                        !isCurrent && (
                          <div className="embedded-mpv-episode-progress">
                            <div
                              className="embedded-mpv-episode-progress-fill"
                              style={{ width: `${ep.progress}%` }}
                            />
                          </div>
                        )}
                    </div>
                    <div className="embedded-mpv-episode-info">
                      <span className="embedded-mpv-episode-num">
                        E{ep.episodeNumber}
                      </span>
                      <span className="embedded-mpv-episode-title">
                        {ep.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmbeddedMpvPlayer;
