import { useEffect, useRef, useState } from "react";

function AnimatedNumber({ value, decimals = 1, durationMs = 900, suffix = "" }) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    const startValue = 0;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + (target - startValue) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, durationMs]);

  return (
    <span>
      {displayValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

export default AnimatedNumber;