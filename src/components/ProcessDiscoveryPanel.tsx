"use client";

import { useState } from "react";
import { APP_COLORS, DISCOVERY_FLOW, type DiscoveryStep } from "@/lib/discovery-flow-static";

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

const NODE_GAP = 190;
const NODE_R = 32;
const NODE_Y = 240;
const FIRST_X = 190;

export default function ProcessDiscoveryPanel() {
  const { meta, steps, returnEdges, reworkLoops } = DISCOVERY_FLOW;
  const [zoom, setZoom] = useState(0.85);
  const [visibleCount, setVisibleCount] = useState(steps.length);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleSteps = steps.slice(0, visibleCount);
  const indexById = new Map(visibleSteps.map((step, index) => [step.id, index]));
  const nodeX = (index: number) => FIRST_X + index * NODE_GAP;
  const startX = FIRST_X - 120;
  const endX = nodeX(visibleSteps.length - 1) + 120;
  const width = endX + 90;
  const height = 340;
  const maxStepSeconds = Math.max(...steps.map(step => step.seconds), 1);
  const stepById = new Map(steps.map(step => [step.id, step]));

  const visibleReturns = returnEdges.filter(edge => indexById.has(edge.fromId) && indexById.has(edge.toId));
  const changeZoom = (delta: number) => setZoom(value => Math.min(1.4, Math.max(0.4, Number((value + delta).toFixed(2)))));
  const toggleStep = (id: string) => setSelectedId(current => (current === id ? null : id));
  const isDim = (id: string) => Boolean(selectedId && selectedId !== id);

  return (
    <section className="card">
      <PanelHeader
        kicker="Task mining"
        title="Process Discovery"
        detail={
          `Participant ${meta.participant} · captured ${meta.capturedOn} · ${formatClock(meta.observedSeconds)} observed · ` +
          `${meta.samples} activity samples · ${meta.keystrokes} keystrokes · ${meta.clicks} clicks`
        }
      />

      <div className="disc-chrome">
        <span className="disc-view-select">Primary path view ▾</span>
        <span className="disc-chrome-note">
          Selected {meta.transitions} transition(s) across {steps.length} steps · {meta.sessions} recorded session
        </span>
        <div className="disc-legend" aria-label="Platform legend">
          {(Object.keys(APP_COLORS) as (keyof typeof APP_COLORS)[]).map(app => (
            <span key={app}><i style={{ background: APP_COLORS[app] }} />{app}</span>
          ))}
        </div>
        <div className="disc-zoom" aria-label="Map zoom controls">
          <button type="button" onClick={() => changeZoom(-0.1)} disabled={zoom <= 0.4}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => changeZoom(0.1)} disabled={zoom >= 1.4}>+</button>
          <button type="button" onClick={() => setZoom(0.45)}>Fit</button>
        </div>
      </div>

      <div className="discovery-layout">
        <div className="disc-map-wrap">
          <div className="disc-map-shell">
            <div className="map-scaler" style={{ width: width * zoom, height: height * zoom }}>
              <svg
                className="discovery-map"
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                role="img"
                aria-label="Discovered task flow map"
              >
                <defs>
                  <marker id="disc-arrow-amber" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--amber)" />
                  </marker>
                  <marker id="disc-arrow-teal" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--teal)" />
                  </marker>
                </defs>

                <g className="disc-terminal">
                  <circle cx={startX} cy={NODE_Y} r="12" />
                  <text x={startX} y={NODE_Y - 24}>Start</text>
                </g>
                <path
                  className="disc-edge-primary"
                  d={`M ${startX + 16} ${NODE_Y} L ${nodeX(0) - NODE_R - 10} ${NODE_Y}`}
                  markerEnd="url(#disc-arrow-amber)"
                />

                {visibleSteps.slice(0, -1).map((step, index) => {
                  const x1 = nodeX(index) + NODE_R + 8;
                  const x2 = nodeX(index + 1) - NODE_R - 10;
                  const mid = (x1 + x2) / 2;
                  const next = visibleSteps[index + 1];
                  const dim = selectedId ? selectedId !== step.id && selectedId !== next.id : false;
                  return (
                    <g key={`edge-${step.id}`} className={`disc-edge ${dim ? "is-dim" : ""}`}>
                      <path className="disc-edge-primary" d={`M ${x1} ${NODE_Y} L ${x2} ${NODE_Y}`} markerEnd="url(#disc-arrow-amber)">
                        <title>{`${step.window} → ${next.window}`}</title>
                      </path>
                      <g className="disc-edge-badge">
                        <circle cx={mid} cy={NODE_Y} r="9" />
                        <text x={mid} y={NODE_Y + 3.5}>{index + 1}</text>
                      </g>
                    </g>
                  );
                })}

                {visibleReturns.map(edge => {
                  const fromIndex = indexById.get(edge.fromId)!;
                  const toIndex = indexById.get(edge.toId)!;
                  const fx = nodeX(fromIndex);
                  const tx = nodeX(toIndex);
                  const span = Math.abs(fromIndex - toIndex);
                  const arcHeight = 52 + span * 22;
                  const y = NODE_Y - NODE_R - 8;
                  const dim = selectedId ? selectedId !== edge.fromId && selectedId !== edge.toId : false;
                  return (
                    <path
                      key={`return-${edge.fromId}-${edge.toId}`}
                      className={`disc-edge disc-edge-return ${dim ? "is-dim" : ""}`}
                      d={`M ${fx} ${y} Q ${(fx + tx) / 2} ${y - arcHeight} ${tx} ${y}`}
                      markerEnd="url(#disc-arrow-teal)"
                    >
                      <title>{`Returned: ${stepById.get(edge.fromId)!.window} → ${stepById.get(edge.toId)!.window}`}</title>
                    </path>
                  );
                })}

                {visibleSteps.map((step, index) => {
                  const x = nodeX(index);
                  const label = step.window.length > 24 ? `${step.window.slice(0, 22)}…` : step.window;
                  const badgeX = x + Math.min(step.window.length, 24) * 3.1 + 14;
                  return (
                    <g
                      key={step.id}
                      className={`disc-node ${selectedId === step.id ? "is-selected" : ""} ${isDim(step.id) ? "is-dim" : ""}`}
                      onClick={() => toggleStep(step.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") toggleStep(step.id); }}
                    >
                      <circle className="disc-node-circle" cx={x} cy={NODE_Y} r={NODE_R} fill={APP_COLORS[step.app]} />
                      <text className="disc-node-initials" x={x} y={NODE_Y + 5.5}>{step.initials}</text>
                      <text className="disc-node-name" x={x} y={NODE_Y + NODE_R + 24}>{label}</text>
                      <g className="disc-step-badge">
                        <rect x={badgeX} y={NODE_Y + NODE_R + 14} width="16" height="13" rx="3" />
                        <text x={badgeX + 8} y={NODE_Y + NODE_R + 24}>{index + 1}</text>
                      </g>
                      <text className="disc-node-sub" x={x} y={NODE_Y + NODE_R + 40}>
                        {formatClock(step.seconds)} · {step.keys} keys · {step.clicks} clicks
                      </text>
                      <title>{`${step.window} — ${step.app} (${step.exe})\n${formatClock(step.seconds)} dwell · ${step.keys} keystrokes · ${step.clicks} clicks · ${step.samples} samples`}</title>
                    </g>
                  );
                })}

                <path
                  className="disc-edge-primary"
                  d={`M ${nodeX(visibleSteps.length - 1) + NODE_R + 8} ${NODE_Y} L ${endX - 16} ${NODE_Y}`}
                  markerEnd="url(#disc-arrow-amber)"
                />
                <g className="disc-terminal">
                  <circle cx={endX} cy={NODE_Y} r="12" />
                  <path d={`M ${endX - 4} ${NODE_Y - 4} L ${endX + 4} ${NODE_Y + 4} M ${endX + 4} ${NODE_Y - 4} L ${endX - 4} ${NODE_Y + 4}`} />
                  <text x={endX} y={NODE_Y - 24}>End</text>
                </g>
              </svg>
            </div>
          </div>

          <div className="disc-top-pill">
            <span>TOP {visibleCount}</span>
            <input
              type="range"
              min={3}
              max={steps.length}
              value={visibleCount}
              onChange={event => setVisibleCount(Number(event.target.value))}
              aria-label="Number of steps shown"
            />
            <span>of {steps.length} steps</span>
          </div>
        </div>

        <aside className="discovery-side">
          <div className="disc-tile-grid">
            <StatTile accent="#0d9488" label="Observed time" value={formatClock(meta.observedSeconds)} detail={`${meta.started}–${meta.ended}`} />
            <StatTile accent="#2563eb" label="Interactions" value={String(meta.interactions)} detail={`${meta.keystrokes} keys · ${meta.clicks} clicks`} />
            <StatTile accent="#7c3aed" label="Transitions" value={String(meta.transitions)} detail="app / window switches" />
            <StatTile accent="#db2777" label="Activity samples" value={String(meta.samples)} detail={`${meta.sessions} session`} />
          </div>

          <div className="disc-panel">
            <h4>Steps by observed time</h4>
            {[...steps].sort((a, b) => b.seconds - a.seconds).map((step, rank) => (
              <div
                key={step.id}
                className={`disc-bar-row ${selectedId === step.id ? "is-selected" : ""}`}
                onClick={() => toggleStep(step.id)}
                role="button"
                tabIndex={0}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") toggleStep(step.id); }}
                title={`${step.window} · ${Math.round((step.seconds / meta.observedSeconds) * 100)}% of observed time`}
              >
                <span className="disc-bar-rank">#{rank + 1}</span>
                <div className="disc-bar-main">
                  <span className="disc-bar-name">{step.window}</span>
                  <div className="disc-bar-track">
                    <div className="disc-bar-fill" style={{ width: `${Math.max((step.seconds / maxStepSeconds) * 100, 2)}%` }} />
                  </div>
                </div>
                <span className="disc-bar-time">{formatClock(step.seconds)}</span>
              </div>
            ))}
          </div>

          <div className="disc-panel">
            <h4>Rework signals</h4>
            {reworkLoops.map(loop => (
              <div key={`${loop.aId}-${loop.bId}`} className="disc-loop-row">
                <strong>{shortName(stepById.get(loop.aId)!)} ⇄ {shortName(stepById.get(loop.bId)!)}</strong>
                <span>{loop.switches} switches</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="disc-filter-button"
            disabled={!selectedId}
            onClick={() => setSelectedId(null)}
          >
            {selectedId ? "Clear selection" : "Select a step to filter"}
          </button>
        </aside>
      </div>
    </section>
  );
}

function StatTile({ accent, label, value, detail }: { accent: string; label: string; value: string; detail: string }) {
  return (
    <div className="disc-tile" style={{ "--tile-accent": accent } as React.CSSProperties}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

function shortName(step: DiscoveryStep) {
  return step.window.length > 26 ? `${step.window.slice(0, 24)}…` : step.window;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
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
