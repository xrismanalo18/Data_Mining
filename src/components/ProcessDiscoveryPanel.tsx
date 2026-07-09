"use client";

export type TaskMiningAnalysis = {
  sessionCount: number;
  totals: { keystrokes: number; mouseClicks: number; durationSeconds: number };
  steps: {
    name: string;
    events: number;
    keystrokes: number;
    mouseClicks: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
  }[];
} | null;

type DiscoveryAnalysis = {
  caseCount: number;
  eventCount: number;
  activities: { name: string; count: number }[];
  transitions: { from: string; to: string; count: number; caseCount: number; avgHours: number }[];
  taskMining?: TaskMiningAnalysis;
};

export default function ProcessDiscoveryPanel({ analysis }: { analysis: DiscoveryAnalysis }) {
  const tm = analysis.taskMining;
  const dominantPath = buildDominantPath(analysis.activities, analysis.transitions);
  const loops = findLoops(analysis.transitions);
  const topTransitions = [...analysis.transitions].sort((a, b) => b.count - a.count).slice(0, 20);
  const stepStats = new Map((tm?.steps || []).map(step => [step.name, step]));

  if (!analysis.transitions.length) {
    return (
      <section className="card">
        <PanelHeader
          kicker="Task mining"
          title="Process Discovery"
          detail="Discovered flow from recorded desktop work sessions."
        />
        <div className="empty-state">
          <strong>No flow to discover yet</strong>
          <p>This dataset has no activity transitions. Upload a FlowLens task-mining event log to see the discovered flow.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <PanelHeader
        kicker="Task mining"
        title="Process Discovery"
        detail={
          tm
            ? `Discovered from ${tm.sessionCount} recorded session${tm.sessionCount === 1 ? "" : "s"} · ` +
              `${formatSeconds(tm.totals.durationSeconds)} of active work · ` +
              `${tm.totals.keystrokes.toLocaleString()} keystrokes · ${tm.totals.mouseClicks.toLocaleString()} clicks`
            : "Dominant flow discovered from event transitions. Upload a FlowLens task-mining event log to see interaction detail."
        }
      />

      <h3 style={{ margin: "18px 0 10px" }}>Dominant flow</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {dominantPath.map((name, index) => {
          const stats = stepStats.get(name);
          return (
            <div key={`${name}-${index}`}>
              {index > 0 && (
                <div aria-hidden style={{ textAlign: "center", opacity: 0.55, fontSize: "14px", lineHeight: "20px" }}>↓</div>
              )}
              <div
                className="highlight tone-normal"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <span className="section-kicker" style={{ whiteSpace: "nowrap" }}>Step {index + 1}</span>
                  <strong style={{ overflowWrap: "anywhere" }}>{name}</strong>
                </div>
                {stats ? (
                  <span style={{ whiteSpace: "nowrap", fontSize: "13px", opacity: 0.85 }}>
                    {formatSeconds(stats.totalDurationSeconds)} · {stats.keystrokes.toLocaleString()} keys ·{" "}
                    {stats.mouseClicks.toLocaleString()} clicks · avg dwell {formatSeconds(stats.avgDurationSeconds)}
                  </span>
                ) : (
                  <span style={{ whiteSpace: "nowrap", fontSize: "13px", opacity: 0.85 }}>
                    {analysis.activities.find(item => item.name === name)?.count ?? 0} events
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ margin: "22px 0 10px" }}>Back-and-forth signals</h3>
      {loops.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {loops.slice(0, 6).map(loop => (
            <div key={`${loop.a}->${loop.b}`} className="highlight tone-watch">
              <div className="metric-label">Rework loop · {loop.total} switches</div>
              <strong style={{ overflowWrap: "anywhere" }}>{loop.a} ⇄ {loop.b}</strong>
              <span>Work bounced between these steps; a candidate for consolidation or automation.</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ opacity: 0.75 }}>No repeated back-and-forth between steps was detected.</p>
      )}

      <h3 style={{ margin: "22px 0 10px" }}>Transitions</h3>
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            <th>Count</th>
            <th>Sessions</th>
          </tr>
        </thead>
        <tbody>
          {topTransitions.map(item => (
            <tr key={`${item.from}->${item.to}`}>
              <td>{item.from}</td>
              <td>{item.to}</td>
              <td>{item.count}</td>
              <td>{item.caseCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function buildDominantPath(
  activities: { name: string; count: number }[],
  transitions: { from: string; to: string; count: number }[],
) {
  const outgoing = new Map<string, { to: string; count: number }[]>();
  const inCounts = new Map<string, number>();
  const outCounts = new Map<string, number>();
  for (const transition of transitions) {
    const list = outgoing.get(transition.from) || [];
    list.push({ to: transition.to, count: transition.count });
    outgoing.set(transition.from, list);
    outCounts.set(transition.from, (outCounts.get(transition.from) || 0) + transition.count);
    inCounts.set(transition.to, (inCounts.get(transition.to) || 0) + transition.count);
  }

  let start = activities[0]?.name || transitions[0]?.from || "";
  let bestScore = -Infinity;
  for (const name of new Set([...outCounts.keys(), ...inCounts.keys()])) {
    const score = (outCounts.get(name) || 0) - (inCounts.get(name) || 0);
    if (score > bestScore) {
      bestScore = score;
      start = name;
    }
  }

  const path: string[] = [];
  const visited = new Set<string>();
  let current = start;
  while (current && !visited.has(current) && path.length < 22) {
    path.push(current);
    visited.add(current);
    const next = (outgoing.get(current) || [])
      .filter(edge => !visited.has(edge.to))
      .sort((a, b) => b.count - a.count)[0];
    current = next?.to || "";
  }
  return path;
}

function findLoops(transitions: { from: string; to: string; count: number }[]) {
  const counts = new Map(transitions.map(item => [`${item.from}|||${item.to}`, item.count]));
  const loops: { a: string; b: string; total: number }[] = [];
  const seen = new Set<string>();
  for (const transition of transitions) {
    if (transition.from === transition.to) continue;
    const reverse = counts.get(`${transition.to}|||${transition.from}`);
    if (!reverse) continue;
    const key = [transition.from, transition.to].sort().join("|||");
    if (seen.has(key)) continue;
    seen.add(key);
    loops.push({ a: transition.from, b: transition.to, total: transition.count + reverse });
  }
  return loops.sort((a, b) => b.total - a.total);
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function PanelHeader({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return (
    <div className="panel-header">
      <div className="section-kicker">{kicker}</div>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
