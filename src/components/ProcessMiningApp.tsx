"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import DeepDiveSolution, { type ClaimsAnalysis } from "@/components/DeepDiveSolution";

type Dataset = {
  id: string;
  name: string;
  original_filename: string | null;
  created_at: string;
  event_count: number;
  case_count: number;
};

type Preview = {
  uploadId: string;
  name: string;
  filename: string;
  rowCount: number;
  headers: string[];
  detectedMapping: Record<string, string>;
  sampleRows: Record<string, unknown>[];
};

type Analysis = {
  caseCount: number;
  eventCount: number;
  activityCount: number;
  variantCount: number;
  avgDurationHours: number;
  medianDurationHours?: number;
  p90DurationHours?: number;
  completionRate?: number;
  reworkRate: number;
  totalCost: number;
  activities: { name: string; count: number }[];
  transitions: { from: string; to: string; count: number; caseCount: number; avgHours: number }[];
  bottlenecks: {
    from: string;
    to: string;
    count: number;
    caseCount: number;
    avgHours: number;
    p90Hours: number;
    maxHours: number;
    severity: string;
    impactHours: number;
  }[];
  pathAnalysis: PathItem[];
  slowestPaths: PathItem[];
  fastestPaths: PathItem[];
  reworkPaths: PathItem[];
  objects: { name: string; count: number }[];
  recommendations: { severity: string; title: string; detail: string }[];
  claims: ClaimsAnalysis;
};

type PathItem = {
  path: string[];
  count: number;
  share: number;
  avgHours: number;
  p90Hours: number;
  repeatedSteps: number;
  status: string;
};

type DatasetDetail = {
  dataset: Dataset;
  analysis: Analysis;
  actionRules: unknown[];
};

const tabs = [
  ["deep-dive", "Deep Dive Solution"],
  ["map", "Process Map"],
  ["bottlenecks", "Bottlenecks"],
  ["paths", "Path Analysis"],
  ["queues", "Queues"],
  ["recommendations", "Recommendations"],
  ["objects", "Objects"],
  ["actions", "Actions"],
] as const;

export default function ProcessMiningApp() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("map");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadDatasets();
  }, []);

  async function loadDatasets() {
    const response = await fetch("/api/datasets");
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Unable to load datasets.");
      return;
    }
    setDatasets(body.datasets);
  }

  async function loadDataset(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/datasets/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load dataset.");
      setDetail(body);
      setSelectedId(id);
      setTab("map");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dataset.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/uploads/preview", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Upload failed.");
      setPreview(body);
      setMapping(body.detectedMapping || {});
      setDetail(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmUpload() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/uploads/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: preview.uploadId, mapping }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save dataset.");
      setPreview(null);
      await loadDatasets();
      await loadDataset(body.datasetId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save dataset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="brand">Process Intelligence Platform</div>
          <div className="brand-subtitle">Operational mining, queue insight, and exception analysis</div>
        </div>
        <nav>
          <button onClick={() => { setDetail(null); setPreview(null); }}>Datasets</button>
          <button onClick={() => document.getElementById("upload-card")?.scrollIntoView({ behavior: "smooth" })}>Upload Data</button>
        </nav>
      </header>
      <main>
        {error && <div className="notice error">{error}</div>}
        <section className="workspace-grid">
          <div id="upload-card" className="card">
            <div className="section-kicker">Data intake</div>
            <h1>Upload Process Data</h1>
            <p>Upload Excel or CSV, confirm the mapping, then run the analysis against the selected file.</p>
            <form onSubmit={upload}>
              <label>Dataset Name</label>
              <input name="name" defaultValue="Uploaded Process Data" />
              <label>Excel or CSV File</label>
              <input name="file" type="file" accept=".xlsx,.xlsm,.xls,.csv" required />
              <div className="form-actions">
                <button className="button" disabled={busy}>{busy ? "Working..." : "Preview Mapping"}</button>
              </div>
            </form>
          </div>
          <div className="card">
            <div className="section-kicker">Available analysis</div>
            <h2>Datasets</h2>
            <table>
              <thead><tr><th>Name</th><th>Cases</th><th>Events</th><th></th></tr></thead>
              <tbody>
                {datasets.map(dataset => (
                  <tr key={dataset.id}>
                    <td><strong>{dataset.name}</strong><br /><span className="metric-label">{dataset.original_filename || "uploaded data"}</span></td>
                    <td>{dataset.case_count}</td>
                    <td>{dataset.event_count}</td>
                    <td><button className="button secondary" onClick={() => void loadDataset(dataset.id)}>Open</button></td>
                  </tr>
                ))}
                {!datasets.length && <tr><td colSpan={4}>No datasets yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {preview && (
          <MappingPreview
            preview={preview}
            mapping={mapping}
            setMapping={setMapping}
            onConfirm={confirmUpload}
            busy={busy}
          />
        )}

        {detail && (
          <section className="analysis-stage">
            <Header detail={detail} />
            <div className="analysis-shell">
              <aside className="analysis-menu card">
                {tabs.map(([id, label]) => (
                  <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}<span>{countFor(id, detail.analysis)}</span></button>
                ))}
              </aside>
              <div>{renderTab(tab, detail.analysis)}</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function MappingPreview({
  preview,
  mapping,
  setMapping,
  onConfirm,
  busy,
}: {
  preview: Preview;
  mapping: Record<string, string>;
  setMapping: (mapping: Record<string, string>) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  function update(key: string, value: string) {
    setMapping({ ...mapping, [key]: value });
  }

  return (
    <section className="card mapping-card">
      <div className="section-kicker">Review before import</div>
      <h2>Confirm Mapping</h2>
      <div className="summary-row">
        <span>File: <strong>{preview.filename}</strong></span>
        <span>Rows: <strong>{preview.rowCount.toLocaleString()}</strong></span>
      </div>
      <div className="grid cols">
        <div>
          <Select label="Case ID" value={mapping.case_id || ""} headers={preview.headers} onChange={value => update("case_id", value)} />
          <Select label="Activity / Queue / Step" value={mapping.activity || ""} headers={preview.headers} onChange={value => update("activity", value)} />
          <Select label="Timestamp" value={mapping.timestamp || ""} headers={preview.headers} onChange={value => update("timestamp", value)} />
        </div>
        <div>
          <Select label="Resource / User" value={mapping.resource || ""} headers={preview.headers} onChange={value => update("resource", value)} optional />
          <Select label="Cost / Amount" value={mapping.cost || ""} headers={preview.headers} onChange={value => update("cost", value)} optional />
          <div className="form-actions"><button className="button" onClick={onConfirm} disabled={busy}>{busy ? "Saving..." : "Run Analysis"}</button></div>
        </div>
      </div>
      <h3 className="subsection-title">Data Preview</h3>
      <div style={{ overflow: "auto" }}>
        <table>
          <thead><tr>{preview.headers.slice(0, 10).map(header => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {preview.sampleRows.map((row, index) => (
              <tr key={index}>{preview.headers.slice(0, 10).map(header => <td key={header}>{String(row[header] ?? "").slice(0, 90)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Select({ label, value, headers, optional, onChange }: { label: string; value: string; headers: string[]; optional?: boolean; onChange: (value: string) => void }) {
  return (
    <>
      <label>{label}</label>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {optional && <option value="">Not used</option>}
        {!optional && <option value="">Select column</option>}
        {headers.map(header => <option key={header} value={header}>{header}</option>)}
      </select>
    </>
  );
}

function Header({ detail }: { detail: DatasetDetail }) {
  const a = detail.analysis;
  const topBottleneck = a.bottlenecks[0];
  const topPath = a.pathAnalysis[0];
  return (
    <>
      <div className="analysis-hero">
        <div>
          <div className="section-kicker">Current dataset</div>
          <h1>{detail.dataset.name}</h1>
          <p>{detail.dataset.original_filename || "Uploaded dataset"}</p>
        </div>
        <div className="hero-status">
          <span className={`badge ${topBottleneck?.severity || "Low"}`}>{topBottleneck?.severity || "Low"} risk</span>
          <strong>{topBottleneck ? `${topBottleneck.from} to ${topBottleneck.to}` : "No bottleneck detected"}</strong>
        </div>
      </div>
      <section className="grid kpis">
        <Kpi label="Cases" value={a.caseCount.toLocaleString()} detail={`${a.variantCount.toLocaleString()} variants`} tone="blue" />
        <Kpi label="Events" value={a.eventCount.toLocaleString()} detail={`${a.activityCount.toLocaleString()} activities`} tone="teal" />
        <Kpi label="Avg Duration" value={formatHours(a.avgDurationHours)} detail={`P90 ${formatHours(a.p90DurationHours || 0)}`} tone={a.avgDurationHours >= 120 ? "amber" : "green"} />
        <Kpi label="Rework Rate" value={`${a.reworkRate.toFixed(1)}%`} detail={a.reworkRate > 20 ? "Loop reduction needed" : "Within target range"} tone={a.reworkRate > 20 ? "red" : "green"} />
        <Kpi label="Top Path Share" value={topPath ? `${topPath.share.toFixed(1)}%` : "0%"} detail={topPath ? `${topPath.count.toLocaleString()} cases` : "No path data"} tone="purple" />
        <Kpi label="Total Cost" value={`$${a.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} detail="Mapped cost field" tone="slate" />
      </section>
    </>
  );
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className={`kpi-card tone-${tone || "slate"}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  );
}

function renderTab(tab: string, analysis: Analysis) {
  if (tab === "deep-dive") return <DeepDiveSolution analysis={analysis} />;
  if (tab === "map") return <MapPanel analysis={analysis} />;
  if (tab === "bottlenecks") return <Bottlenecks analysis={analysis} />;
  if (tab === "paths") return <Paths analysis={analysis} />;
  if (tab === "queues") return <Queues analysis={analysis} />;
  if (tab === "recommendations") return <Recommendations analysis={analysis} />;
  if (tab === "objects") return <Objects analysis={analysis} />;
  return <Actions />;
}

type MapSignal = {
  id: string;
  type: "queue" | "movement";
  title: string;
  subtitle: string;
  count: number;
  avgHours?: number;
  share: number;
  tone: "normal" | "watch" | "loop" | "critical";
  description: string;
  interpretation: string;
  durationClass?: "fast" | "steady" | "slow" | "late";
  durationLabel?: string;
  timeline: { label: string; detail: string; tone?: "fast" | "steady" | "slow" | "late" | "loop" }[];
};

function MapPanel({ analysis }: { analysis: Analysis }) {
  const [zoom, setZoom] = useState(0.82);
  const [playing, setPlaying] = useState(true);
  const [selectedSignalRaw, setSelectedSignalRaw] = useState(null);
  const [selectedModal, setSelectedModal] = useState<"timeline" | "transition" | null>(null);
  const openTimeline = (signal: MapSignal) => { setSelectedSignalRaw(signal as never); setSelectedModal("timeline"); };
  const openTransition = (signal: MapSignal) => { setSelectedSignalRaw(signal as never); setSelectedModal("transition"); };
  const closeTimeline = () => { setSelectedSignalRaw(null as never); setSelectedModal(null); };
  const map = useMemo(() => ({ caseCount: analysis.caseCount, activities: analysis.activities, transitions: analysis.transitions }), [analysis]);
  const visibleActivities = useMemo(() => map.activities.slice(0, 22), [map.activities]);
  const visibleNames = useMemo(() => new Set(visibleActivities.map(item => item.name)), [visibleActivities]);
  const totalEvents = Math.max(visibleActivities.reduce((sum, item) => sum + item.count, 0), 1);
  const maxActivityCount = Math.max(...visibleActivities.map(item => item.count), 1);
  const topTransitions = useMemo(() => map.transitions
    .filter(item => visibleNames.has(item.from) && visibleNames.has(item.to))
    .sort((left, right) => right.caseCount - left.caseCount)
    .slice(0, 48), [map.transitions, visibleNames]);
  const maxTransitionCount = Math.max(...topTransitions.map(item => item.caseCount), 1);
  const maxTransitionWait = Math.max(...topTransitions.map(item => item.avgHours), 1);
  const durationClass = (hours: number) => hours <= 24 ? "fast" : hours <= 72 ? "steady" : hours <= 168 ? "slow" : "late";
  const durationLabel = (hours: number) => hours <= 24 ? "Fast" : hours <= 72 ? "Steady" : hours <= 168 ? "Slow" : "Late";
  const motionDuration = (hours: number) => {
    const normalized = Math.min(1, Math.max(0, hours / Math.max(maxTransitionWait, 1)));
    return (2.8 + normalized * 9.2).toFixed(1);
  };
  const changeZoom = (amount: number) => setZoom(current => Number(Math.min(1.55, Math.max(0.45, current + amount)).toFixed(2)));
  const compactCount = (count: number) => count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K` : count.toLocaleString();

  const width = 1540;
  const height = 760;
  const startX = 36;
  const endX = 1498;
  const baseline = 402;
  const nodeByName = new Map(visibleActivities.map((activity, index) => {
    const usableWidth = 1280;
    const x = visibleActivities.length <= 1 ? width / 2 : 132 + (usableWidth / Math.max(1, visibleActivities.length - 1)) * index;
    const yOffsets = [0, -42, 42, -88, 88, -132, 132];
    const y = baseline + yOffsets[index % yOffsets.length];
    return [activity.name, { ...activity, index, x, y }];
  }));

  const makeQueueSignal = (activity: { name: string; count: number; x: number; y: number }): MapSignal => {
    const share = activity.count / totalEvents * 100;
    const inbound = topTransitions.filter(item => item.to === activity.name).reduce((sum, item) => sum + item.caseCount, 0);
    const outbound = topTransitions.filter(item => item.from === activity.name).reduce((sum, item) => sum + item.caseCount, 0);
    const loopCount = topTransitions.filter(item => item.from === activity.name && item.to === activity.name).reduce((sum, item) => sum + item.caseCount, 0);
    const relatedTransitions = topTransitions.filter(item => item.from === activity.name || item.to === activity.name);
    const avgWait = relatedTransitions.length ? relatedTransitions.reduce((sum, item) => sum + item.avgHours, 0) / relatedTransitions.length : 0;
    const tone = loopCount > 0 ? "loop" : avgWait > 72 ? "critical" : avgWait > 24 ? "watch" : "normal";
    return {
      id: `queue:${activity.name}`,
      type: "queue",
      title: activity.name,
      subtitle: `${activity.count.toLocaleString()} events | ${share.toFixed(1)}% of visible activity`,
      count: activity.count,
      avgHours: avgWait || undefined,
      share,
      tone,
      description: `This queue represents work items recorded at ${activity.name}. The pill size and label follow the reference map style: compact queue node, count above the node, and flow lines routed around it.`,
      durationClass: avgWait ? durationClass(avgWait) : "fast",
      durationLabel: avgWait ? durationLabel(avgWait) : "Fast",
      timeline: [
        { label: "Inbound", detail: `${inbound.toLocaleString()} visible claims arrive here`, tone: inbound > outbound * 1.25 ? "slow" : "fast" },
        { label: "Queue age", detail: avgWait ? `${formatHours(avgWait)} average connected wait` : "No connected wait detected", tone: avgWait ? durationClass(avgWait) : "fast" },
        { label: "Loop check", detail: loopCount ? `${loopCount.toLocaleString()} claims return through this queue` : "No self-loop in the visible paths", tone: loopCount ? "loop" : "fast" },
        { label: "Outbound", detail: `${outbound.toLocaleString()} visible claims leave this queue`, tone: outbound < inbound * .75 ? "slow" : "fast" },
      ],
      interpretation: loopCount > 0
        ? `${activity.name} participates in rework. ${loopCount.toLocaleString()} visible claims loop back through this queue, so spacing around the loop should be watched for avoidable cycling.`
        : inbound > outbound * 1.25
          ? `${activity.name} receives more visible flow than it releases. That pattern can indicate local queue buildup or downstream waiting.`
          : avgWait > 24
            ? `${activity.name} has elevated wait exposure. Review owners, handoff rules, and exception criteria before this step.`
            : `${activity.name} is moving proportionally with the surrounding flow. It does not stand out as the primary delay point in the current segment.`,
    };
  };

  const makeMovementSignal = (transition: Analysis["transitions"][number], isLoop: boolean): MapSignal => {
    const share = transition.caseCount / Math.max(map.caseCount, 1) * 100;
    const durationTone = durationClass(transition.avgHours);
    const tone = isLoop ? "loop" : durationTone === "late" ? "critical" : durationTone === "slow" ? "watch" : "normal";
    return {
      id: `move:${transition.from}->${transition.to}`,
      type: "movement",
      title: `${transition.from} -> ${transition.to}`,
      subtitle: `${transition.caseCount.toLocaleString()} claims | ${share.toFixed(1)}% of cases`,
      count: transition.caseCount,
      avgHours: transition.avgHours,
      share,
      tone,
      durationClass: durationTone,
      durationLabel: durationLabel(transition.avgHours),
      timeline: [
        { label: "Started", detail: transition.from, tone: "fast" },
        { label: "Processing age", detail: `${formatHours(transition.avgHours)} average time on this handoff`, tone: durationTone },
        { label: "Completed", detail: transition.to, tone: durationTone },
        { label: "Volume", detail: `${transition.caseCount.toLocaleString()} claims use this path`, tone: transition.caseCount > maxTransitionCount * .4 ? "steady" : "fast" },
      ],
      description: "The moving button is a claim token traveling along this connector. Its color represents how long the claim took to process: green is fast, yellow is steady, orange is slow, and red is late.",
      interpretation: isLoop
        ? `This is a loopback path. Claims return from ${transition.from} to ${transition.to}, which usually means rework, missing information, reassignment, or policy exception handling.`
        : transition.avgHours > 72
          ? `This handoff is slow at ${formatHours(transition.avgHours)} on average. Treat it as a high-risk delay path and inspect ownership, queue capacity, and approval dependency.`
          : transition.avgHours > 24
            ? "This handoff has moderate waiting time. It may not be the largest bottleneck, but reducing queue time here can improve end-to-end flow."
            : "This handoff appears to move normally for the selected segment. Its count is useful for volume context, but the wait time is not the main concern.",
    };
  };

  const activeSignal = selectedSignalRaw as MapSignal | null;

  const transitionPath = (from: { x: number; y: number; index: number }, to: { x: number; y: number; index: number }, order: number, isLoop: boolean) => {
    if (isLoop && from.index === to.index) {
      const spread = 34 + (order % 5) * 13;
      return `M ${from.x - 34} ${from.y - 13} C ${from.x - 92} ${from.y - spread}, ${from.x + 92} ${from.y - spread}, ${from.x + 34} ${from.y - 13}`;
    }
    const direction = to.index >= from.index ? 1 : -1;
    const loopLane = direction < 0 ? 86 + (order % 8) * 23 : 28 + (order % 5) * 10;
    const vertical = direction < 0 ? loopLane * (order % 2 === 0 ? -1 : 1) : (to.y - from.y) * 0.35 - loopLane;
    const c1x = from.x + Math.max(48, Math.abs(to.x - from.x) * 0.38) * direction;
    const c2x = to.x - Math.max(48, Math.abs(to.x - from.x) * 0.38) * direction;
    return `M ${from.x + 66 * direction} ${from.y} C ${c1x} ${from.y + vertical}, ${c2x} ${to.y + vertical}, ${to.x - 66 * direction} ${to.y}`;
  };

  return <section className="card process-map-card timelinepi-map-card">
    <PanelHeader kicker="Process map" title="Timeline-style milestone flow" detail="Moving claim tokens can be clicked for queue descriptions and operational interpretation." />
    <div className="map-toolbar">
      <div className="map-motion-controls" aria-label="Map motion controls">
        <button className="icon-button" type="button" onClick={() => setPlaying(value => !value)} title={playing ? "Pause motion" : "Play motion"}>{playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={() => changeZoom(-0.12)} disabled={zoom <= 0.45}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => changeZoom(0.12)} disabled={zoom >= 1.55}>+</button>
        <button type="button" onClick={() => setZoom(0.72)}>Fit</button>
      </div>
    </div>

    <div className="timelinepi-map-grid timelinepi-map-grid-full">
      <div className="timelinepi-map-shell">
        <div className="map-scaler" style={{ width: width * zoom, height: height * zoom }}>
          <svg className={`milestone-process-map timelinepi-process-map ${playing ? "is-playing" : "is-paused"}`} viewBox={`0 0 ${width} ${height}`} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} role="img" aria-label="Timeline-style process map">
            <defs>
              <marker id="timelinepi-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
              <marker id="timelinepi-loop-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
              <filter id="timelinepi-token-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.24" /></filter>
            </defs>

            <g className="timelinepi-terminal start">
              <circle cx={startX} cy={baseline} r="11" />
              <text x={startX} y={baseline - 20}>Start</text>
            </g>
            <g className="timelinepi-terminal end">
              <circle cx={endX} cy={baseline + 48} r="11" />
              <path d={`M ${endX - 4} ${baseline + 44} L ${endX + 4} ${baseline + 52} M ${endX + 4} ${baseline + 44} L ${endX - 4} ${baseline + 52}`} />
              <text x={endX} y={baseline + 80}>End</text>
            </g>

            {visibleActivities.slice(0, 6).map((item, index) => {
              const node = nodeByName.get(item.name)!;
              const y = baseline - 60 - index * 22;
              const path = `M ${startX + 14} ${baseline} C ${node.x * 0.35} ${y}, ${node.x * 0.72} ${y}, ${node.x - 76} ${node.y}`;
              return <path key={`start-${item.name}`} className="timelinepi-edge terminal-edge" d={path} markerEnd="url(#timelinepi-arrow)" />;
            })}

            {visibleActivities.slice(-6).map((item, index) => {
              const node = nodeByName.get(item.name)!;
              const y = baseline + 96 + index * 18;
              const path = `M ${node.x + 76} ${node.y} C ${node.x + 180} ${y}, ${endX - 150} ${y}, ${endX - 14} ${baseline + 48}`;
              return <path key={`end-${item.name}`} className="timelinepi-edge terminal-edge" d={path} markerEnd="url(#timelinepi-arrow)" />;
            })}

            {topTransitions.map((transition, index) => {
              const from = nodeByName.get(transition.from);
              const to = nodeByName.get(transition.to);
              if (!from || !to) return null;
              const isLoop = transition.from === transition.to || to.index < from.index;
              const id = `timelinepi-path-${index}`;
              const path = transitionPath(from, to, index, isLoop);
              const strokeWidth = 0.8 + transition.caseCount / maxTransitionCount * 3.2;
              const signal = makeMovementSignal(transition, isLoop);
              return <g key={id} className={`timelinepi-edge-group ${isLoop ? "is-loop" : ""} ${activeSignal?.id === signal.id ? "is-selected" : ""}`}>
                <path id={id} className="timelinepi-edge" d={path} strokeWidth={strokeWidth} markerEnd={`url(#${isLoop ? "timelinepi-loop-arrow" : "timelinepi-arrow"})`} />
                <path className="timelinepi-edge-hit" d={path} onClick={() => openTransition(signal)} />
                <text className="timelinepi-edge-count"><textPath href={`#${id}`} startOffset="50%">{transition.caseCount.toLocaleString()}</textPath></text>
                <circle className={`timelinepi-token ${signal.tone} speed-${signal.durationClass}`} r={isLoop ? 5.2 : 4.5} filter="url(#timelinepi-token-shadow)" onClick={event => { event.stopPropagation(); openTimeline(signal); }}>
                  <animateMotion dur={`${motionDuration(transition.avgHours)}s`} repeatCount="indefinite" rotate="auto" begin={`${(index % 10) * 0.28}s`}>
                    <mpath href={`#${id}`} />
                  </animateMotion>
                  <title>{signal.title}</title>
                </circle>
                <circle className="timelinepi-token-hit" r="14" onClick={event => { event.stopPropagation(); openTimeline(signal); }}>
                  <animateMotion dur={`${motionDuration(transition.avgHours)}s`} repeatCount="indefinite" rotate="auto" begin={`${(index % 10) * 0.28}s`}>
                    <mpath href={`#${id}`} />
                  </animateMotion>
                </circle>
              </g>;
            })}

            {visibleActivities.map(item => {
              const node = nodeByName.get(item.name)!;
              const signal = makeQueueSignal(node);
              const nodeWidth = Math.max(108, Math.min(172, 92 + item.count / maxActivityCount * 52));
              const label = item.name.length > 20 ? `${item.name.slice(0, 18)}...` : item.name;
              return <g key={item.name} className={`timelinepi-node ${signal.tone} ${activeSignal?.id === signal.id ? "is-selected" : ""}`}>
                <text className="timelinepi-node-count" x={node.x + nodeWidth / 2 - 12} y={node.y - 15}>{compactCount(item.count)}</text>
                <rect x={node.x - nodeWidth / 2} y={node.y - 11} width={nodeWidth} height="22" rx="11" />
                <circle cx={node.x - nodeWidth / 2 + 12} cy={node.y} r="5" />
                <text className="timelinepi-node-label" x={node.x - nodeWidth / 2 + 23} y={node.y + 3}>{label}</text>
                <title>{signal.title}</title>
              </g>;
            })}
          </svg>
        </div>
      </div>


    </div>

    {activeSignal && selectedModal === "timeline" && <div className="timeline-modal-backdrop" role="dialog" aria-modal="true" aria-label="Timeline details">
      <div className="timeline-modal-window">
        <button className="timeline-modal-close" type="button" onClick={closeTimeline} aria-label="Close timeline">x</button>
        <header className="timeline-modal-header">
          <h2>Timeline #{Math.abs(activeSignal.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) * 971).toString()}</h2>
          <button type="button">Export</button>
          <button type="button">Open in new window</button>
        </header>
        <div className="timeline-modal-body">
          <button className="timeline-modal-arrow left" type="button" aria-label="Previous timeline">‹</button>
          <div className="timeline-event-canvas">
            <div className="timeline-event-line" />
            {activeSignal.timeline.map((item, index) => {
              const y = 42 + index * 64 + (index > 2 ? 210 : 0);
              const isGap = index === 2 && activeSignal.avgHours;
              return <div className="timeline-event-row" style={{ top: y }} key={`${activeSignal.id}-modal-${index}`}>
                {isGap && <div className={`timeline-gap-label ${activeSignal.durationClass || "fast"}`}>{formatHours(activeSignal.avgHours || 0)}</div>}
                <div className="timeline-event-time">{index === 0 ? "Start" : index === activeSignal.timeline.length - 1 ? "Complete" : `Step ${index + 1}`}</div>
                <span className={`timeline-event-index ${item.tone || activeSignal.durationClass || "fast"}`}>{index + 1}</span>
                <div className="timeline-event-text"><b>{item.label}</b><span>{item.detail}</span></div>
              </div>;
            })}
          </div>
          <aside className="timeline-modal-side">
            <section>
              <h3>Tags</h3>
              <select><option>Add new tag</option></select>
            </section>
            <section>
              <h3>View</h3>
              <label><input type="checkbox" /> Show subprocesses</label>
              <label><input type="checkbox" defaultChecked /> Show attributes</label>
              <label><input type="checkbox" defaultChecked /> Change only</label>
              <label><input type="checkbox" defaultChecked /> Show duration</label>
            </section>
            <section>
              <h3>Statistics</h3>
              <dl>
                <div><dt>Duration</dt><dd>{activeSignal.avgHours ? formatHours(activeSignal.avgHours) : "0 hours"}</dd></div>
                <div><dt>Number of events</dt><dd>{activeSignal.count.toLocaleString()}</dd></div>
                <div><dt>Number of unique events</dt><dd>{activeSignal.timeline.length}</dd></div>
                <div><dt>Max gap</dt><dd>{activeSignal.avgHours ? formatHours(activeSignal.avgHours) : "0 hours"}</dd></div>
                <div><dt>Average gap</dt><dd>{activeSignal.avgHours ? formatHours((activeSignal.avgHours || 0) / Math.max(activeSignal.timeline.length - 1, 1)) : "0 hours"}</dd></div>
                <div><dt>Cost</dt><dd>0 $</dd></div>
              </dl>
            </section>
          </aside>
          <button className="timeline-modal-arrow right" type="button" aria-label="Next timeline">›</button>
        </div>
      </div>
    </div>}

    {activeSignal && selectedModal === "transition" && <div className="transition-modal-backdrop" role="dialog" aria-modal="true" aria-label="Process transition">
      <div className="transition-modal-window">
        <button className="transition-modal-close" type="button" onClick={closeTimeline} aria-label="Close transition">x</button>
        <header><h2>Process transition</h2></header>
        <div className="transition-modal-content">
          <h3>Duration of selected transition</h3>
          <div className="transition-range-row">
            <label><span>MIN</span><input value="0" readOnly /><small>secs</small></label>
            <div className="transition-average"><span>Average</span><b>{activeSignal.avgHours ? formatHours(activeSignal.avgHours) : "0 hours"}</b><small>min - max</small></div>
            <label><span>MAX</span><input value={String(Math.round((activeSignal.avgHours || 0) * 3600 * 2))} readOnly /><small>secs</small></label>
          </div>
          <div className="transition-distribution">
            <div className={`transition-spike ${activeSignal.durationClass || "fast"}`} />
            <div className="transition-line" />
            <span className="transition-min-pill">0</span>
            <span className="transition-max-pill">{activeSignal.avgHours ? formatHours(activeSignal.avgHours * 2) : "0 hours"}</span>
            <span className="transition-handle left" />
            <span className="transition-handle right" />
          </div>
          <h3>Breakdown by dimensions</h3>
          <div className="transition-breakdown-card"><b>{activeSignal.title.split(" -> ")[1] || activeSignal.title}</b><span>{activeSignal.share.toFixed(0)}% ({activeSignal.count.toLocaleString()})</span></div>
        </div>
        <footer><button type="button" onClick={closeTimeline}>Cancel</button><button type="button" onClick={closeTimeline}>Apply</button></footer>
      </div>
    </div>}
  </section>;
}

type MapAnalysis = {
  caseCount: number;
  activities: { name: string; count: number }[];
  transitions: Analysis["transitions"];
  starts: { name: string; count: number }[];
  ends: { name: string; count: number }[];
};

function buildMapSvg(analysis: MapAnalysis): { svg: string; width: number; height: number } {
  const transitions = [...analysis.transitions]
    .sort((a, b) => a.count - b.count)
    .slice(-90);
  const activities = [...new Set(transitions.flatMap(item => [item.from, item.to]))];
  const volume = new Map(analysis.activities.map(item => [item.name, item.count]));
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  transitions.forEach(transition => {
    if (transition.from === transition.to) return;
    const targets = adjacency.get(transition.from) || [];
    targets.push(transition.to);
    adjacency.set(transition.from, targets);
    const sources = reverseAdjacency.get(transition.to) || [];
    sources.push(transition.from);
    reverseAdjacency.set(transition.to, sources);
  });

  const weightedDegree = new Map<string, number>();
  transitions.forEach(transition => {
    weightedDegree.set(transition.from, (weightedDegree.get(transition.from) || 0) + transition.count);
    weightedDegree.set(transition.to, (weightedDegree.get(transition.to) || 0) + transition.count);
  });
  const hub = [...activities].sort((a, b) => (weightedDegree.get(b) || 0) - (weightedDegree.get(a) || 0) || (volume.get(b) || 0) - (volume.get(a) || 0))[0];
  const distances = (start: string, graph: Map<string, string[]>) => {
    const result = new Map<string, number>([[start, 0]]);
    const pending = [start];
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const source = pending[cursor];
      (graph.get(source) || []).forEach(target => {
        if (!result.has(target)) {
          result.set(target, (result.get(source) || 0) + 1);
          pending.push(target);
        }
      });
    }
    return result;
  };
  const downstreamDistance = distances(hub, adjacency);
  const upstreamDistance = distances(hub, reverseAdjacency);
  const startNames = new Set(analysis.starts.map(item => item.name));
  const endNames = new Set(analysis.ends.map(item => item.name));
  const upstream: string[] = [];
  const downstream: string[] = [];
  activities.filter(activity => activity !== hub).forEach(activity => {
    const upstreamSteps = upstreamDistance.get(activity);
    const downstreamSteps = downstreamDistance.get(activity);
    if (startNames.has(activity) && !endNames.has(activity)) upstream.push(activity);
    else if (endNames.has(activity) && !startNames.has(activity)) downstream.push(activity);
    else if (upstreamSteps !== undefined && (downstreamSteps === undefined || upstreamSteps < downstreamSteps)) upstream.push(activity);
    else if (downstreamSteps !== undefined) downstream.push(activity);
    else (upstream.length <= downstream.length ? upstream : downstream).push(activity);
  });
  upstream.sort((a, b) => (upstreamDistance.get(a) || 99) - (upstreamDistance.get(b) || 99) || (volume.get(b) || 0) - (volume.get(a) || 0));
  downstream.sort((a, b) => (downstreamDistance.get(a) || 99) - (downstreamDistance.get(b) || 99) || (volume.get(b) || 0) - (volume.get(a) || 0));

  const width = Math.max(2800, activities.length * 140);
  const height = 1160;
  const centerY = 610;
  const hubX = width / 2;
  const positions = new Map<string, [number, number]>();
  const laneOffsets = [0, -82, 82, -41, 41];
  if (hub) positions.set(hub, [hubX, centerY]);
  const placeSide = (items: string[], direction: -1 | 1) => {
    const innerX = hubX + direction * 235;
    const outerX = direction < 0 ? 150 : width - 150;
    items.forEach((activity, index) => {
      const progress = items.length === 1 ? 0 : index / (items.length - 1);
      const x = innerX + (outerX - innerX) * progress;
      positions.set(activity, [x, centerY + laneOffsets[index % laneOffsets.length]]);
    });
  };
  placeSide(upstream, -1);
  placeSide(downstream, 1);

  const maxCount = Math.max(...transitions.map(item => item.count), 1);
  const maxWait = Math.max(...transitions.map(item => item.avgHours), 1);
  const palette = ["#78C878", "#B3D766", "#E2CC45", "#F47B67"];
  const edgeSvg = transitions.map((transition, index) => {
    const [x1, y1] = positions.get(transition.from) || [0, 0];
    const [x2, y2] = positions.get(transition.to) || [0, 0];
    const isLoop = transition.from === transition.to;
    const weight = Math.sqrt(transition.count / maxCount);
    const strokeWidth = .6 + weight * 3.4 + (isLoop ? .35 : 0);
    const opacity = .18 + weight * .68;
    const pathId = `process-edge-${index}`;
    let path: string;
    if (isLoop) {
      const direction = index % 2 ? -1 : 1;
      const anchorX = x1 + direction * 70;
      const controlX = x1 + direction * (102 + weight * 42);
      const loopHeight = 44 + weight * 58;
      path = `M ${anchorX} ${y1 - 18} C ${controlX} ${y1 - loopHeight}, ${controlX} ${y1 + loopHeight}, ${anchorX} ${y1 + 18}`;
    } else if (x2 > x1 + 10) {
      const startX = x1 + 76;
      const endX = x2 - 76;
      const bend = Math.max(55, (endX - startX) * .42);
      path = `M ${startX} ${y1} C ${startX + bend} ${y1}, ${endX - bend} ${y2}, ${endX} ${y2}`;
    } else if (Math.abs(x2 - x1) <= 10) {
      const side = index % 2 ? -1 : 1;
      const edgeX = x1 + side * 76;
      const controlX = x1 + side * (125 + weight * 55);
      path = `M ${edgeX} ${y1} C ${controlX} ${y1}, ${controlX} ${y2}, ${edgeX} ${y2}`;
    } else {
      const startX = x1 - 76;
      const endX = x2 + 76;
      const controlY = Math.max(42, Math.min(y1, y2) - 105 - (index % 5) * 30);
      path = `M ${startX} ${y1} C ${startX - 90} ${controlY}, ${endX + 90} ${controlY}, ${endX} ${y2}`;
    }
    const tokenCount = Math.min(5, Math.max(1, 1 + Math.floor(weight * 4)));
    const baseDuration = Math.max(2.2, 8.5 - weight * 3.5 + transition.avgHours / maxWait * 3);
    const ageBand = Math.min(3, Math.floor(transition.avgHours / maxWait * 4));
    const tokens = Array.from({ length: tokenCount }, (_, tokenIndex) => {
      const tokenBand = Math.min(3, ageBand + Math.floor(tokenIndex / 3));
      const color = palette[tokenBand];
      const ageSpeed = [10, 2, 1.3, .8][tokenBand];
      const duration = baseDuration / ageSpeed;
      const offset = duration / tokenCount * tokenIndex;
      const radius = (2.3 + weight * 1.3) * 2 * (isLoop ? 1.7 : 1);
      return `<circle class="map-token${isLoop ? " self-loop-token" : ""}" r="${radius.toFixed(2)}" fill="${color}" stroke="${isLoop ? "#FFFFFF" : "none"}" stroke-width="${isLoop ? "1.2" : "0"}" opacity=".96"><animateMotion dur="${duration.toFixed(2)}s" begin="-${offset.toFixed(2)}s" repeatCount="indefinite"><mpath href="#${pathId}" /></animateMotion></circle>`;
    }).join("");
    const label = isLoop
      ? `<text class="map-edge-label" x="${x1}" y="${y1 - 29}" text-anchor="middle">${transition.caseCount.toLocaleString()}</text>`
      : weight > .46 ? `<text class="map-edge-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}" text-anchor="middle">${transition.caseCount.toLocaleString()}</text>` : "";
    const title = `${escapeHtml(transition.from)} to ${escapeHtml(transition.to)} | ${transition.caseCount.toLocaleString()} claims | ${transition.count.toLocaleString()} movements | ${formatHours(transition.avgHours)}`;
    return `<g class="process-edge-group ${isLoop ? "self-loop" : ""}"><title>${title}</title><path id="${pathId}" class="process-edge" d="${path}" fill="none" stroke="${isLoop ? "#2F9E44" : "#35AFC0"}" stroke-width="${strokeWidth.toFixed(2)}" opacity="${opacity.toFixed(2)}" marker-end="url(#${isLoop ? "arrow-loop" : "arrow"})"/><path class="process-edge-hit" d="${path}" fill="none" stroke="transparent" stroke-width="${Math.max(14, strokeWidth + 8).toFixed(2)}"/>${tokens}${label}</g>`;
  }).join("");

  const compact = (count: number) => count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : count.toLocaleString();
  const nodeSvg = activities.map(activity => {
    const [x, y] = positions.get(activity) || [0, 0];
    const count = volume.get(activity) || 0;
    const label = activity.length > 24 ? `${activity.slice(0, 21)}...` : activity;
    return `<g class="process-node"><title>${escapeHtml(activity)} | ${count.toLocaleString()} events</title><rect x="${x - 76}" y="${y - 15}" width="152" height="30" rx="15"/><circle cx="${x - 61}" cy="${y}" r="9"/><text class="node-count" x="${x - 61}" y="${y + 3}">${compact(count)}</text><text class="node-label" x="${x - 47}" y="${y + 3}">${escapeHtml(label)}</text></g>`;
  }).join("");

  const startX = Math.min(width - 260, hubX + 510);
  const endX = Math.min(width - 170, hubX + 690);
  const startY = 82;
  const endY = height - 72;
  const maxStart = Math.max(...analysis.starts.map(item => item.count), 1);
  const maxEnd = Math.max(...analysis.ends.map(item => item.count), 1);
  const startSvg = analysis.starts.slice(0, 8).map((item, index) => {
    const target = positions.get(item.name);
    if (!target) return "";
    const edgeWidth = .7 + Math.sqrt(item.count / maxStart) * 2.3;
    const path = `M ${startX} ${startY + 13} C ${startX} ${startY + 110}, ${target[0]} ${target[1] - 105}, ${target[0]} ${target[1] - 16}`;
    return `<path class="terminal-edge" d="${path}" fill="none" stroke="#35AFC0" stroke-width="${edgeWidth.toFixed(2)}" opacity=".66" marker-end="url(#arrow)"><title>Start to ${escapeHtml(item.name)} | ${item.count.toLocaleString()} claims</title></path>`;
  }).join("");
  const endSvg = analysis.ends.slice(0, 8).map(item => {
    const source = positions.get(item.name);
    if (!source) return "";
    const edgeWidth = .7 + Math.sqrt(item.count / maxEnd) * 2.3;
    const path = `M ${source[0]} ${source[1] + 16} C ${source[0]} ${source[1] + 105}, ${endX} ${endY - 110}, ${endX} ${endY - 13}`;
    return `<path class="terminal-edge" d="${path}" fill="none" stroke="#35AFC0" stroke-width="${edgeWidth.toFixed(2)}" opacity=".66" marker-end="url(#arrow)"><title>${escapeHtml(item.name)} to End | ${item.count.toLocaleString()} claims</title></path>`;
  }).join("");
  const terminalSvg = `<g class="map-terminal"><circle cx="${startX}" cy="${startY}" r="12"/><text x="${startX}" y="${startY - 20}">Start</text></g><g class="map-terminal end"><circle cx="${endX}" cy="${endY}" r="12"/><path d="M ${endX - 4} ${endY - 4} L ${endX + 4} ${endY + 4} M ${endX + 4} ${endY - 4} L ${endX - 4} ${endY + 4}"/><text x="${endX}" y="${endY - 20}">End</text></g>`;
  const defs = `<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#35AFC0"/></marker><marker id="arrow-loop" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#2F9E44"/></marker></defs>`;
  return {
    svg: `<svg class="milestone-process-map" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Claims milestone process map">${defs}${startSvg}${endSvg}${edgeSvg}${nodeSvg}${terminalSvg}</svg>`,
    width,
    height,
  };
}

function Bottlenecks({ analysis }: { analysis: Analysis }) {
  const [metric, setMetric] = useState<"impact" | "average" | "count">("impact");
  const rows = useMemo(() => [...analysis.bottlenecks].sort((a, b) => {
    if (metric === "average") return b.avgHours - a.avgHours;
    if (metric === "count") return b.caseCount - a.caseCount;
    return b.impactHours - a.impactHours;
  }), [analysis.bottlenecks, metric]);
  const totalImpact = rows.reduce((sum, item) => sum + item.impactHours, 0);
  const maxValue = Math.max(...rows.map(item => metric === "average" ? item.avgHours : metric === "count" ? item.caseCount : item.impactHours), 1);
  return (
    <section className="card compact-analysis">
      <div className="analysis-controlbar">
        <div><span className="control-label">Bottleneck analysis</span><strong>Time from event to next</strong></div>
        <div className="segmented-control">
          <button className={metric === "impact" ? "active" : ""} onClick={() => setMetric("impact")}>Total time</button>
          <button className={metric === "average" ? "active" : ""} onClick={() => setMetric("average")}>Average</button>
          <button className={metric === "count" ? "active" : ""} onClick={() => setMetric("count")}>Claims</button>
        </div>
        <div className="control-stat"><span>Total impact</span><strong>{formatHours(totalImpact)}</strong></div>
      </div>
      <div className="table-scroll">
        <table className="bottleneck-table">
          <thead><tr><th>Event → next event</th><th>Claims</th><th>Per claim</th><th>Average time</th><th>Total time</th><th>Total time %</th></tr></thead>
          <tbody>{rows.map(item => {
            const value = metric === "average" ? item.avgHours : metric === "count" ? item.caseCount : item.impactHours;
            return <tr key={`${item.from}-${item.to}`}>
              <td><strong>{item.from}</strong><span className="route-next">→ {item.to}</span></td>
              <td>{item.caseCount.toLocaleString()}</td>
              <td>{(item.count / Math.max(item.caseCount, 1)).toFixed(2)}</td>
              <td>{formatHours(item.avgHours)}</td>
              <td><div className="metric-bar-cell"><span style={{ width: `${Math.max(3, value / maxValue * 100)}%` }} /><b>{formatHours(item.impactHours)}</b></div></td>
              <td>{(item.impactHours / Math.max(totalImpact, 1) * 100).toFixed(2)}%</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function Paths({ analysis }: { analysis: Analysis }) {
  const [view, setView] = useState<"path" | "schema">("path");
  const [sort, setSort] = useState<"volume" | "duration" | "loops">("duration");
  const [direction, setDirection] = useState<"ascending" | "descending">("descending");
  const [pathLimit, setPathLimit] = useState(50);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string | null>(null);
  const [selectedPathKey, setSelectedPathKey] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const paths = useMemo(() => {
    const source = activityFilter ? analysis.pathAnalysis.filter(path => path.path.includes(activityFilter)) : analysis.pathAnalysis;
    const multiplier = direction === "ascending" ? 1 : -1;
    return [...source]
      .sort((a, b) => multiplier * (sort === "duration" ? a.avgHours - b.avgHours : sort === "loops" ? a.repeatedSteps - b.repeatedSteps : a.count - b.count))
      .slice(0, pathLimit);
  }, [analysis.pathAnalysis, activityFilter, direction, pathLimit, sort]);
  const availablePathCount = activityFilter ? analysis.pathAnalysis.filter(path => path.path.includes(activityFilter)).length : analysis.pathAnalysis.length;
  const selectedPath = selectedPathKey ? paths.find(path => path.path.join("::") === selectedPathKey) || null : null;
  const totalVisibleClaims = paths.reduce((sum, item) => sum + item.count, 0);
  return (
    <section className="card compact-analysis path-analysis">
      <div className="path-commandbar">
        <button className={configurationOpen ? "active" : ""} onClick={() => setConfigurationOpen(current => !current)}>Set configuration</button>
        <div className="segmented-control path-view-switch">
          <button className={view === "path" ? "active" : ""} onClick={() => setView("path")}>Path</button>
          <button className={view === "schema" ? "active" : ""} onClick={() => setView("schema")}>Schema</button>
        </div>
        <span className="path-disclosure">Displaying top <strong>{paths.length}</strong> paths out of <strong>{availablePathCount.toLocaleString()}</strong></span>
        {activityFilter && <button className="path-filter-chip" onClick={() => setActivityFilter(null)} title="Clear queue filter">{activityFilter}<b>×</b></button>}
        <button className="path-details-command" disabled={!selectedPath} onClick={() => setDetailsOpen(current => !current)}>Path details</button>
      </div>
      {configurationOpen && (
        <div className="path-configuration">
          <label><span>Measure</span><select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="duration">Average business duration</option><option value="volume">Claim volume</option><option value="loops">Loop count</option></select></label>
          <label><span>Direction</span><select value={direction} onChange={event => setDirection(event.target.value as typeof direction)}><option value="descending">Descending</option><option value="ascending">Ascending</option></select></label>
          <label><span>Paths shown</span><select value={pathLimit} onChange={event => setPathLimit(Number(event.target.value))}><option value={25}>Top 25</option><option value={50}>Top 50</option><option value={100}>Top 100</option></select></label>
          <div><span>Visible claims</span><strong>{totalVisibleClaims.toLocaleString()}</strong></div>
        </div>
      )}
      {view === "path" ? (
        <PathTimeline
          paths={paths}
          activities={analysis.activities}
          metric={sort}
          activityFilter={activityFilter}
          onActivityFilter={setActivityFilter}
          selectedPathKey={selectedPathKey}
          onSelectPath={key => { setSelectedPathKey(key); setDetailsOpen(true); }}
        />
      ) : <SchemaCanvas paths={paths} />}
      {selectedPath && detailsOpen && (
        <div className="path-detail-panel">
          <div><span>Selected path</span><strong>{selectedPath.count.toLocaleString()} claims</strong></div>
          <div><span>Share</span><strong>{selectedPath.share.toFixed(2)}%</strong></div>
          <div><span>Average duration</span><strong>{formatHours(selectedPath.avgHours)}</strong></div>
          <div><span>Loops</span><strong>{selectedPath.repeatedSteps}</strong></div>
          <p>{selectedPath.path.map((step, index) => <span key={`${step}-${index}`}>{step}</span>)}</p>
          <button onClick={() => setDetailsOpen(false)} aria-label="Close path details" title="Close path details">×</button>
        </div>
      )}
    </section>
  );
}

function PathCanvas({ paths }: { paths: PathItem[] }) {
  return <div className="path-canvas">
    {paths.map((item, index) => <article className="path-column" key={`${item.path.join("-")}-${index}`}>
      <header><span>#{index + 1}</span><strong>{formatHours(item.avgHours)}</strong><small>{item.count.toLocaleString()} claims</small></header>
      <div className="path-track">
        <span className="journey-terminal start">▶</span>
        {item.path.map((step, stepIndex) => {
          const repeated = item.path.indexOf(step) < stepIndex;
          return <div className={`path-node ${repeated ? "repeated" : ""}`} key={`${step}-${stepIndex}`}>
            {repeated && <i className="path-loop">↻</i>}
            <span>{step}</span>
          </div>;
        })}
        <span className="journey-terminal end">×</span>
      </div>
      <footer><b>{item.share.toFixed(1)}%</b><span>{item.repeatedSteps ? `${item.repeatedSteps} loops` : "Direct"}</span></footer>
    </article>)}
  </div>;
}

function PathTimeline({
  paths,
  activities,
  metric,
  activityFilter,
  onActivityFilter,
  selectedPathKey,
  onSelectPath,
}: {
  paths: PathItem[];
  activities: Analysis["activities"];
  metric: "volume" | "duration" | "loops";
  activityFilter: string | null;
  onActivityFilter: (activity: string | null) => void;
  selectedPathKey: string | null;
  onSelectPath: (pathKey: string) => void;
}) {
  const rows = useMemo(() => buildTimelineRows(paths, activities), [paths, activities]);
  const [hiddenRows, setHiddenRows] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<{
    pathIndex: number;
    transferIndex: number;
    from: string;
    to: string;
    left: number;
    top: number;
  } | null>(null);
  const rowHeight = 34;
  const topPad = 8;
  const height = Math.max(220, rows.length * rowHeight + topPad * 2);
  const laneMap = useMemo(() => new Map(rows.map((row, index) => [row.name, index])), [rows]);
  const allRowsVisible = rows.every(row => !hiddenRows.has(row.name));
  const toggleRow = (name: string) => {
    setHiddenRows(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const toggleAllRows = () => setHiddenRows(allRowsVisible ? new Set(rows.map(row => row.name)) : new Set());
  const showTransfer = (pathIndex: number, transferIndex: number, from: string, to: string, clientX: number, clientY: number) => {
    const left = Math.max(12, Math.min(clientX + 14, window.innerWidth - 312));
    const top = Math.max(12, Math.min(clientY + 14, window.innerHeight - 180));
    setHovered({ pathIndex, transferIndex, from, to, left, top });
  };
  if (!paths.length) {
    return <div className="empty-state explorer-empty"><strong>No paths detected</strong><p>Upload event data with case IDs, activities, and timestamps to render claim journeys.</p></div>;
  }
  return (
    <div className="timeline-shell">
      <div className="timeline-left">
        <div className="timeline-left-header">
          <label>
            <input type="checkbox" checked={allRowsVisible} onChange={toggleAllRows} aria-label="Show all events and queues" />
            <strong>Events / Queues</strong>
          </label>
          <span>{rows.length.toLocaleString()} lanes</span>
        </div>
        <div className="timeline-lane-spacer" style={{ height: topPad }} />
        {rows.map(row => (
          <div className={`timeline-lane-label ${row.active ? "active" : ""} ${hiddenRows.has(row.name) ? "disabled" : ""} ${hovered && (hovered.from === row.name || hovered.to === row.name) ? "hovered" : ""}`} key={row.name}>
            <input type="checkbox" checked={!hiddenRows.has(row.name)} onChange={() => toggleRow(row.name)} aria-label={`Show ${row.name}`} />
            <b>{row.count.toLocaleString()}</b>
            <span>{row.name}</span>
            <button className={activityFilter === row.name ? "active" : ""} onClick={() => onActivityFilter(activityFilter === row.name ? null : row.name)} aria-label={`Filter paths by ${row.name}`} title={`Filter paths by ${row.name}`}><i /></button>
          </div>
        ))}
        <div className="timeline-lane-spacer" style={{ height: topPad + 34 }} />
      </div>
      <div className="timeline-main">
        <div className="timeline-paths">
          {paths.map((path, index) => (
            <TimelinePathColumn
              key={`${path.path.join("::")}-${index}`}
              path={path}
              index={index}
              laneMap={laneMap}
              rowHeight={rowHeight}
              topPad={topPad}
              height={height}
              metric={metric}
              hiddenRows={hiddenRows}
              hoveredTransfer={hovered?.pathIndex === index ? hovered.transferIndex : null}
              focused={hovered?.pathIndex === index}
              dimmed={hovered !== null && hovered.pathIndex !== index}
              selected={selectedPathKey === path.path.join("::")}
              onSelect={() => onSelectPath(path.path.join("::"))}
              onTransferHover={(transferIndex, from, to, clientX, clientY) => showTransfer(index, transferIndex, from, to, clientX, clientY)}
              onTransferLeave={() => setHovered(null)}
            />
          ))}
        </div>
      </div>
      {hovered && (
        <div className="timeline-tooltip" style={{ left: hovered.left, top: hovered.top }} role="status">
          <span>Path #{hovered.pathIndex + 1} · Transfer {hovered.transferIndex + 1}</span>
          <strong>{hovered.from} → {hovered.to}</strong>
          <small>{paths[hovered.pathIndex].count.toLocaleString()} claims · {formatHours(paths[hovered.pathIndex].avgHours)}</small>
          <p>{paths[hovered.pathIndex].path.join(" → ")}</p>
        </div>
      )}
    </div>
  );
}

function TimelinePathColumn({
  path,
  index,
  laneMap,
  rowHeight,
  topPad,
  height,
  metric,
  hiddenRows,
  hoveredTransfer,
  focused,
  dimmed,
  selected,
  onSelect,
  onTransferHover,
  onTransferLeave,
}: {
  path: PathItem;
  index: number;
  laneMap: Map<string, number>;
  rowHeight: number;
  topPad: number;
  height: number;
  metric: "volume" | "duration" | "loops";
  hiddenRows: Set<string>;
  hoveredTransfer: number | null;
  focused: boolean;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
  onTransferHover: (transferIndex: number, from: string, to: string, clientX: number, clientY: number) => void;
  onTransferLeave: () => void;
}) {
  const width = 120;
  const x = width / 2;
  const occurrences = path.path
    .map((step, stepIndex) => {
      const rowIndex = laneMap.get(step);
      if (rowIndex === undefined) return null;
      return {
        step,
        stepIndex,
        y: topPad + rowIndex * rowHeight + rowHeight / 2,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const transitionCount = Math.max(occurrences.length - 1, 1);
  const trackSpan = Math.min(72, Math.max(0, (transitionCount - 1) * 8));
  const getTrackX = (transitionIndex: number) => transitionCount === 1
    ? x
    : x - trackSpan / 2 + transitionIndex / (transitionCount - 1) * trackSpan;
  const transfers = occurrences.slice(0, -1).map((event, transferIndex) => {
    const next = occurrences[transferIndex + 1];
    const trackX = getTrackX(transferIndex);
    const selfLoop = event.step === next.step;
    return {
      d: selfLoop ? `M ${trackX - 5} ${event.y} L ${trackX + 5} ${event.y}` : `M ${trackX} ${event.y} L ${trackX} ${next.y}`,
      from: event.step,
      to: next.step,
      fromY: event.y,
      toY: next.y,
      trackX,
      selfLoop,
      visible: !hiddenRows.has(event.step) && !hiddenRows.has(next.step),
    };
  });
  const firstTransfer = transfers[0];
  const lastTransfer = transfers[transfers.length - 1];
  const startX = firstTransfer ? firstTransfer.trackX - (firstTransfer.selfLoop ? 5 : 0) : x;
  const endX = lastTransfer ? lastTransfer.trackX + (lastTransfer.selfLoop ? 5 : 0) : x;
  return (
    <article className={`timeline-path-column ${focused ? "focused" : ""} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`} onPointerLeave={onTransferLeave} onClick={onSelect}>
      <header>
        <strong>{metric === "duration" ? formatHours(path.avgHours) : metric === "loops" ? `${path.repeatedSteps} loops` : `${path.count.toLocaleString()} claims`}</strong>
        <small>{path.share.toFixed(2)}% | Path #{index + 1}</small>
      </header>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Claim journey ${index + 1}`}>
        <defs>
          <marker id={`timeline-arrow-${index}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#D35F21" />
          </marker>
        </defs>
        {Array.from({ length: Math.max(0, Math.floor((height - topPad * 2) / rowHeight)) }).map((_, gridIndex) => (
          <line key={`grid-${gridIndex}`} x1="0" x2={width} y1={topPad + gridIndex * rowHeight + rowHeight / 2} y2={topPad + gridIndex * rowHeight + rowHeight / 2} className="timeline-row-line" />
        ))}
        {transfers.map((transfer, transferIndex) => transfer.visible && (
          <g key={`transfer-${transferIndex}`}>
            {!transfer.selfLoop && <path d={transfer.d} className={`timeline-transfer ${hoveredTransfer === transferIndex ? "hovered" : ""}`} markerEnd={`url(#timeline-arrow-${index})`} />}
            <g className="timeline-event">
              {transfer.selfLoop ? (
                <>
                  <circle cx={transfer.trackX - 5} cy={transfer.fromY} r="3.2" />
                  <circle cx={transfer.trackX + 5} cy={transfer.fromY} r="3.2" />
                </>
              ) : (
                <>
                  <circle cx={transfer.trackX} cy={transfer.fromY} r="3.2" />
                  <circle cx={transfer.trackX} cy={transfer.toY} r="3.2" />
                </>
              )}
            </g>
            <path
              d={transfer.d}
              className="timeline-transfer-hit"
              onPointerEnter={event => onTransferHover(transferIndex, transfer.from, transfer.to, event.clientX, event.clientY)}
              onPointerMove={event => onTransferHover(transferIndex, transfer.from, transfer.to, event.clientX, event.clientY)}
            />
          </g>
        ))}
        {!transfers.length && occurrences[0] && !hiddenRows.has(occurrences[0].step) && <g className="timeline-event"><circle cx={x} cy={occurrences[0].y} r="3.2" /></g>}
        {occurrences[0] && !hiddenRows.has(occurrences[0].step) && <text className="timeline-terminal-label" x={startX} y={occurrences[0].y - 8}>Start</text>}
        {occurrences[occurrences.length - 1] && !hiddenRows.has(occurrences[occurrences.length - 1].step) && <text className="timeline-terminal-label" x={endX} y={occurrences[occurrences.length - 1].y + 13}>End</text>}
      </svg>
      <footer>
        <span>{path.repeatedSteps ? `${path.repeatedSteps} loops` : "No loops"}</span>
        <b>{path.path.length} events</b>
      </footer>
    </article>
  );
}

function buildTimelineRows(paths: PathItem[], activities: Analysis["activities"]) {
  const rowSignals = new Map<string, { firstPosition: number; weightedPosition: number; pathHits: number; occurrences: number }>();
  paths.forEach(path => path.path.forEach((step, index) => {
    const value = rowSignals.get(step) || { firstPosition: index, weightedPosition: 0, pathHits: 0, occurrences: 0 };
    value.firstPosition = Math.min(value.firstPosition, index);
    value.weightedPosition += index * Math.max(path.count, 1);
    value.pathHits += Math.max(path.count, 1);
    value.occurrences += 1;
    rowSignals.set(step, value);
  }));
  return activities
    .map(activity => {
      const signal = rowSignals.get(activity.name);
      return {
        name: activity.name,
        count: activity.count,
        active: Boolean(signal),
        order: signal ? signal.weightedPosition / Math.max(signal.pathHits, 1) : Number.MAX_SAFE_INTEGER,
        firstPosition: signal?.firstPosition ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.firstPosition - b.firstPosition || a.order - b.order || b.count - a.count || a.name.localeCompare(b.name));
}

function SchemaCanvas({ paths }: { paths: PathItem[] }) {
  const nodes = new Map<string, { incoming: number; outgoing: number; paths: number }>();
  paths.forEach(path => path.path.forEach((step, index) => {
    const value = nodes.get(step) || { incoming: 0, outgoing: 0, paths: 0 };
    value.paths += path.count;
    if (index > 0) value.incoming += path.count;
    if (index < path.path.length - 1) value.outgoing += path.count;
    nodes.set(step, value);
  }));
  const rows = [...nodes.entries()].sort((a, b) => b[1].paths - a[1].paths);
  const max = Math.max(...rows.map(([, value]) => value.paths), 1);
  return <div className="schema-canvas">
    {rows.map(([name, value]) => <div className="schema-row" key={name}>
      <span className="schema-in">{value.incoming.toLocaleString()} →</span>
      <strong>{name}</strong>
      <div className="schema-volume"><i style={{ width: `${value.paths / max * 100}%` }} /></div>
      <span className="schema-out">→ {value.outgoing.toLocaleString()}</span>
    </div>)}
  </div>;
}

function getSegmentOptions(analysis: Analysis) {
  const claimNames = analysis.activities
    .filter(item => /claim|saving|queue/i.test(item.name))
    .sort((a, b) => b.count - a.count)
    .map(item => item.name);
  return ["All claims", ...claimNames.slice(0, 30)];
}

function filterAnalysisBySegment(analysis: Analysis, segment: string): MapAnalysis {
  const paths = segment === "All claims" ? analysis.pathAnalysis : analysis.pathAnalysis.filter(item => item.path.includes(segment));
  if (!paths.length) {
    return { caseCount: analysis.caseCount, activities: analysis.activities, transitions: analysis.transitions, starts: [], ends: [] };
  }
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const edgeCounts = new Map<string, number>();
  const nodeCounts = new Map<string, number>();
  paths.forEach(item => {
    const first = item.path[0];
    const last = item.path[item.path.length - 1];
    if (first) starts.set(first, (starts.get(first) || 0) + item.count);
    if (last) ends.set(last, (ends.get(last) || 0) + item.count);
    item.path.forEach(step => nodeCounts.set(step, (nodeCounts.get(step) || 0) + item.count));
    for (let index = 0; index < item.path.length - 1; index += 1) {
      const key = `${item.path[index]}|||${item.path[index + 1]}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + item.count);
    }
  });
  const globalEdges = new Map(analysis.transitions.map(item => [`${item.from}|||${item.to}`, item]));
  const transitions = [...edgeCounts.entries()].map(([key, count]) => {
    const [from, to] = key.split("|||");
    const global = globalEdges.get(key);
    return { from, to, count, caseCount: Math.min(count, global?.caseCount || count), avgHours: global?.avgHours || 0 };
  }).sort((a, b) => b.count - a.count);
  return {
    caseCount: paths.reduce((sum, item) => sum + item.count, 0),
    activities: [...nodeCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    transitions,
    starts: [...starts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    ends: [...ends.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

function Queues({ analysis }: { analysis: Analysis }) {
  const total = Math.max(analysis.eventCount, 1);
  return <section className="card"><PanelHeader kicker="Volume concentration" title="Queue Summary" detail="Queues are ranked by event volume to show where operational demand is concentrated." /><div className="queue-grid">{analysis.activities.map((item, index) => <div className={`queue-pill ${index < 3 ? "priority" : ""}`} key={item.name}><strong>{item.name}</strong><span>{item.count.toLocaleString()} events</span><div className="bar"><i style={{ width: `${Math.max(4, item.count / total * 100)}%` }} /></div></div>)}</div></section>;
}

function Recommendations({ analysis }: { analysis: Analysis }) {
  return <section className="card"><PanelHeader kicker="Client-ready actions" title="Operational Recommendations" detail="Recommendations are prioritized by impact and risk so the next decision is visible immediately." /><div className="recommendation-list">{analysis.recommendations.map(item => <div className="recommendation" key={item.title}><span className={`badge ${item.severity}`}>{item.severity}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></div>)}</div></section>;
}

function Objects({ analysis }: { analysis: Analysis }) {
  const top = analysis.objects[0];
  return <section className="card"><PanelHeader kicker="Object signal" title="Object-Centric Signals" detail={top ? `${top.name} appears most often, with ${top.count.toLocaleString()} linked events.` : "Map object ID fields during upload to unlock object-centric analysis."} /><table><thead><tr><th>Object</th><th>Events</th></tr></thead><tbody>{analysis.objects.map(item => <tr key={item.name}><td>{item.name}</td><td>{item.count}</td></tr>)}</tbody></table></section>;
}

function Actions() {
  return <section className="card"><PanelHeader kicker="Control layer" title="Actions" detail="Action-rule persistence is available through the API. This area is ready for client-specific rule creation, approvals, and exception workflows." /><div className="empty-state"><strong>No action rules configured</strong><p>Create rules from bottlenecks, queue aging, or repeated path signals when workflow ownership is defined.</p></div></section>;
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

function Highlight({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={`highlight tone-${tone}`}>
      <div className="metric-label">{label}</div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function countFor(tab: string, analysis: Analysis) {
  if (tab === "deep-dive") return analysis.claims.exceptionClaims;
  if (tab === "map") return analysis.activityCount;
  if (tab === "bottlenecks") return analysis.bottlenecks.length;
  if (tab === "paths") return analysis.pathAnalysis.length;
  if (tab === "queues") return analysis.activities.length;
  if (tab === "recommendations") return analysis.recommendations.length;
  if (tab === "objects") return analysis.objects.length;
  return 0;
}

function formatHours(hours: number) {
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`;
  return `${hours.toFixed(1)} hrs`;
}

function formatMapDays(hours: number) {
  const days = hours / 24;
  if (days >= 1) return `${days.toFixed(1)} days`;
  return `${hours.toFixed(1)} hours`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
