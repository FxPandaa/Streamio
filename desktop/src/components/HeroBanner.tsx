import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import "./HeroBanner.css";

interface HeroBannerProps {
  item: MediaItem | null;
  isLoading?: boolean;
}

export function HeroBanner({ item, isLoading = false }: HeroBannerProps) {
  if (isLoading) {
    return (
      <div className="hero-banner hero-loading">
        <div className="hero-skeleton"></div>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  return (
    <div className="hero-banner">
      <div
        className="hero-backdrop"
        style={{
          backgroundImage: item.backdrop ? `url(${item.backdrop})` : "none",
        }}
      >
        <div className="hero-gradient"></div>
      </div>

      <div className="hero-content">
        <span className="hero-type">
          {item.type === "movie" ? "🎬 Movie" : "📺 Series"}
        </span>

        <h1 className="hero-title">{item.title}</h1>

        <div className="hero-meta">
          <span className="hero-year">{item.year}</span>
          {item.rating > 0 && (
            <>
              <span className="hero-divider">•</span>
              <span className="hero-rating">
                <span className="star">★</span> {item.rating.toFixed(1)}
              </span>
            </>
          )}
          {item.genres && item.genres.length > 0 && (
            <>
              <span className="hero-divider">•</span>
              <span className="hero-genres">
                {item.genres.slice(0, 3).join(", ")}
              </span>
            </>
          )}
        </div>

        <p className="hero-overview">
          {item.overview?.slice(0, 300)}
          {item.overview && item.overview.length > 300 ? "..." : ""}
        </p>

        <div className="hero-actions">
          <Link
            to={`/player/${item.type}/${item.id}`}
            className="btn btn-primary hero-btn"
          >
            ▶ Play
          </Link>
          <Link
            to={`/details/${item.type}/${item.id}`}
            className="btn btn-secondary hero-btn"
          >
            ℹ️ More Info
          </Link>
        </div>
      </div>
    </div>
  );
}
