type Props = { service: string; suspect?: string; recovered: boolean };

const NODES: Record<string, [number, number]> = {
  "web-client": [60, 100],
  "api-service": [230, 100],
  postgres: [420, 40],
  redis: [420, 120],
  "orders-worker": [230, 190],
};
const EDGES: [string, string][] = [
  ["web-client", "api-service"],
  ["api-service", "postgres"],
  ["api-service", "redis"],
  ["orders-worker", "redis"],
];
const COLOR = { ok: "#3FB27F", fault: "#F0644F", suspect: "#E3A33B" };

export default function ServiceGraph({ service, suspect, recovered }: Props) {
  const stateOf = (id: string): keyof typeof COLOR => {
    if (id === service) return recovered ? "ok" : "fault";
    if (id === suspect) return recovered ? "ok" : "suspect";
    return "ok";
  };
  return (
    <svg viewBox="0 0 500 250" className="h-auto w-full" role="img" aria-label={`Service dependency map, ${service} affected`}>
      {EDGES.map(([a, b]) => (
        <line key={a + b} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#202B37" strokeWidth="1.5" />
      ))}
      {Object.entries(NODES).map(([id, [x, y]]) => {
        const s = stateOf(id);
        const c = COLOR[s];
        return (
          <g key={id}>
            {s === "fault" && <circle cx={x} cy={y} r="29" fill="none" stroke={c} opacity="0.28" />}
            <circle cx={x} cy={y} r="20" fill="#10161D" stroke={c} strokeWidth="2.5" strokeDasharray={s === "suspect" ? "5 3" : undefined} />
            <circle cx={x} cy={y} r="4" fill={c} />
            <text x={x} y={y + 38} textAnchor="middle" fontSize="11.5" fontWeight="500" fill="#E4EAF0">{id}</text>
            {s !== "ok" && (
              <text x={x} y={y + 51} textAnchor="middle" fontSize="10" fill={c}>
                {s === "fault" ? "failing" : "suspected cause"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
