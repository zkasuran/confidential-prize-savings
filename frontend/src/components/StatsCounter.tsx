import { useEffect, useState } from "react";

interface StatsCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  label: string;
}

export default function StatsCounter({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 1500,
  label,
}: StatsCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplayValue(0);
      return;
    }

    const startTime = Date.now();
    const startValue = displayValue;
    const diff = value - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + diff * eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stats-counter">
      <span className="stats-counter-value">
        {prefix}
        {displayValue.toFixed(decimals)}
        {suffix}
      </span>
      <span className="stats-counter-label">{label}</span>
    </div>
  );
}
