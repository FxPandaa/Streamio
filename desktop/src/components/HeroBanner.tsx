import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import { useValidatedImage } from "../utils/useValidatedImage";
import "./HeroBanner.css";

const ROTATE_INTERVAL = 15000; // 15 seconds

interface HeroBannerProps {
  items: MediaItem[];
  isLoading?: boolean;
}

export function HeroBanner({ items, isLoading = false }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const item = items.length > 0 ? items[activeIndex % items.length] : null;
  const validLogo = useValidatedImage(item?.logo);

  const goTo = useCallback(
    (index: number) => {
      if (items.length === 0 || isTransitioning) return;
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex(index % items.length);
        setIsTransitioning(false);
      }, 400);
    },
    [items.length, isTransitioning],
  );

  // Auto-rotate
  useEffect(() => {
    if (items.length <= 1) return;

    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % items.length);
        setIsTransitioning(false);
      }, 400);
    }, ROTATE_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length]);

  // Reset timer on manual navigation
  const handleDotClick = (index: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo(index);
    // Restart auto-rotate
    if (items.length > 1) {
      timerRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setActiveIndex((prev) => (prev + 1) % items.length);
          setIsTransitioning(false);
        }, 400);
      }, ROTATE_INTERVAL);
    }
  };

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
        className={`hero-backdrop ${isTransitioning ? "hero-backdrop-fade" : ""}`}
        style={{
          backgroundImage: item.backdrop ? `url(${item.backdrop})` : "none",
        }}
      >
        <div className="hero-gradient"></div>
      </div>

      <div
        className={`hero-content ${isTransitioning ? "hero-content-fade" : ""}`}
      >
        <span className="hero-type">
          {item.type === "movie" ? "Movie" : "Series"}
        </span>

        <div className="hero-heading">
          {validLogo ? (
            <img className="hero-logo" src={validLogo} alt={item.title} />
          ) : (
            <div className="hero-title-pending" aria-hidden="true" />
          )}
        </div>

        <div className="hero-meta">
          <span className="hero-year">{item.year}</span>
          {item.rating > 0 && (
            <>
              <span className="hero-divider">·</span>
              <span className="hero-rating">
                <span className="star">★</span> {item.rating.toFixed(1)}
              </span>
            </>
          )}
          {item.genres && item.genres.length > 0 && (
            <>
              <span className="hero-divider">·</span>
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
            More Info
          </Link>
        </div>
      </div>

      {/* Dot indicators */}
      {items.length > 1 && (
        <div className="hero-dots">
          {items.map((_, i) => (
            <button
              key={i}
              className={`hero-dot ${i === activeIndex % items.length ? "hero-dot-active" : ""}`}
              onClick={() => handleDotClick(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
