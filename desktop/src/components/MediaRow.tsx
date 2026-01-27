import { useRef } from "react";
import { MediaItem } from "../services/metadata/cinemeta";
import { MediaCard } from "./MediaCard";
import "./MediaRow.css";

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  isLoading?: boolean;
}

export function MediaRow({ title, items, isLoading = false }: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.8;
      rowRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (isLoading) {
    return (
      <section className="media-row">
        <h2 className="media-row-title">{title}</h2>
        <div className="media-row-items">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="media-card-skeleton">
              <div className="skeleton-poster"></div>
              <div className="skeleton-title"></div>
              <div className="skeleton-meta"></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="media-row">
      <div className="media-row-header">
        <h2 className="media-row-title">{title}</h2>
        <div className="media-row-nav">
          <button className="nav-btn" onClick={() => scroll("left")}>
            ←
          </button>
          <button className="nav-btn" onClick={() => scroll("right")}>
            →
          </button>
        </div>
      </div>

      <div className="media-row-items" ref={rowRef}>
        {items.map((item) => (
          <MediaCard key={`${item.type}-${item.id}`} item={item} />
        ))}
      </div>
    </section>
  );
}
