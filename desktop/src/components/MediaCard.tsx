import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import "./MediaCard.css";

interface MediaCardProps {
  item: MediaItem;
  size?: "small" | "medium" | "large";
  showRating?: boolean;
}

export function MediaCard({
  item,
  size = "medium",
  showRating = true,
}: MediaCardProps) {
  const linkPath = `/details/${item.type}/${item.id}`;

  return (
    <Link to={linkPath} className={`media-card media-card-${size}`}>
      <div className="media-card-poster">
        {item.poster ? (
          <img src={item.poster} alt={item.title} loading="lazy" />
        ) : (
          <div className="media-card-placeholder">
            <span>{item.type === "movie" ? "🎬" : "📺"}</span>
          </div>
        )}

        <div className="media-card-overlay">
          <button className="play-btn">▶</button>
        </div>

        {showRating && item.rating > 0 && (
          <div className="media-card-rating">
            <span className="star">★</span>
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="media-card-info">
        <h3 className="media-card-title">{item.title}</h3>
        <div className="media-card-meta">
          <span className="year">{item.year || "TBA"}</span>
          <span className="type">
            {item.type === "movie" ? "Movie" : "Series"}
          </span>
        </div>
      </div>
    </Link>
  );
}
