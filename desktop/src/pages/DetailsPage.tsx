import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  cinemetaService,
  MovieDetails,
  SeriesDetails,
  Episode,
  searchTorrents,
  TorrentResult,
  debridService,
} from "../services";
import { useLibraryStore, useSettingsStore } from "../stores";
import { parseStreamInfo } from "../utils/streamParser";
import { useValidatedImage } from "../utils/useValidatedImage";
import { useFeatureGate } from "../hooks/useFeatureGate";
import "./DetailsPage.css";

type ContentType = "movie" | "series";

export function DetailsPage() {
  const { type, id } = useParams<{ type: ContentType; id: string }>();
  const navigate = useNavigate();

  const [details, setDetails] = useState<MovieDetails | SeriesDetails | null>(
    null,
  );
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [isSearchingTorrents, setIsSearchingTorrents] = useState(false);
  const [instantAvailability, setInstantAvailability] = useState<
    Map<string, boolean>
  >(new Map());

  const {
    isInLibrary,
    addToLibrary,
    removeFromLibrary,
    toggleFavorite,
    toggleWatchlist,
    setUserRating,
    library,
    collections,
    addToCollection,
    removeFromCollection,
    getWatchProgress,
  } = useLibraryStore();
  const { activeDebridService, blurUnwatchedEpisodes } = useSettingsStore();
  const { canUseNativeScrapers } = useFeatureGate();

  const isMovie = type === "movie";
  const validLogo = useValidatedImage(details?.logo);
  const inLibrary = details?.imdbId ? isInLibrary(details.imdbId) : false;
  const libraryItem = details?.imdbId
    ? library.find((item) => item.imdbId === details.imdbId)
    : null;
  const isFavorite = libraryItem?.isFavorite || false;
  const isWatchlist = libraryItem?.watchlist || false;
  const userRating = libraryItem?.userRating;

  useEffect(() => {
    if (id) {
      loadDetails(id);
    }
  }, [id, type]);

  useEffect(() => {
    if (type === "series" && details && "seasons" in details && id) {
      loadEpisodes(id, selectedSeason);
    }
  }, [selectedSeason, details]);

  const loadDetails = async (imdbId: string) => {
    setIsLoading(true);
    try {
      if (isMovie) {
        const movieDetails = await cinemetaService.getMovieDetails(imdbId);
        setDetails(movieDetails);
      } else {
        const seriesDetails = await cinemetaService.getSeriesDetails(imdbId);
        setDetails(seriesDetails);

        // Set initial season
        const firstSeason = seriesDetails.seasons?.find(
          (s) => s.seasonNumber > 0,
        );
        if (firstSeason) {
          setSelectedSeason(firstSeason.seasonNumber);
        }
      }
    } catch (error) {
      console.error("Failed to load details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEpisodes = async (imdbId: string, seasonNumber: number) => {
    try {
      const eps = await cinemetaService.getSeasonEpisodes(imdbId, seasonNumber);
      setEpisodes(eps);
    } catch (error) {
      console.error("Failed to load episodes:", error);
      setEpisodes([]);
    }
  };

  const handleSearchTorrents = async () => {
    if (!details?.imdbId) return;

    // Require debrid service to be configured
    if (activeDebridService === "none") {
      alert(
        "Please configure a debrid service (Real-Debrid or AllDebrid) in Settings first.",
      );
      return;
    }

    setIsSearchingTorrents(true);
    try {
      const results = await searchTorrents({
        imdbId: details.imdbId,
        type: type as "movie" | "series",
        title: details.title,
        year: details.year,
      });

      setTorrents(results);

      // Check instant availability with debrid
      if (results.length > 0) {
        try {
          const availability = await debridService.checkInstant(results);
          setInstantAvailability(availability);
        } catch (error) {
          console.error("Failed to check instant availability:", error);
        }
      }
    } catch (error) {
      console.error("Torrent search failed:", error);
    } finally {
      setIsSearchingTorrents(false);
    }
  };

  // Play directly when clicking a torrent
  const handleTorrentClick = (
    torrent: TorrentResult,
    season?: number,
    episode?: number,
  ) => {
    handlePlay(torrent, season, episode);
  };

  const handlePlay = (
    torrent?: TorrentResult,
    season?: number,
    episode?: number,
  ) => {
    if (isMovie) {
      navigate(`/player/${type}/${id}`, {
        state: { torrent, details },
      });
    } else {
      navigate(
        `/player/${type}/${id}/${season || selectedSeason}/${episode || 1}`,
        {
          state: { torrent, details },
        },
      );
    }
  };

  const handleLibraryToggle = () => {
    if (!details?.imdbId) return;

    if (inLibrary) {
      removeFromLibrary(details.imdbId);
    } else {
      addToLibrary({
        imdbId: details.imdbId,
        type: type as "movie" | "series",
        title: details.title,
        year: details.year || new Date().getFullYear(),
        poster: details.poster,
        backdrop: details.backdrop,
        rating: details.rating,
        genres: details.genres,
        runtime:
          isMovie && "runtime" in details
            ? Number(details.runtime) || undefined
            : undefined,
      });
    }
  };

  const handleFavoriteToggle = () => {
    if (!details?.imdbId || !inLibrary) return;
    toggleFavorite(details.imdbId);
  };

  const handleWatchlistToggle = () => {
    if (!details?.imdbId || !inLibrary) return;
    toggleWatchlist(details.imdbId);
  };

  const handleRatingChange = (rating: number) => {
    if (!details?.imdbId || !inLibrary) return;
    setUserRating(details.imdbId, rating);
  };

  const handleToggleCollectionItem = (collectionId: string) => {
    if (!details?.imdbId || !inLibrary) return;

    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;

    if (collection.items.includes(details.imdbId)) {
      removeFromCollection(collectionId, details.imdbId);
    } else {
      addToCollection(collectionId, details.imdbId);
    }
  };

  if (isLoading) {
    return (
      <div className="details-page details-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="details-page details-error">
        <h2>Content not found</h2>
        <Link to="/" className="btn btn-primary">
          Go Home
        </Link>
      </div>
    );
  }

  const seriesDetails = details as SeriesDetails;

  return (
    <div className="details-page">
      {/* Full-screen backdrop hero */}
      <div className="details-hero">
        <div
          className="details-backdrop"
          style={{
            backgroundImage: details.backdrop
              ? `url(${details.backdrop})`
              : "none",
          }}
        >
          <div className="details-backdrop-overlay"></div>
        </div>

        <div className="details-hero-content">
          {validLogo ? (
            <img className="details-logo" src={validLogo} alt={details.title} />
          ) : (
            <h1 className="details-title">{details.title}</h1>
          )}

          <div className="details-meta">
            <span className="meta-item">{details.year}</span>
            {details.rating > 0 && (
              <span className="meta-item">
                <span className="star">★</span> {details.rating.toFixed(1)}
              </span>
            )}
            {isMovie && (details as MovieDetails).runtime && (
              <span className="meta-item">
                {(details as MovieDetails).runtime} min
              </span>
            )}
            {!isMovie && seriesDetails.numberOfSeasons && (
              <span className="meta-item">
                {seriesDetails.numberOfSeasons} Season
                {seriesDetails.numberOfSeasons > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {details.genres && details.genres.length > 0 && (
            <div className="details-genres">
              {details.genres.map((genre) => (
                <span key={genre} className="genre-tag">
                  {genre}
                </span>
              ))}
            </div>
          )}

          <p className="details-overview">{details.overview}</p>

          <div className="details-actions">
            <button className="btn btn-primary" onClick={() => handlePlay()}>
              ▶ Play
            </button>

            <button
              className={`btn ${inLibrary ? "btn-secondary" : "btn-ghost"}`}
              onClick={handleLibraryToggle}
            >
              {inLibrary ? "✓ In Library" : "+ Add to Library"}
            </button>

            {inLibrary && (
              <>
                <button
                  className={`btn ${isFavorite ? "btn-favorite" : "btn-ghost"}`}
                  onClick={handleFavoriteToggle}
                  title="Toggle favorite"
                >
                  {isFavorite ? "★ Favorite" : "☆ Favorite"}
                </button>

                <button
                  className={`btn ${isWatchlist ? "btn-watchlist" : "btn-ghost"}`}
                  onClick={handleWatchlistToggle}
                  title="Toggle watchlist"
                >
                  {isWatchlist ? "✓ Watchlist" : "+ Watchlist"}
                </button>
              </>
            )}

            <button
              className="btn btn-ghost"
              onClick={handleSearchTorrents}
              disabled={isSearchingTorrents || activeDebridService === "none"}
              title={
                activeDebridService === "none"
                  ? "Configure a debrid service in Settings first"
                  : ""
              }
            >
              {isSearchingTorrents
                ? "Searching..."
                : activeDebridService === "none"
                  ? "Setup Debrid First"
                  : "Find Sources"}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content below the hero */}
      <div className="details-sections">
        {/* User rating, tags, notes - only show if in library */}
        {inLibrary && (
          <div className="details-section">
            <div className="details-user-content">
              <div className="user-rating">
                <h4>Your Rating</h4>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                    <button
                      key={star}
                      className={`star-btn ${userRating && userRating >= star ? "active" : ""}`}
                      onClick={() => handleRatingChange(star)}
                      title={`Rate ${star}/10`}
                    >
                      ★
                    </button>
                  ))}
                  {userRating && (
                    <span className="rating-value">{userRating}/10</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collections - only show if in library */}
        {inLibrary && collections.length > 0 && (
          <div className="details-section">
            <div className="details-collections">
              <h4>Collections</h4>
              <div className="collections-checkboxes">
                {collections.map((collection) => {
                  const isInCollection = collection.items.includes(
                    details.imdbId!,
                  );
                  return (
                    <label key={collection.id} className="collection-checkbox">
                      <input
                        type="checkbox"
                        checked={isInCollection}
                        onChange={() =>
                          handleToggleCollectionItem(collection.id)
                        }
                      />
                      <span>{collection.name}</span>
                      <span className="collection-count">
                        ({collection.items.length})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Cast */}
        {details.cast && details.cast.length > 0 && (
          <div className="details-section">
            <div className="details-cast">
              <h3>Cast</h3>
              <div className="cast-list">
                {details.cast.slice(0, 10).map((name, index) => (
                  <div key={index} className="cast-member">
                    <span className="cast-name">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Episodes for series */}
        {!isMovie &&
          seriesDetails.seasons &&
          seriesDetails.seasons.length > 0 && (
            <div className="details-section details-episodes">
              <div className="episodes-header">
                <h2>Episodes</h2>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                  className="season-select"
                >
                  {seriesDetails.seasons
                    .filter((s) => s.seasonNumber > 0)
                    .map((season) => (
                      <option key={season.id} value={season.seasonNumber}>
                        Season {season.seasonNumber}
                      </option>
                    ))}
                </select>
              </div>

              <div className="episodes-list">
                {episodes.map((episode) => {
                  const watchProgress = id
                    ? getWatchProgress(
                        id,
                        selectedSeason,
                        episode.episodeNumber,
                      )
                    : undefined;
                  const isWatched = watchProgress && watchProgress.progress > 0;
                  const shouldBlur =
                    blurUnwatchedEpisodes && !isWatched && episode.still;

                  return (
                    <div
                      key={episode.id}
                      className="episode-card"
                      onClick={() =>
                        handlePlay(
                          undefined,
                          selectedSeason,
                          episode.episodeNumber,
                        )
                      }
                    >
                      <div
                        className={`episode-thumbnail ${shouldBlur ? "episode-thumbnail-blur" : ""}`}
                      >
                        {episode.still ? (
                          <img src={episode.still} alt={episode.name} />
                        ) : (
                          <div className="episode-placeholder">📺</div>
                        )}
                        <div className="episode-play">▶</div>
                        {watchProgress && watchProgress.progress > 0 && (
                          <div className="episode-progress-bar">
                            <div
                              className="episode-progress-fill"
                              style={{ width: `${watchProgress.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="episode-info">
                        <span className="episode-number">
                          E{episode.episodeNumber}
                        </span>
                        <h4 className="episode-name">{episode.name}</h4>
                        {episode.overview && (
                          <p className="episode-overview">{episode.overview}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Free tier upsell banner */}
        {!canUseNativeScrapers && torrents.length > 0 && (
          <div className="free-tier-upsell">
            <span>
              Found {torrents.length} result{torrents.length !== 1 ? "s" : ""}{" "}
              from 1 addon source
            </span>
            <Link to="/settings" className="upsell-link">
              Vreamio+ searches 12 sources →
            </Link>
          </div>
        )}

        {/* Torrent results */}
        {torrents.length > 0 && (
          <div className="details-section details-torrents">
            <h2>Available Sources ({torrents.length})</h2>
            <div className="torrents-list">
              {torrents.map((torrent) => {
                const info = parseStreamInfo(torrent.title);
                return (
                  <div
                    key={torrent.id}
                    className="torrent-card"
                    onClick={() => handleTorrentClick(torrent)}
                  >
                    <div className="torrent-info">
                      <span className="torrent-title">{torrent.title}</span>
                      <div className="torrent-badges">
                        <span
                          className={`badge badge-resolution ${info.resolutionBadge === "4K" ? "badge-4k" : ""}`}
                        >
                          {info.resolutionBadge}
                        </span>
                        {info.hasDolbyVision && (
                          <span className="badge badge-hdr badge-dv">DV</span>
                        )}
                        {info.hasHDR10Plus && (
                          <span className="badge badge-hdr badge-hdr10plus">
                            HDR10+
                          </span>
                        )}
                        {info.isHDR &&
                          !info.hasDolbyVision &&
                          !info.hasHDR10Plus && (
                            <span className="badge badge-hdr">
                              {info.hdrType}
                            </span>
                          )}
                        {info.videoCodec && (
                          <span className="badge badge-codec">
                            {info.videoCodec}
                          </span>
                        )}
                        {info.hasAtmos && (
                          <span className="badge badge-atmos">Atmos</span>
                        )}
                        <span className="torrent-size">
                          {torrent.sizeFormatted}
                        </span>
                        <span className="torrent-seeds">↑ {torrent.seeds}</span>
                      </div>
                    </div>
                    {instantAvailability.get(torrent.infoHash) && (
                      <span className="instant-badge">⚡ Instant</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
