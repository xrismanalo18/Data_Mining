"use client";

import { useMemo, useState } from "react";

export type ExplorerClaim = {
  caseId: string;
  status: string;
  durationHours: number;
  eventCount: number;
  manualTouches: number;
  reassignments: number;
  repeatedSteps: number;
  currentOwner: string;
  stp: boolean;
  exception: boolean;
  lpi: number;
  caseCost: number;
  hasCostData: boolean;
  estimatedSavings: number;
  savingsRate: number;
  loopSavings: number;
  path: string[];
  straightPath: string[];
  loopWasteHours: number;
  loopLpiPoints: number;
  steps: {
    activity: string;
    timestamp: string;
    owner: string;
    waitHours: number;
    isLoop: boolean;
    loopBackIndex: number | null;
  }[];
  loops: {
    activity: string;
    fromIndex: number;
    toIndex: number;
    wasteHours: number;
    lpiPoints: number;
  }[];
};

export default function InteractiveClaimsExplorer({ cases: allCases }: { cases: ExplorerClaim[] }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(0.72);
  const [selectedCaseId, setSelectedCaseId] = useState(allCases[0]?.caseId || "");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [loopsOnly, setLoopsOnly] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [replayKey, setReplayKey] = useState(0);

  const cases = useMemo(() => {
    let result = allCases;
    if (filter === "stp") result = result.filter(item => item.stp);
    if (filter === "exception") result = result.filter(item => item.exception);
    if (filter === "reassigned") result = result.filter(item => item.reassignments > 0);
    if (filter === "rework") result = result.filter(item => item.repeatedSteps > 0);
    if (filter === "high-savings") result = result.filter(item => item.hasCostData && item.savingsRate >= 25);
    const term = search.trim().toLowerCase();
    if (term) result = result.filter(item => item.caseId.toLowerCase().includes(term) || item.path.some(step => step.toLowerCase().includes(term)));
    return result;
  }, [allCases, filter, search]);

  const selected = cases.find(item => item.caseId === selectedCaseId) || cases[0] || null;
  const loopClaims = cases.filter(item => item.repeatedSteps > 0);
  const loopHours = loopClaims.reduce((sum, item) => sum + item.loopWasteHours, 0);
  const loopSavings = loopClaims.reduce((sum, item) => sum + item.loopSavings, 0);
  const loopCost = loopClaims.reduce((sum, item) => sum + item.caseCost, 0);
  const loopCostAvailable = loopClaims.some(item => item.hasCostData);
  const visibleActivities = new Set(cases.flatMap(item => item.path)).size;

  function changeZoom(amount: number) {
    setZoom(current => Math.min(1.65, Math.max(0.35, Number((current + amount).toFixed(2)))));
  }

  return (
    <div className="claim-explorer">
      <section className="explorer-toolbar">
        <div className="explorer-filter-row">
          {[
            ["all", "All"],
            ["stp", "STP"],
            ["exception", "Exceptions"],
            ["reassigned", "Reassigned"],
            ["rework", "Loops"],
            ["high-savings", "High savings"],
          ].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
        <input className="explorer-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Claim or activity" aria-label="Search claim or activity" />
        <label className="loop-toggle"><input type="checkbox" checked={loopsOnly} onChange={event => setLoopsOnly(event.target.checked)} /> Waste loops only</label>
      </section>

      <section className="explorer-metrics">
        <ExplorerMetric label="Claims" value={cases.length.toLocaleString()} />
        <ExplorerMetric label="Activities" value={visibleActivities.toLocaleString()} />
        <ExplorerMetric label="Loop claims" value={loopClaims.length.toLocaleString()} danger />
        <ExplorerMetric label="Loop time" value={formatHours(loopHours)} danger />
        <ExplorerMetric label="Loop savings" value={formatSavings(loopSavings, loopCostAvailable)} detail={loopCostAvailable && loopCost ? `${(loopSavings / loopCost * 100).toFixed(1)}%` : undefined} danger />
      </section>

      <section className="explorer-workspace">
        <div className="explorer-canvas-card">
          <div className="canvas-toolbar">
            <div>
              <strong>{selected?.caseId || "No matching claim"}</strong>
              {selected && <span className={selected.repeatedSteps ? "waste-signal" : "straight-signal"}>{selected.repeatedSteps ? `${selected.repeatedSteps} loops` : "Straight path"}</span>}
            </div>
            <div className="canvas-legend">
              <span><i className="legend-line normal" /> Actual</span>
              <span><i className="legend-line waste" /> Loop waste</span>
              <span><i className="legend-line ideal" /> Straight</span>
            </div>
            <div className="animation-controls" aria-label="Journey animation controls">
              <button className={playing ? "active" : ""} onClick={() => setPlaying(current => !current)}>{playing ? "Pause" : "Play"}</button>
              <select value={speed} onChange={event => setSpeed(Number(event.target.value))} aria-label="Animation speed">
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
              <button onClick={() => setReplayKey(current => current + 1)} disabled={!selected?.loops.length}>Replay loops</button>
            </div>
            <div className="canvas-zoom">
              <button onClick={() => changeZoom(-0.15)} disabled={zoom <= 0.35}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => changeZoom(0.15)} disabled={zoom >= 1.65}>+</button>
              <button onClick={() => setZoom(0.72)}>Fit</button>
            </div>
          </div>
          {selected ? (
            <ClaimJourneyGraph claim={selected} zoom={zoom} loopsOnly={loopsOnly} selectedStep={selectedStep} onSelectStep={index => { setSelectedStep(index); setReplayKey(current => current + 1); }} playing={playing} speed={speed} replayKey={replayKey} />
          ) : <div className="empty-state explorer-empty">No claims match these filters.</div>}
        </div>

        <aside className="explorer-side">
          <div className="claim-picker">
            {cases.slice(0, 50).map(item => (
              <button key={item.caseId} className={selected?.caseId === item.caseId ? "active" : ""} onClick={() => { setSelectedCaseId(item.caseId); setSelectedStep(null); }}>
                <span><strong>{item.caseId}</strong><small>{item.path.length} events · {formatHours(item.durationHours)}</small></span>
                <b className={item.repeatedSteps ? "loop-count" : ""}>{item.repeatedSteps || "STP"}</b>
              </button>
            ))}
          </div>
          {selected && (
            <div className="loop-inspector">
              <div className="inspector-kpis">
                <span><small>Cycle</small><strong>{formatHours(selected.durationHours)}</strong></span>
                <span><small>Loop waste</small><strong>{formatHours(selected.loopWasteHours)}</strong></span>
                <span><small>Savings</small><strong>{formatSavings(selected.estimatedSavings, selected.hasCostData)}</strong><em>{selected.hasCostData ? `${selected.savingsRate.toFixed(1)}%` : ""}</em></span>
              </div>
              {selected.loops.length ? selected.loops.map((loop, index) => (
                <button key={`${loop.activity}-${loop.fromIndex}`} className={selectedStep === loop.fromIndex ? "active" : ""} onClick={() => { setSelectedStep(loop.fromIndex); setReplayKey(current => current + 1); }}>
                  <span className="loop-index">{index + 1}</span>
                  <span><strong>{loop.activity}</strong><small>Step {loop.fromIndex + 1} back to {loop.toIndex + 1}</small></span>
                  <b>{formatHours(loop.wasteHours)}</b>
                </button>
              )) : <div className="straight-state"><strong>No waste loop</strong><span>This claim follows a straight route.</span></div>}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function ClaimJourneyGraph({
  claim,
  zoom,
  loopsOnly,
  selectedStep,
  onSelectStep,
  playing,
  speed,
  replayKey,
}: {
  claim: ExplorerClaim;
  zoom: number;
  loopsOnly: boolean;
  selectedStep: number | null;
  onSelectStep: (index: number) => void;
  playing: boolean;
  speed: number;
  replayKey: number;
}) {
  const spacing = 155;
  const width = Math.max(1160, 180 + claim.steps.length * spacing);
  const height = 570;
  const actualY = 205;
  const idealY = 455;
  const nodeX = (index: number) => 95 + index * spacing;
  const loopIndexes = new Set(claim.loops.flatMap(loop => [loop.fromIndex, loop.toIndex]));

  return (
    <div className="journey-viewport">
      <div className="journey-scaler" style={{ width: width * zoom, height: height * zoom }}>
        <svg key={`${claim.caseId}-${replayKey}`} className={`journey-graph ${playing ? "is-playing" : "is-paused"}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ transform: `scale(${zoom})` }}>
          <defs>
            <marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2563eb" /></marker>
            <marker id="arrow-waste" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#dc2626" /></marker>
            <marker id="arrow-ideal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#16a34a" /></marker>
          </defs>
          <text x="30" y="42" className="journey-label">ACTUAL CLAIM JOURNEY</text>
          <text x="30" y={idealY - 88} className="journey-label ideal-label">EXPECTED STRAIGHT PROCESS</text>

          {!loopsOnly && claim.steps.slice(0, -1).map((_, index) => (
            <g key={`edge-${index}`}>
              <path id={`forward-${index}`} d={`M ${nodeX(index) + 48} ${actualY} L ${nodeX(index + 1) - 48} ${actualY}`} className="journey-edge" markerEnd="url(#arrow-normal)" />
              <circle className="flow-token forward-token" r="5">
                <animateMotion dur={`${Math.max(0.8, 2.2 / speed)}s`} begin={`${index * 0.22}s`} repeatCount="indefinite"><mpath href={`#forward-${index}`} /></animateMotion>
              </circle>
              <text x={(nodeX(index) + nodeX(index + 1)) / 2} y={actualY - 12} className="edge-time">{formatCompactHours(claim.steps[index + 1].waitHours)}</text>
            </g>
          ))}

          {claim.loops.map((loop, index) => {
            const fromX = nodeX(loop.fromIndex);
            const toX = nodeX(loop.toIndex);
            const arcY = Math.max(58, 115 - index * 18);
            return (
              <g key={`loop-${loop.fromIndex}`} className={selectedStep === loop.fromIndex ? "selected-loop" : ""} onClick={() => onSelectStep(loop.fromIndex)}>
                <path id={`loop-path-${loop.fromIndex}`} d={`M ${fromX} ${actualY - 38} C ${fromX} ${arcY}, ${toX} ${arcY}, ${toX} ${actualY - 38}`} className="loop-edge" markerEnd="url(#arrow-waste)" />
                <circle className="flow-token loop-token" r={selectedStep === loop.fromIndex ? 8 : 6}>
                  <animateMotion dur={`${Math.max(1.1, (3.5 + index * .35) / speed)}s`} begin={`${index * .45}s`} repeatCount="indefinite"><mpath href={`#loop-path-${loop.fromIndex}`} /></animateMotion>
                </circle>
                <rect x={(fromX + toX) / 2 - 46} y={arcY - 16} width="92" height="24" rx="12" className="loop-time-bg" />
                <text x={(fromX + toX) / 2} y={arcY + 1} className="loop-time">{formatCompactHours(loop.wasteHours)} waste</text>
              </g>
            );
          })}

          {claim.steps.map((step, index) => {
            const hidden = loopsOnly && !loopIndexes.has(index);
            return (
              <g key={`${step.activity}-${index}`} className={`journey-node ${step.isLoop ? "loop-node" : ""} ${selectedStep === index ? "selected" : ""} ${hidden ? "muted-node" : ""}`} onClick={() => onSelectStep(index)}>
                <circle cx={nodeX(index)} cy={actualY} r="39" />
                <text x={nodeX(index)} y={actualY - 5} className="node-number">{index + 1}</text>
                <text x={nodeX(index)} y={actualY + 13} className="node-owner">{shortLabel(step.owner, 13)}</text>
                <rect x={nodeX(index) - 65} y={actualY + 52} width="130" height="35" rx="8" />
                <text x={nodeX(index)} y={actualY + 74} className="node-label">{shortLabel(step.activity, 19)}</text>
                <title>{`${step.activity} | ${step.owner} | ${formatHours(step.waitHours)} since prior event`}</title>
              </g>
            );
          })}

          {claim.straightPath.slice(0, -1).map((_, index) => (
            <line key={`ideal-edge-${index}`} x1={nodeX(index) + 34} y1={idealY} x2={nodeX(index + 1) - 34} y2={idealY} className="ideal-edge" markerEnd="url(#arrow-ideal)" />
          ))}
          {claim.straightPath.map((activity, index) => (
            <g key={`ideal-${activity}-${index}`} className="ideal-node">
              <circle cx={nodeX(index)} cy={idealY} r="29" />
              <text x={nodeX(index)} y={idealY + 4}>{index + 1}</text>
              <rect x={nodeX(index) - 58} y={idealY + 42} width="116" height="31" rx="8" />
              <text x={nodeX(index)} y={idealY + 62}>{shortLabel(activity, 17)}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function ExplorerMetric({ label, value, detail, danger }: { label: string; value: string; detail?: string; danger?: boolean }) {
  return <div className={danger ? "explorer-metric danger" : "explorer-metric"}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function shortLabel(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function formatCompactHours(hours: number) {
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

function formatHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "0.0 hrs";
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`;
  return `${hours.toFixed(1)} hrs`;
}

function formatSavings(amount: number, available: boolean) {
  if (!available) return "Cost data required";
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
