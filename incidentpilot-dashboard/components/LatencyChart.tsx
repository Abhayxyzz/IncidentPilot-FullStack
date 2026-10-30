type Props = { values: number[]; tail: number[]; recovered: boolean; threshold?: number };

const W = 520, H = 140, PX = 40, PY = 12;

export default function LatencyChart({ values, tail, recovered, threshold = 1000 }: Props) {
  const all = recovered ? [...values, ...tail] : values;
  const x = (i: number) => PX + (i * (W - PX - 10)) / Math.max(all.length - 1, 1);
  const y = (v: number) => H - PY - ((Math.log10(Math.max(v, 100)) - 2) / 2.7) * (H - 2 * PY);
  const pts = all.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const split = values.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="p95 latency over the incident window, log scale">
      {[100, 1000, 10000].map((t) => (
        <g key={t}>
          <line x1={PX} x2={W - 10} y1={y(t)} y2={y(t)} stroke="#202B37" />
          <text x={PX - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#7C8A99">{t >= 1000 ? `${t / 1000}s` : `${t}ms`}</text>
        </g>
      ))}
      <line x1={PX} x2={W - 10} y1={y(threshold)} y2={y(threshold)} stroke="#E3A33B" strokeDasharray="4 3" />
      <text x={W - 12} y={y(threshold) - 4} textAnchor="end" fontSize="10" fill="#E3A33B">alert threshold</text>
      <polyline fill="none" stroke={recovered ? "#7C8A99" : "#F0644F"} strokeWidth="2" strokeLinejoin="round" points={pts.slice(0, split + 1).join(" ")} />
      {recovered && <polyline fill="none" stroke="#3FB27F" strokeWidth="2.5" strokeLinejoin="round" points={pts.slice(split).join(" ")} />}
    </svg>
  );
}
