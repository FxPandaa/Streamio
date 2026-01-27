import { useState } from "react";
import {
  useSettingsStore,
  DebridService,
  DebridServiceKey,
  PlayerType,
} from "../stores";
import { debridService } from "../services/debrid";
import { SUBTITLE_LANGUAGES } from "../utils/subtitleLanguages";
import { scrapers } from "../services/scraping/scrapers";
import "./SettingsPage.css";

// In-app scrapers grouped by category
const SCRAPER_CATEGORIES = {
  general: { name: "General", icon: "🌐" },
  anime: { name: "Anime", icon: "🎌" },
} as const;

// Font options for subtitles
const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans Serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
  { value: "'Arial', sans-serif", label: "Arial" },
  { value: "'Roboto', sans-serif", label: "Roboto" },
  { value: "'Open Sans', sans-serif", label: "Open Sans" },
];

export function SettingsPage() {
  const {
    activeDebridService,
    debridCredentials,
    autoPlay,
    autoPlayNext,
    skipIntro,
    skipOutro,
    playerType,
    enabledScrapers,
    useTorrentioBackup,
    scrapingTimeout,
    subtitles,
    subtitleAppearance,
    blurUnwatchedEpisodes,
    setDebridApiKey,
    removeDebridApiKey,
    setActiveDebridService,
    setAutoPlay,
    setAutoPlayNext,
    setSkipIntro,
    setSkipOutro,
    setPlayerType,
    toggleScraper,
    setUseTorrentioBackup,
    setScrapingTimeout,
    setSubtitleAutoLoad,
    setSubtitleLanguage,
    setPreferHearingImpaired,
    setSubtitleAppearance,
    setBlurUnwatchedEpisodes,
    resetSettings,
  } = useSettingsStore();

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [validatingService, setValidatingService] = useState<string | null>(
    null,
  );
  const [validationResult, setValidationResult] = useState<
    Record<string, boolean | null>
  >({});
  const [showScraperModal, setShowScraperModal] = useState(false);

  const handleApiKeyChange = (service: string, value: string) => {
    setApiKeyInputs((prev) => ({ ...prev, [service]: value }));
  };

  const handleSaveApiKey = async (service: DebridService) => {
    const apiKey = apiKeyInputs[service];
    if (!apiKey?.trim()) return;

    setValidatingService(service);
    setValidationResult((prev) => ({ ...prev, [service]: null }));

    try {
      const isValid = await debridService.validateApiKey(
        service,
        apiKey.trim(),
      );
      setValidationResult((prev) => ({ ...prev, [service]: isValid }));

      if (isValid) {
        setDebridApiKey(service, apiKey.trim());
        setApiKeyInputs((prev) => ({ ...prev, [service]: "" }));
      }
    } catch (error) {
      setValidationResult((prev) => ({ ...prev, [service]: false }));
    } finally {
      setValidatingService(null);
    }
  };

  const handleRemoveApiKey = (service: DebridService) => {
    removeDebridApiKey(service);
    setValidationResult((prev) => ({ ...prev, [service]: null }));
  };

  // Get in-app scrapers (exclude torrentio - that's separate backup)
  const inAppScrapers = scrapers.filter(
    (s) => s.id !== "torrentio" && s.id !== "jackett",
  );

  // Enable/disable all scrapers in a category
  const toggleCategory = (category: string, enable: boolean) => {
    inAppScrapers.forEach((scraper) => {
      const isAnime = scraper.specialty === "anime";
      const matchesCategory = category === "anime" ? isAnime : !isAnime;

      if (matchesCategory) {
        const isEnabled = enabledScrapers.includes(scraper.id);
        if (enable && !isEnabled) {
          toggleScraper(scraper.id);
        } else if (!enable && isEnabled) {
          toggleScraper(scraper.id);
        }
      }
    });
  };

  // Group scrapers by category (General vs Anime)
  const getScrapersByCategory = () => {
    const grouped: Record<
      string,
      { id: string; name: string; enabled: boolean }[]
    > = {
      general: [],
      anime: [],
    };

    inAppScrapers.forEach((scraper) => {
      const category = scraper.specialty === "anime" ? "anime" : "general";
      grouped[category].push({
        id: scraper.id,
        name: scraper.name,
        enabled: enabledScrapers.includes(scraper.id),
      });
    });

    return grouped;
  };

  const debridServices: {
    id: DebridServiceKey;
    name: string;
    website: string;
  }[] = [
    {
      id: "realdebrid",
      name: "Real-Debrid",
      website: "https://real-debrid.com",
    },
    { id: "alldebrid", name: "AllDebrid", website: "https://alldebrid.com" },
    { id: "torbox", name: "TorBox", website: "https://torbox.app" },
    { id: "premiumize", name: "Premiumize", website: "https://premiumize.me" },
  ];

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      {/* Debrid Services */}
      <section className="settings-section">
        <h2>Debrid Services</h2>
        <p className="section-description">
          Connect a debrid service to stream torrents instantly without
          downloading.
        </p>

        <div className="debrid-list">
          {debridServices.map((service) => {
            const isConfigured = !!debridCredentials[service.id];
            const isActive = activeDebridService === service.id;
            const isValidating = validatingService === service.id;
            const validation = validationResult[service.id];

            return (
              <div key={service.id} className="debrid-item">
                <div className="debrid-header">
                  <div className="debrid-info">
                    <h3>{service.name}</h3>
                    <a
                      href={service.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="debrid-link"
                    >
                      {service.website}
                    </a>
                  </div>

                  {isConfigured && (
                    <div className="debrid-status">
                      {isActive && <span className="active-badge">Active</span>}
                      <span className="configured-badge">✓ Configured</span>
                    </div>
                  )}
                </div>

                {isConfigured ? (
                  <div className="debrid-configured">
                    <p>API key is configured</p>
                    <div className="debrid-actions">
                      {!isActive && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => setActiveDebridService(service.id)}
                        >
                          Set as Active
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleRemoveApiKey(service.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="debrid-setup">
                    <div className="api-key-input">
                      <input
                        type="password"
                        className="input"
                        placeholder="Enter API key"
                        value={apiKeyInputs[service.id] || ""}
                        onChange={(e) =>
                          handleApiKeyChange(service.id, e.target.value)
                        }
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => handleSaveApiKey(service.id)}
                        disabled={
                          isValidating || !apiKeyInputs[service.id]?.trim()
                        }
                      >
                        {isValidating ? "Validating..." : "Save"}
                      </button>
                    </div>
                    {validation === false && (
                      <p className="validation-error">Invalid API key</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Playback Settings */}
      <section className="settings-section">
        <h2>Playback</h2>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto Play</label>
            <p>Automatically start playing when a source is found</p>
          </div>
          <button
            className={`toggle ${autoPlay ? "active" : ""}`}
            onClick={() => setAutoPlay(!autoPlay)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto Play Next Episode</label>
            <p>Automatically play the next episode when one ends</p>
          </div>
          <button
            className={`toggle ${autoPlayNext ? "active" : ""}`}
            onClick={() => setAutoPlayNext(!autoPlayNext)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Skip Intro</label>
            <p>Automatically skip intros when available</p>
          </div>
          <button
            className={`toggle ${skipIntro ? "active" : ""}`}
            onClick={() => setSkipIntro(!skipIntro)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Skip Outro</label>
            <p>Automatically skip outros when available</p>
          </div>
          <button
            className={`toggle ${skipOutro ? "active" : ""}`}
            onClick={() => setSkipOutro(!skipOutro)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Video Player</label>
            <p>
              Choose your preferred video player. MPV offers better codec
              support.
            </p>
          </div>
          <select
            className="select"
            value={playerType}
            onChange={(e) => setPlayerType(e.target.value as PlayerType)}
          >
            <option value="default">Built-in Player</option>
            <option value="embedded-mpv">
              MPV Player (Better codec support)
            </option>
          </select>
        </div>
      </section>

      {/* Subtitles */}
      <section className="settings-section">
        <h2>Subtitles</h2>
        <p className="section-description">
          Configure automatic subtitle loading and language preferences.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto-load Subtitles</label>
            <p>Automatically fetch and load subtitles when playing content</p>
          </div>
          <button
            className={`toggle ${subtitles.autoLoad ? "active" : ""}`}
            onClick={() => setSubtitleAutoLoad(!subtitles.autoLoad)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Default Subtitle Language</label>
            <p>Primary language for automatic subtitle loading</p>
          </div>
          <select
            className="input select-input"
            value={subtitles.defaultLanguage}
            onChange={(e) => setSubtitleLanguage(e.target.value)}
          >
            {SUBTITLE_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.nativeName})
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Prefer Hearing Impaired</label>
            <p>Prefer subtitles with sound effect descriptions [door slams]</p>
          </div>
          <button
            className={`toggle ${subtitles.preferHearingImpaired ? "active" : ""}`}
            onClick={() =>
              setPreferHearingImpaired(!subtitles.preferHearingImpaired)
            }
          >
            <span className="toggle-handle" />
          </button>
        </div>

        {/* Subtitle Appearance */}
        <div className="subtitle-appearance-section">
          <h3>Subtitle Appearance</h3>

          {/* Preview - matches SubtitleOverlay exactly */}
          <div className="subtitle-preview">
            <div className="subtitle-preview-video">
              <div
                className="subtitle-preview-text"
                style={{
                  fontSize: `${subtitleAppearance.fontSize ?? 22}px`,
                  fontFamily: subtitleAppearance.fontFamily ?? "sans-serif",
                  color: subtitleAppearance.textColor ?? "#FFFFFF",
                  backgroundColor: (() => {
                    const hex = (
                      subtitleAppearance.backgroundColor ?? "#000000"
                    ).replace("#", "");
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, ${subtitleAppearance.backgroundOpacity ?? 0.75})`;
                  })(),
                  textShadow:
                    (subtitleAppearance.textShadow ?? false)
                      ? "2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.6)"
                      : "none",
                  lineHeight: subtitleAppearance.lineHeight ?? 1.4,
                  bottom: `${subtitleAppearance.bottomPosition ?? 10}%`,
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                  fontWeight: 500,
                  maxWidth: "80%",
                }}
              >
                This is how your subtitles will look
                <br />
                Second line of subtitle text
              </div>
            </div>
          </div>

          <div className="appearance-controls">
            <div className="appearance-row">
              <label>Font Size</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="16"
                  max="36"
                  value={subtitleAppearance.fontSize}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      fontSize: parseInt(e.target.value),
                    })
                  }
                />
                <span>{subtitleAppearance.fontSize}px</span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Font Family</label>
              <select
                className="input select-input"
                value={subtitleAppearance.fontFamily}
                onChange={(e) =>
                  setSubtitleAppearance({ fontFamily: e.target.value })
                }
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="appearance-row">
              <label>Text Color</label>
              <input
                type="color"
                value={subtitleAppearance.textColor}
                onChange={(e) =>
                  setSubtitleAppearance({ textColor: e.target.value })
                }
                className="color-input"
              />
            </div>

            <div className="appearance-row">
              <label>Background Color</label>
              <input
                type="color"
                value={subtitleAppearance.backgroundColor}
                onChange={(e) =>
                  setSubtitleAppearance({ backgroundColor: e.target.value })
                }
                className="color-input"
              />
            </div>

            <div className="appearance-row">
              <label>Background Opacity</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(subtitleAppearance.backgroundOpacity * 100)}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      backgroundOpacity: parseInt(e.target.value) / 100,
                    })
                  }
                />
                <span>
                  {Math.round(subtitleAppearance.backgroundOpacity * 100)}%
                </span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Text Shadow</label>
              <button
                className={`toggle ${subtitleAppearance.textShadow ? "active" : ""}`}
                onClick={() =>
                  setSubtitleAppearance({
                    textShadow: !subtitleAppearance.textShadow,
                  })
                }
              >
                <span className="toggle-handle" />
              </button>
            </div>

            <div className="appearance-row">
              <label>Line Spacing</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="12"
                  max="20"
                  step="1"
                  value={Math.round(
                    (subtitleAppearance.lineHeight ?? 1.4) * 10,
                  )}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      lineHeight: parseInt(e.target.value) / 10,
                    })
                  }
                />
                <span>
                  {(subtitleAppearance.lineHeight ?? 1.4).toFixed(1)}x
                </span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Bottom Position</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="5"
                  max="25"
                  value={subtitleAppearance.bottomPosition ?? 10}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      bottomPosition: parseInt(e.target.value),
                    })
                  }
                />
                <span>{subtitleAppearance.bottomPosition ?? 10}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Display Settings */}
      <section className="settings-section">
        <h2>Display</h2>
        <p className="section-description">
          Customize how content is displayed.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Blur Unwatched Episode Thumbnails</label>
            <p>
              Blur episode images to avoid spoilers until you start watching
            </p>
          </div>
          <button
            className={`toggle ${blurUnwatchedEpisodes ? "active" : ""}`}
            onClick={() => setBlurUnwatchedEpisodes(!blurUnwatchedEpisodes)}
          >
            <span className="toggle-handle" />
          </button>
        </div>
      </section>

      {/* Scraping Settings */}
      <section className="settings-section">
        <h2>Scrapers</h2>
        <p className="section-description">
          Configure which torrent sources to search. In-app scrapers search
          directly from torrent sites.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>In-App Scrapers</label>
            <p>
              {
                inAppScrapers.filter((s) => enabledScrapers.includes(s.id))
                  .length
              }{" "}
              of {inAppScrapers.length} scrapers enabled
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowScraperModal(true)}
          >
            Manage Scrapers
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Use Torrentio as Backup</label>
            <p>
              Enable Torrentio addon as fallback when in-app scrapers don't find
              results
            </p>
          </div>
          <button
            className={`toggle ${useTorrentioBackup ? "active" : ""}`}
            onClick={() => setUseTorrentioBackup(!useTorrentioBackup)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Scraping Timeout</label>
            <p>Maximum time to wait for scrapers (in seconds)</p>
          </div>
          <input
            type="number"
            className="input number-input"
            min="5"
            max="120"
            value={scrapingTimeout / 1000}
            onChange={(e) =>
              setScrapingTimeout(parseInt(e.target.value) * 1000)
            }
          />
        </div>
      </section>

      {/* Reset */}
      <section className="settings-section">
        <h2>Reset</h2>
        <button className="btn btn-ghost danger" onClick={resetSettings}>
          Reset All Settings
        </button>
      </section>

      {/* Scraper Modal */}
      {showScraperModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowScraperModal(false)}
        >
          <div
            className="modal-content scraper-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Manage Scrapers</h2>
              <button
                className="modal-close"
                onClick={() => setShowScraperModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-description">
                Select which torrent sources to search. More sources = more
                results but slower search.
              </p>

              {Object.entries(SCRAPER_CATEGORIES).map(
                ([categoryKey, category]) => {
                  const scrapers = getScrapersByCategory()[categoryKey] || [];
                  if (scrapers.length === 0) return null;

                  const enabledCount = scrapers.filter((s) => s.enabled).length;
                  const allEnabled = enabledCount === scrapers.length;

                  return (
                    <div key={categoryKey} className="scraper-category">
                      <div className="category-header">
                        <span className="category-icon">{category.icon}</span>
                        <span className="category-name">{category.name}</span>
                        <span className="category-count">
                          {enabledCount}/{scrapers.length}
                        </span>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() =>
                            toggleCategory(categoryKey, !allEnabled)
                          }
                        >
                          {allEnabled ? "Disable All" : "Enable All"}
                        </button>
                      </div>
                      <div className="scraper-list-grid">
                        {scrapers.map((scraper) => (
                          <label key={scraper.id} className="scraper-checkbox">
                            <input
                              type="checkbox"
                              checked={scraper.enabled}
                              onChange={() => toggleScraper(scraper.id)}
                            />
                            <span className="scraper-name">{scraper.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => setShowScraperModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
