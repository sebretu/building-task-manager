import React from "react";

interface PlanCompositeThumbnailProps {
  planId: string;
  zoom?: number;
  size?: number;
  alt?: string;
}

// Renders a 2x2 grid for zoom 1 (tiles 1/0/0, 1/0/1, 1/1/0, 1/1/1)
const PlanCompositeThumbnail: React.FC<PlanCompositeThumbnailProps> = ({ planId, zoom = 1, size = 480, alt = "Plan thumbnail" }) => {
  const tileSize = size / 2;
  const tileSrc = (x: number, y: number) => `/tiles/${planId}/${zoom}/${x}/${y}.png`;
  // Fallback to placeholder if any tile fails
  const [error, setError] = React.useState(false);
  if (error) {
    return <img src="/assets/plan-placeholder.svg" alt={alt} style={{ width: size, height: size, opacity: 0.5, border: "1px solid #ccc", borderRadius: 8 }} />;
  }
  return (
    <div style={{ width: size, height: size, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", border: "1px solid #ccc", borderRadius: 8, overflow: "hidden", background: "#f8f8f8" }}>
      {[0, 1].map(y => [0, 1].map(x => (
        <img
          key={`${x}-${y}`}
          src={tileSrc(x, y)}
          alt={alt}
          style={{ width: tileSize, height: tileSize, objectFit: "contain", background: "#eee" }}
          onError={() => setError(true)}
        />
      )))}
    </div>
  );
};

export default PlanCompositeThumbnail;
