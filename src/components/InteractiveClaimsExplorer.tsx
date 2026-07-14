"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const [revealOrigin, setRevealOrigin] = useState(0.72);
  const [fitRequest, setFitRequest] = useState(0);
  const [selectedCaseId, setSelectedCaseId] = useState(allCases[0]?.caseId || "");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [loopsOnly, setLoopsOnly] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [replayKey, setReplayKey] = useState(0);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => { setFitRequest(current => current + 1); }, [maximized]);

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
    setZoom(current => Math.min(2.6, Math.max(0.2, Number((current + amount).toFixed(2)))));
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
        <label className="loop-toggle"><input type="checkbox" checked={loopsOnly} onChange={event => { setLoopsOnly(event.target.checked); if (event.target.checked) setZoom(Math.min(2.6, revealOrigin + .45)); }} /> Waste loops only</label>
      </section>

      <section className="explorer-metrics">
        <ExplorerMetric label="Claims" value={cases.length.toLocaleString()} />
        <ExplorerMetric label="Activities" value={visibleActivities.toLocaleString()} />
        <ExplorerMetric label="Loop claims" value={loopClaims.length.toLocaleString()} danger />
        <ExplorerMetric label="Loop time" value={formatHours(loopHours)} danger />
        <ExplorerMetric label="Loop savings" value={formatSavings(loopSavings, loopCostAvailable)} detail={loopCostAvailable && loopCost ? `${(loopSavings / loopCost * 100).toFixed(1)}%` : undefined} danger />
      </section>

      <section className="explorer-workspace">
        <div className={`explorer-canvas-card ${maximized ? "is-maximized" : ""}`}>
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
              <button onClick={() => { setZoom(Math.min(2.6, revealOrigin + .45)); setReplayKey(current => current + 1); }} disabled={!selected?.loops.length}>Replay loops</button>
            </div>
            <div className="canvas-zoom">
              <button onClick={() => changeZoom(-0.08)} disabled={zoom <= 0.2}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => changeZoom(0.1)} disabled={zoom >= 2.6}>+</button>
              <button onClick={() => setFitRequest(current => current + 1)}>Fit</button>
              <button className="maximize-canvas" onClick={() => setMaximized(current => !current)}>{maximized ? "Exit" : "Maximize"}</button>
            </div>
          </div>
          {selected ? (
            <ClaimJourneyGraph claim={selected} zoom={zoom} revealOrigin={revealOrigin} fitRequest={fitRequest} onZoomChange={setZoom} onFit={scale => { setZoom(scale); setRevealOrigin(scale); }} loopsOnly={loopsOnly} selectedStep={selectedStep} onSelectStep={index => { setSelectedStep(index); setReplayKey(current => current + 1); }} playing={playing} speed={speed} replayKey={replayKey} />
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
                <button key={`${loop.activity}-${loop.fromIndex}`} className={selectedStep === loop.fromIndex ? "active" : ""} onClick={() => { setSelectedStep(loop.fromIndex); setZoom(Math.min(2.6, revealOrigin + .45 * ((loop.fromIndex + 1) / Math.max(selected.steps.length, 1)))); setReplayKey(current => current + 1); }}>
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
  revealOrigin,
  fitRequest,
  onZoomChange,
  onFit,
  loopsOnly,
  selectedStep,
  onSelectStep,
  playing,
  speed,
  replayKey,
}: {
  claim: ExplorerClaim;
  zoom: number;
  revealOrigin: number;
  fitRequest: number;
  onZoomChange: (zoom: number) => void;
  onFit: (zoom: number) => void;
  loopsOnly: boolean;
  selectedStep: number | null;
  onSelectStep: (index: number) => void;
  playing: boolean;
  speed: number;
  replayKey: number;
}) {
  const touchpointCount = Math.max(claim.steps.length, claim.straightPath.length, 1);
  const spacing = touchpointCount <= 6 ? 112 : touchpointCount <= 10 ? 92 : touchpointCount <= 15 ? 68 : 54;
  const expectedRadius = touchpointCount <= 8 ? 25 : touchpointCount <= 14 ? 21 : 18;
  const actualRadius = touchpointCount <= 8 ? 31 : touchpointCount <= 14 ? 26 : 22;
  const spineX = 580;
  const topY = 88;
  let expectedCursor = 0;
  let branchCount = 0;
  let accumulatedDelay = 0;
  const actualPoints = claim.steps.map((step, stepIndex) => {
    const nextMatch = claim.straightPath.findIndex((activity, index) => index >= expectedCursor && activity === step.activity);
    const followsExpected = nextMatch === expectedCursor && !step.isLoop;
    if (followsExpected) {
      const point = { x: spineX, y: topY + expectedCursor * spacing + accumulatedDelay, onSpine: true, expectedIndex: expectedCursor };
      expectedCursor += 1;
      return point;
    }
    if (nextMatch > expectedCursor && !step.isLoop) {
      expectedCursor = nextMatch + 1;
      return { x: spineX, y: topY + nextMatch * spacing + accumulatedDelay, onSpine: true, expectedIndex: nextMatch };
    }
    const referenceIndex = step.loopBackIndex ?? Math.max(0, expectedCursor - 1);
    const side = branchCount % 2 === 0 ? -1 : 1;
    const branchLane = Math.floor(branchCount / 2) % 2;
    const branchRow = Math.floor(branchCount / 4);
    const pointY = topY + Math.max(0, Math.min(claim.straightPath.length - 1, expectedCursor - 1)) * spacing + accumulatedDelay + spacing * .48;
    accumulatedDelay += spacing * .62;
    branchCount += 1;
    return {
      x: spineX + side * (210 + branchLane * 145),
      y: pointY + branchRow * spacing * .24,
      onSpine: false,
      expectedIndex: Math.max(0, referenceIndex),
      stepIndex,
    };
  });
  const width = 1160;
  const height = Math.max(620, topY + Math.max(claim.straightPath.length, 4) * spacing + 100, ...actualPoints.map(point => point.y + 105));
  const loopIndexes = new Set(claim.loops.flatMap(loop => [loop.fromIndex, loop.toIndex]));
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });
  const revealProgress = Math.min(1, Math.max(0, (zoom - revealOrigin) / Math.max(.01, Math.min(2.6, revealOrigin + .45) - revealOrigin)));
  const revealedSteps = revealProgress > 0 ? Math.max(1, Math.ceil(claim.steps.length * revealProgress)) : 0;
  const canvasScale = zoom;
  const expectedEndY = topY + Math.max(0, claim.straightPath.length - 1) * spacing;
  const revealedEndPoint = revealedSteps ? actualPoints[revealedSteps - 1] : null;

  const centerCanvas = (scale: number, behavior: ScrollBehavior = "auto") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      left: Math.max(0, (width * scale - viewport.clientWidth) / 2),
      top: Math.max(0, (height * scale - viewport.clientHeight) / 2),
      behavior,
    });
  };

  const fitCanvas = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const naturalFit = Math.min((viewport.clientWidth - 28) / width, (viewport.clientHeight - 28) / height);
    const maximumFit = touchpointCount <= 6 ? 1.15 : touchpointCount <= 10 ? 1 : touchpointCount <= 15 ? .88 : .76;
    const scale = Number(Math.min(maximumFit, Math.max(.22, naturalFit)).toFixed(2));
    onFit(scale);
    requestAnimationFrame(() => centerCanvas(scale, "smooth"));
  };

  useEffect(() => { fitCanvas(); }, [fitRequest, claim.caseId]);
  useEffect(() => { requestAnimationFrame(() => centerCanvas(canvasScale, "smooth")); }, [canvasScale]);

  const zoomAtPointer = (nextZoom: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounded = Number(Math.min(2.6, Math.max(.2, nextZoom)).toFixed(2));
    onZoomChange(bounded);
    void clientX;
    void clientY;
  };

  return (
    <div
      className={`journey-viewport ${dragRef.current.active ? "is-panning" : ""}`}
      ref={viewportRef}
      onWheel={event => {
        event.preventDefault();
        zoomAtPointer(zoom + (event.deltaY < 0 ? .05 : -.05), event.clientX, event.clientY);
      }}
      onPointerDown={event => {
        if ((event.target as Element).closest(".journey-node, .selected-loop")) return;
        const viewport = viewportRef.current;
        if (!viewport) return;
        dragRef.current = { active: true, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("is-panning");
      }}
      onPointerMove={event => {
        const viewport = viewportRef.current;
        if (!viewport || !dragRef.current.active) return;
        viewport.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x);
        viewport.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y);
      }}
      onPointerUp={event => {
        const viewport = viewportRef.current;
        dragRef.current.active = false;
        viewport?.classList.remove("is-panning");
        if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      }}
    >
      <div className="journey-reveal-status"><strong>{revealedSteps ? `${revealedSteps} of ${claim.steps.length} actual touchpoints` : "Expected straight process"}</strong><span>{revealedSteps ? "Zoom out to retract the actual journey" : "Zoom in to reveal actual touchpoints one by one"}</span><i><em style={{ width: `${revealProgress * 100}%` }} /></i></div>
      <div className="journey-scaler" style={{ width: width * canvasScale, height: height * canvasScale }}>
        <svg key={`${claim.caseId}-${replayKey}`} className={`journey-graph ${playing ? "is-playing" : "is-paused"}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ transform: `scale(${canvasScale})` }}>
          <defs>
            <marker id="arrow-normal" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#35afc0" /></marker>
            <marker id="arrow-waste" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626" /></marker>
            <marker id="arrow-ideal" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#35afc0" /></marker>
          </defs>
          {revealedSteps > 0 && <text x="720" y="48" className="journey-label">ACTUAL CLAIM JOURNEY · {revealedSteps}/{claim.steps.length} TOUCHPOINTS</text>}
          <text x="350" y="48" className="journey-label ideal-label">EXPECTED CLAIM PROCESS</text>
          {revealedEndPoint && revealedEndPoint.y > expectedEndY + 24 && <g className="journey-extension-marker">
            <path d={`M 1060 ${expectedEndY} L 1082 ${expectedEndY} L 1082 ${revealedEndPoint.y} L 1060 ${revealedEndPoint.y}`} />
            <text x="1052" y={(expectedEndY + revealedEndPoint.y) / 2} transform={`rotate(-90 1052 ${(expectedEndY + revealedEndPoint.y) / 2})`}>EXTRA TOUCH LENGTH</text>
          </g>}

          {!loopsOnly && claim.steps.slice(0, Math.max(0, revealedSteps - 1)).map((_, index) => {
            const from = actualPoints[index];
            const to = actualPoints[index + 1];
            const returns = to.y <= from.y;
            const nodeAnchor = actualRadius + 7;
            const routeX = index % 2 === 0 ? Math.max(from.x, to.x) + 115 : Math.min(from.x, to.x) - 115;
            const path = returns
              ? `M ${from.x} ${from.y + nodeAnchor} C ${routeX} ${from.y + nodeAnchor + 20}, ${routeX} ${to.y - nodeAnchor - 20}, ${to.x} ${to.y - nodeAnchor}`
              : from.x === to.x
                ? `M ${from.x} ${from.y + nodeAnchor} C ${from.x + (index % 2 === 0 ? 24 : -24)} ${(from.y + to.y) / 2}, ${to.x + (index % 2 === 0 ? -24 : 24)} ${(from.y + to.y) / 2}, ${to.x} ${to.y - nodeAnchor}`
                : `M ${from.x} ${from.y + nodeAnchor} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y - nodeAnchor}`;
            return <g key={`edge-${index}`} className={returns ? "actual-return-edge" : ""}>
              <path id={`forward-${index}`} pathLength="1" d={path} className={returns ? "loop-edge dramatic-edge" : "journey-edge dramatic-edge"} markerEnd={`url(#${returns ? "arrow-waste" : "arrow-normal"})`} />
              <circle className={`flow-token ${returns ? "loop-token" : "forward-token"}`} r="5"><animateMotion dur={`${Math.max(.8, 2.2 / speed)}s`} begin={`${index * .22}s`} repeatCount="indefinite"><mpath href={`#forward-${index}`} /></animateMotion></circle>
              <rect x={(from.x + to.x) / 2 - 34} y={(from.y + to.y) / 2 - 13} width="68" height="20" rx="10" className={returns ? "loop-time-bg" : "edge-time-bg"} />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 1} className={returns ? "loop-time" : "edge-time"}>{formatCompactHours(claim.steps[index + 1].waitHours)}</text>
            </g>;
          })}

          {claim.loops.filter(loop => loop.fromIndex < revealedSteps).map((loop, index) => {
            const from = actualPoints[loop.fromIndex];
            const to = actualPoints[loop.toIndex];
            if (!from || !to) return null;
            const routeX = index % 2 === 0 ? Math.max(from.x, to.x, spineX) + 145 + index * 24 : Math.min(from.x, to.x, spineX) - 145 - index * 24;
            const anchorOffset = routeX > spineX ? actualRadius : -actualRadius;
            return (
              <g key={`loop-${loop.fromIndex}`} className={selectedStep === loop.fromIndex ? "selected-loop" : ""} onClick={() => onSelectStep(loop.fromIndex)}>
                <path id={`loop-path-${loop.fromIndex}`} pathLength="1" d={`M ${from.x + anchorOffset} ${from.y} C ${routeX} ${from.y}, ${routeX} ${to.y}, ${to.x + anchorOffset} ${to.y}`} className="loop-edge dramatic-edge" markerEnd="url(#arrow-waste)" />
                <circle className="flow-token loop-token" r={selectedStep === loop.fromIndex ? 8 : 6}>
                  <animateMotion dur={`${Math.max(1.1, (3.5 + index * .35) / speed)}s`} begin={`${index * .45}s`} repeatCount="indefinite"><mpath href={`#loop-path-${loop.fromIndex}`} /></animateMotion>
                </circle>
                <rect x={routeX - 48} y={(from.y + to.y) / 2 - 13} width="96" height="22" rx="11" className="loop-time-bg" />
                <text x={routeX} y={(from.y + to.y) / 2 + 2} className="loop-time">{formatCompactHours(loop.wasteHours)} waste</text>
              </g>
            );
          })}

          {claim.steps.slice(0, revealedSteps).map((step, index) => {
            const point = actualPoints[index];
            const hidden = loopsOnly && !loopIndexes.has(index);
            return (
              <g key={`${step.activity}-${index}`} className={`journey-node vertical-actual-node ${point.onSpine ? "on-spine" : "branch-node"} ${step.isLoop ? "loop-node" : ""} ${index === claim.steps.length - 1 ? "journey-end-node" : ""} ${selectedStep === index ? "selected" : ""} ${hidden ? "muted-node" : ""}`} onClick={() => onSelectStep(index)}>
              <circle cx={point.x} cy={point.y} r={actualRadius} />
                <text x={point.x} y={point.y - 5} className="node-number">{index + 1}</text>
                <text x={point.x} y={point.y + 13} className="node-owner">{shortLabel(step.owner, 13)}</text>
                {index === claim.steps.length - 1 && <text x={point.x} y={point.y - actualRadius - 10} className="journey-end-label">END</text>}
                {!point.onSpine && <><rect x={point.x < spineX ? point.x - 198 : point.x + 48} y={point.y - 18} width="150" height="36" rx="8" /><text x={point.x < spineX ? point.x - 123 : point.x + 123} y={point.y + 4} className="node-label">{shortLabel(step.activity, 21)}</text></>}
                <title>{`${step.activity} | ${step.owner} | ${formatHours(step.waitHours)} since prior event`}</title>
              </g>
            );
          })}

          {claim.straightPath.slice(0, -1).map((_, index) => {
            const startY = topY + index * spacing + expectedRadius + 2;
            const endY = topY + (index + 1) * spacing - expectedRadius - 2;
            const bend = index % 2 === 0 ? 18 : -18;
            return <path key={`ideal-edge-${index}`} d={`M ${spineX} ${startY} C ${spineX + bend} ${(startY + endY) / 2}, ${spineX - bend} ${(startY + endY) / 2}, ${spineX} ${endY}`} className="ideal-edge" markerEnd="url(#arrow-ideal)" />;
          })}
          {claim.straightPath.map((activity, index) => {
            const y = topY + index * spacing;
            return <g key={`ideal-${activity}-${index}`} className="ideal-node vertical-ideal-node">
              <circle cx={spineX} cy={y} r={expectedRadius} />
              <text x={spineX} y={y + 4}>{index + 1}</text>
              <rect x={spineX - 210} y={y - 17} width="170" height="34" rx="8" />
              <text x={spineX - 125} y={y + 4}>{shortLabel(activity, 23)}</text>
            </g>;
          })}
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
