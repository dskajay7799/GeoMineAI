import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const wikimedia = (filename) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    filename
  )}?width=1200`;

const DEFAULT_IMAGES = [
  {
    src: wikimedia("Singareni opencast coal mines at Manuguru 04.jpg"),
    caption: "Singareni opencast coal mine, Manuguru, Telangana",
  },
  {
    src: wikimedia("Coal mine in West bengal.jpg"),
    caption: "Coal mine, West Bengal",
  },
  {
    src: wikimedia("Bailadila Iron ore mines.jpg"),
    caption: "Bailadila iron ore mines, Chhattisgarh",
  },
  {
    src: wikimedia("Joda east iron mine.jpg"),
    caption: "Joda East iron mine, Odisha",
  },
  {
    src: wikimedia(
      "Majhgawan Diamond Mines in Panna, MP, India, Asia’s only Diamond mine. Is is a centre of a Volcano that erupted millions of years ago.jpg"
    ),
    caption: "Majhgawan diamond mine, Panna, Madhya Pradesh",
  },
  {
    src: wikimedia("Indarini Patnaik Mines.jpg"),
    caption: "Indrani Patnaik mines, Odisha",
  },
];

function MineImageCarousel({
  images = DEFAULT_IMAGES,
  autoPlayMs = 5000,
  height = 220,
}) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    if (isPaused || images.length <= 1) return;

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, autoPlayMs);

    return () => clearInterval(interval);
  }, [isPaused, images.length, autoPlayMs]);

  const goTo = (newIndex) => {
    setIndex(((newIndex % images.length) + images.length) % images.length);
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null) return;

    const deltaX =
      event.changedTouches[0].clientX - touchStartX.current;

    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        goTo(index + 1);
      } else {
        goTo(index - 1);
      }
    }

    touchStartX.current = null;
  };

  if (!images.length) return null;

  return (
    <div
      className="mine-carousel"
      style={{ height }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Images */}
      <div
        className="mine-carousel-track"
        style={{
          transform: `translateX(-${index * 100}%)`,
        }}
      >
        {images.map((image) => (
          <div
            className="mine-carousel-slide"
            key={image.src}
          >
            <img
              src={image.src}
              alt={image.caption}
              loading="eager"
              onError={(event) => {
                console.error(
                  "Failed to load mine image:",
                  image.src
                );
              }}
            />

            <div className="mine-carousel-caption">
              {image.caption}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      {images.length > 1 && (
        <>
          {/* Previous Button */}
          <button
            className="mine-carousel-arrow left"
            onClick={() => goTo(index - 1)}
            aria-label="Previous image"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Next Button */}
          <button
            className="mine-carousel-arrow right"
            onClick={() => goTo(index + 1)}
            aria-label="Next image"
          >
            <ChevronRight size={18} />
          </button>

          {/* Dots */}
          <div className="mine-carousel-dots">
            {images.map((image, dotIndex) => (
              <button
                key={image.src}
                className={
                  dotIndex === index
                    ? "mine-carousel-dot active"
                    : "mine-carousel-dot"
                }
                onClick={() => goTo(dotIndex)}
                aria-label={`Go to slide ${dotIndex + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Credit */}
      <div className="mine-carousel-credit">
        Photos: Wikimedia Commons
      </div>
    </div>
  );
}

export default MineImageCarousel;