import React from "react";

interface PlanThumbnailProps {
  planId: string;
  width?: number;
  height?: number;
  alt?: string;
}

// This assumes the first tile (0/0/0.png) is a good enough thumbnail for the plan
// You may want to adjust the path logic if you want a different tile or a generated preview
const PlanThumbnail: React.FC<PlanThumbnailProps> = ({ planId, width = 480, height = 480, alt = "Plan thumbnail" }) => {
  // Try 0/0/0.png, then 1/0/0.png, then 2/0/0.png, then placeholder
  const tilePaths = [
    `/tiles/${planId}/0/0/0.png`,
    `/tiles/${planId}/1/0/0.png`,
    `/tiles/${planId}/2/0/0.png`,
    "/assets/plan-placeholder.svg"
  ];
  const [srcIdx, setSrcIdx] = React.useState(0);
  return (
    <div style={{ width, height, border: "1px solid #ccc", borderRadius: 8, overflow: "hidden", background: "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src={tilePaths[srcIdx]}
        alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#eee" }}
        onError={() => setSrcIdx(idx => (idx < tilePaths.length - 1 ? idx + 1 : idx))}
      />
    </div>
  );
};

export default PlanThumbnail;
