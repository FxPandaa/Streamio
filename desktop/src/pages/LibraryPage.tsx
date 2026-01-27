import { useState } from "react";
import { Link } from "react-router-dom";
import { useLibraryStore } from "../stores";
import { MediaCard } from "../components";
import { MediaItem } from "../services";
import "./LibraryPage.css";

export function LibraryPage() {
  const {
    library,
    watchHistory,
    collections,
    activeFilter,
    sortBy,
    searchQuery,
    setFilter,
    setSortBy,
    setSearchQuery,
    getFilteredLibrary,
    clearWatchHistory,
    createCollection,
    deleteCollection,
    renameCollection,
  } = useLibraryStore();

  const [showCollections, setShowCollections] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null,
  );

  const filteredLibrary = getFilteredLibrary();

  // Convert library items to MediaItem format for cinemeta
  const libraryItems: MediaItem[] = filteredLibrary.map((item) => ({
    id: item.imdbId,
    imdbId: item.imdbId,
    type: item.type,
    name: item.title,
    title: item.title,
    year: item.year,
    description: "",
    overview: "",
    poster: item.poster,
    background: item.backdrop,
    backdrop: item.backdrop,
    rating: item.rating || 0,
    genres: [],
  }));

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      createCollection(newCollectionName.trim());
      setNewCollectionName("");
    }
  };

  const handleDeleteCollection = (id: string) => {
    if (confirm("Are you sure you want to delete this collection?")) {
      deleteCollection(id);
    }
  };

  const handleRenameCollection = (id: string, newName: string) => {
    if (newName.trim()) {
      renameCollection(id, newName.trim());
      setEditingCollectionId(null);
    }
  };

  return (
    <div className="library-page">
      <div className="library-section">
        <div className="section-header">
          <h1>My Library</h1>
          <div className="library-controls">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filter-buttons">
              <button
                className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                className={`filter-btn ${activeFilter === "movies" ? "active" : ""}`}
                onClick={() => setFilter("movies")}
              >
                Movies
              </button>
              <button
                className={`filter-btn ${activeFilter === "series" ? "active" : ""}`}
                onClick={() => setFilter("series")}
              >
                Series
              </button>
              <button
                className={`filter-btn ${activeFilter === "favorites" ? "active" : ""}`}
                onClick={() => setFilter("favorites")}
              >
                ⭐ Favorites
              </button>
              <button
                className={`filter-btn ${activeFilter === "watchlist" ? "active" : ""}`}
                onClick={() => setFilter("watchlist")}
              >
                📋 Watchlist
              </button>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="sort-select"
            >
              <option value="recent">Recently Added</option>
              <option value="title">Title (A-Z)</option>
              <option value="rating">Rating</option>
              <option value="year">Year</option>
              <option value="runtime">Runtime</option>
            </select>

            <button
              className="collections-toggle"
              onClick={() => setShowCollections(!showCollections)}
            >
              📁 Collections ({collections.length})
            </button>
          </div>
          <p className="section-subtitle">
            {filteredLibrary.length} of {library.length}{" "}
            {library.length === 1 ? "item" : "items"}
          </p>
        </div>

        {showCollections && (
          <div className="collections-panel">
            <div className="collections-header">
              <h3>Collections</h3>
              <div className="new-collection">
                <input
                  type="text"
                  placeholder="New collection name..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleCreateCollection()
                  }
                />
                <button onClick={handleCreateCollection}>Create</button>
              </div>
            </div>
            <div className="collections-list">
              {collections.length > 0 ? (
                collections.map((collection) => (
                  <div key={collection.id} className="collection-item">
                    {editingCollectionId === collection.id ? (
                      <input
                        type="text"
                        defaultValue={collection.name}
                        onBlur={(e) =>
                          handleRenameCollection(collection.id, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleRenameCollection(
                              collection.id,
                              e.currentTarget.value,
                            );
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <>
                        <div className="collection-info">
                          <h4>{collection.name}</h4>
                          <span>{collection.items.length} items</span>
                        </div>
                        <div className="collection-actions">
                          <button
                            onClick={() =>
                              setEditingCollectionId(collection.id)
                            }
                          >
                            Rename
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteCollection(collection.id)
                            }
                            className="delete-btn"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p className="empty-collections">No collections yet</p>
              )}
            </div>
          </div>
        )}

        {libraryItems.length > 0 ? (
          <div className="library-grid">
            {libraryItems.map((item) => (
              <MediaCard
                key={`${item.type}-${item.id}`}
                item={item}
                size="large"
              />
            ))}
          </div>
        ) : library.length > 0 ? (
          <div className="library-empty">
            <span className="empty-icon">🔍</span>
            <h2>No items match your filters</h2>
            <p>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="library-empty">
            <span className="empty-icon">📚</span>
            <h2>Your library is empty</h2>
            <p>Add movies and shows to your library to watch them later</p>
          </div>
        )}
      </div>

      <div className="library-section">
        <div className="section-header">
          <h2>Continue Watching</h2>
          {watchHistory.length > 0 && (
            <button className="btn btn-ghost" onClick={clearWatchHistory}>
              Clear History
            </button>
          )}
        </div>

        {watchHistory.length > 0 ? (
          <div className="history-list">
            {watchHistory
              .filter((item, index, self) => {
                // For movies, always include
                if (item.type === "movie") return true;
                // For series, only include if it's the first occurrence of this imdbId
                return (
                  self.findIndex((h) => h.imdbId === item.imdbId) === index
                );
              })
              .slice(0, 10)
              .map((item) => {
                const playerUrl =
                  item.type === "movie"
                    ? `/player/movie/${item.imdbId}`
                    : `/player/series/${item.imdbId}/${item.season}/${item.episode}`;

                return (
                  <Link key={item.id} to={playerUrl} className="history-item">
                    <div className="history-poster">
                      {item.poster ? (
                        <img src={item.poster} alt={item.title} />
                      ) : (
                        <div className="history-placeholder">
                          {item.type === "movie" ? "🎬" : "📺"}
                        </div>
                      )}
                      <div className="history-progress">
                        <div
                          className="history-progress-fill"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="history-info">
                      <h4>{item.title}</h4>
                      {item.type === "series" &&
                        item.season &&
                        item.episode && (
                          <span className="history-episode">
                            S{item.season.toString().padStart(2, "0")}E
                            {item.episode.toString().padStart(2, "0")}
                            {item.episodeTitle && ` - ${item.episodeTitle}`}
                          </span>
                        )}
                      <span className="history-progress-text">
                        {item.progress}% watched
                      </span>
                    </div>
                  </Link>
                );
              })}
          </div>
        ) : (
          <div className="history-empty">
            <p>No watch history yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
