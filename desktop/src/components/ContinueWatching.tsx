import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WatchHistoryItem, useLibraryStore } from "../stores/libraryStore";
import "./ContinueWatching.css";

interface ContinueWatchingProps {
  items: WatchHistoryItem[];
}

export function ContinueWatching({ items }: ContinueWatchingProps) {
  if (items.length === 0) return null;

  return (
    <div className="continue-watching">
      <div className="continue-watching-header">
        <h2>Continue Watching</h2>
      </div>
      <div className="continue-watching-list">
        {items.slice(0, 10).map((item) => (
          <ContinueWatchingCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ContinueWatchingCard({ item }: { item: WatchHistoryItem }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { removeFromHistory } = useLibraryStore();
  const navigate = useNavigate();

  const remainingMinutes = Math.ceil(
    (item.duration * (100 - item.progress)) / 100 / 60,
  );

  const playerUrl =
    item.type === "movie"
      ? `/player/movie/${item.imdbId}`
      : `/player/series/${item.imdbId}/${item.season}/${item.episode}`;

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Pass saved torrent preferences if available
    const state = item.torrentInfoHash
      ? {
          savedTorrent: {
            infoHash: item.torrentInfoHash,
            title: item.torrentTitle,
            quality: item.torrentQuality,
            provider: item.torrentProvider,
          },
        }
      : undefined;
    navigate(playerUrl, { state });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromHistory(item.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="continue-card-wrapper">
      <div
        className="continue-card"
        onClick={handleCardClick}
        style={{ cursor: "pointer" }}
      >
        <div className="continue-card-poster">
          {item.poster ? (
            <img src={item.poster} alt={item.title} />
          ) : (
            <div className="continue-card-placeholder">
              {item.type === "movie" ? "🎬" : "📺"}
            </div>
          )}
          <div className="continue-card-overlay">
            <span className="play-button">▶</span>
          </div>
          <div className="continue-progress">
            <div
              className="continue-progress-fill"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <button
            className="delete-button"
            onClick={handleDeleteClick}
            title="Remove from Continue Watching"
          >
            ✕
          </button>
        </div>
        <div className="continue-card-info">
          <h3 className="continue-card-title">{item.title}</h3>
          {item.type === "series" && item.season && item.episode && (
            <span className="continue-card-episode">
              S{item.season}:E{item.episode}
              {item.episodeTitle && ` - ${item.episodeTitle}`}
            </span>
          )}
          <span className="continue-card-remaining">
            {remainingMinutes} min remaining
          </span>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="delete-confirm-overlay" onClick={handleCancelDelete}>
          <div
            className="delete-confirm-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Remove from Continue Watching?</h3>
            <p>This will delete your progress for "{item.title}"</p>
            <div className="delete-confirm-buttons">
              <button className="btn btn-ghost" onClick={handleCancelDelete}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
