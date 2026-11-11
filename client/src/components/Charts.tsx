import { money } from "../lib/format";

type Slice = { id: string; label: string; value: number; color: string };

export function Donut({
  slices,
  caption,
  totalLabel,
}: {
  slices: Slice[];
  caption: string;
  totalLabel: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  const gap = slices.filter((slice) => slice.value > 0).length > 1 ? 2.5 : 0;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 200 200" className="donut" role="img" aria-label={`${caption}, ${totalLabel}`}>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="#e6eeea" strokeWidth="18" />
        <g transform="rotate(-90 100 100)">
          {total > 0
            ? slices.map((slice) => {
                if (slice.value <= 0) return null;
                const length = Math.max(0, (slice.value / total) * circumference - gap);
                const node = (
                  <circle
                    key={slice.id}
                    cx="100"
                    cy="100"
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="18"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-cursor}
                  />
                );
                cursor += (slice.value / total) * circumference;
                return node;
              })
            : null}
        </g>
        <text x="100" y="96" textAnchor="middle" className="donut-caption">
          {caption}
        </text>
        <text x="100" y="118" textAnchor="middle" className="donut-total">
          {totalLabel}
        </text>
      </svg>
    </div>
  );
}

export function MonthColumns({
  months,
}: {
  months: { key: string; label: string; value: number; active: boolean }[];
}) {
  const max = Math.max(...months.map((month) => month.value), 1);
  return (
    <div className="columns" role="list">
      {months.map((month) => (
        <div key={month.key} className={month.active ? "column active" : "column"} role="listitem">
          <div className="column-track" title={`${month.label} ${money(month.value)}`}>
            <div className="column-fill" style={{ height: `${(month.value / max) * 100}%` }} />
          </div>
          <span>{month.label}</span>
        </div>
      ))}
    </div>
  );
}
