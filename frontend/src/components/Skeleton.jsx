export function SkeletonBlock({ height = 16, width = "100%", radius = 6, style = {} }) {
  return (
    <div
      className="skeleton-block"
      style={{ height, width, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonStatCards({ count = 4 }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div className="stat-card" key={index}>
          <div className="stat-top">
            <SkeletonBlock height={38} width={38} radius={8} />
          </div>
          <SkeletonBlock height={10} width="60%" style={{ marginTop: 18 }} />
          <SkeletonBlock height={24} width="40%" style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows = 5, columns = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex}>
              <SkeletonBlock height={12} width={colIndex === 0 ? "70%" : "50%"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCardGrid({ count = 6, height = 140 }) {
  return (
    <div className="mine-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div className="stat-card" key={index}>
          <SkeletonBlock height={38} width={38} radius={8} />
          <SkeletonBlock height={12} width="70%" style={{ marginTop: 16 }} />
          <SkeletonBlock height={10} width="50%" style={{ marginTop: 10 }} />
          <SkeletonBlock height={height - 100 > 0 ? 24 : 0} width="90%" style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}