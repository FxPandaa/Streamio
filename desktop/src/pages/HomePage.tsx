import { useState, useEffect, useMemo } from "react";
import { HeroBanner, MediaRow, ContinueWatching } from "../components";
import { cinemetaService, MediaItem } from "../services";
import { useLibraryStore } from "../stores";
import "./HomePage.css";

export function HomePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [popularSeries, setPopularSeries] = useState<MediaItem[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaItem[]>([]);
  const [topRatedSeries, setTopRatedSeries] = useState<MediaItem[]>([]);

  const { watchHistory } = useLibraryStore();

  // Build the top 10 featured items from popular movies + series
  const featuredItems = useMemo(() => {
    const combined: MediaItem[] = [];
    // Interleave movies and series for variety
    const maxEach = 5;
    for (let i = 0; i < maxEach; i++) {
      if (popularMovies[i]) combined.push(popularMovies[i]);
      if (popularSeries[i]) combined.push(popularSeries[i]);
    }
    return combined.slice(0, 10);
  }, [popularMovies, popularSeries]);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      setIsLoading(true);

      const [
        popularMoviesData,
        popularSeriesData,
        topRatedMoviesData,
        topRatedSeriesData,
      ] = await Promise.all([
        cinemetaService.getPopularMovies(),
        cinemetaService.getPopularSeries(),
        cinemetaService.getTopRatedMovies(),
        cinemetaService.getTopRatedSeries(),
      ]);

      setPopularMovies(popularMoviesData);
      setPopularSeries(popularSeriesData);
      setTopRatedMovies(topRatedMoviesData);
      setTopRatedSeries(topRatedSeriesData);
    } catch (error) {
      console.error("Failed to load content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="home-page">
      <HeroBanner items={featuredItems} isLoading={isLoading} />

      <div className="content-rows">
        {/* Continue Watching - only show if there's history */}
        {/* For series, only show the most recent episode per series */}
        {watchHistory.length > 0 && (
          <ContinueWatching
            items={watchHistory.filter((item, index, self) => {
              // For movies, always include
              if (item.type === "movie") return true;
              // For series, only include if it's the first occurrence of this imdbId
              return self.findIndex((h) => h.imdbId === item.imdbId) === index;
            })}
          />
        )}

        <MediaRow
          title="Popular Movies"
          items={popularMovies}
          isLoading={isLoading}
        />

        <MediaRow
          title="Popular TV Shows"
          items={popularSeries}
          isLoading={isLoading}
        />

        <MediaRow
          title="Top Rated Movies"
          items={topRatedMovies}
          isLoading={isLoading}
        />

        <MediaRow
          title="Top Rated TV Shows"
          items={topRatedSeries}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
