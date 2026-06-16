"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  transitions: { from: string; to: string; count: number; avgHours: number }[];
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
  if (tab === "map") return <MapPanel analysis={analysis} />;
  if (tab === "bottlenecks") return <Bottlenecks analysis={analysis} />;
  if (tab === "paths") return <Paths analysis={analysis} />;
  if (tab === "queues") return <Queues analysis={analysis} />;
  if (tab === "recommendations") return <Recommendations analysis={analysis} />;
  if (tab === "objects") return <Objects analysis={analysis} />;
  return <Actions />;
}

function MapPanel({ analysis }: { analysis: Analysis }) {
  const svg = useMemo(() => buildMapSvg(analysis), [analysis]);
  const busiest = analysis.activities[0];
  const slowest = [...analysis.transitions].sort((a, b) => b.avgHours - a.avgHours)[0];
  return (
    <section className="card">
      <PanelHeader
        kicker="Flow analysis"
        title="Process Movement Map"
        detail="Movement, queue volume, and wait-time severity are shown together so the highest-impact flow stands out first."
      />
      <div className="highlight-grid">
        <Highlight label="Highest volume queue" value={busiest?.name || "No activity"} detail={busiest ? `${busiest.count.toLocaleString()} events` : "Upload data to analyze"} tone="blue" />
        <Highlight label="Slowest handoff" value={slowest ? `${slowest.from} to ${slowest.to}` : "No transition"} detail={slowest ? formatHours(slowest.avgHours) : "No timing signal"} tone="amber" />
        <Highlight label="Process complexity" value={`${analysis.variantCount.toLocaleString()} variants`} detail={`${analysis.activityCount.toLocaleString()} unique activities`} tone="purple" />
      </div>
      <div className="map-wrap">
        <div className="map-toolbar"><strong>Flow view</strong><span>Queue movement</span><span>{analysis.activityCount} queues</span><span style={{ marginLeft: "auto" }}>{analysis.caseCount.toLocaleString()} cases</span></div>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </section>
  );
}

function buildMapSvg(analysis: Analysis) {
  const transitions = analysis.transitions.slice(0, 80);
  const activities = [...new Set(transitions.flatMap(item => [item.from, item.to]))];
  const volume = new Map(analysis.activities.map(item => [item.name, item.count]));
  const positions = new Map<string, [number, number]>();
  const width = Math.max(1900, activities.length * 95);
  const height = 900;
  activities.forEach((activity, index) => {
    const x = 120 + (index % 9) * 200 + Math.floor(index / 9) * 70;
    const y = 110 + Math.floor(index / 9) * 170 + (index % 2) * 60;
    positions.set(activity, [x, Math.min(height - 100, y)]);
  });
  const maxCount = Math.max(...transitions.map(item => item.count), 1);
  const maxWait = Math.max(...transitions.map(item => item.avgHours), 1);
  const labels = new Set(analysis.activities.slice(0, 16).map(item => item.name));
  const edgeSvg = transitions.map((transition, index) => {
    const [x1, y1] = positions.get(transition.from) || [0, 0];
    const [x2, y2] = positions.get(transition.to) || [0, 0];
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 - 110 + (index % 3) * 70;
    const color = transition.avgHours < 24 ? "#2563EB" : transition.avgHours < 72 ? "#0F766E" : transition.avgHours < 168 ? "#D97706" : "#B42318";
    const pathId = `edge-${index}`;
    const duration = 2.4 + (transition.avgHours / maxWait) * 13;
    return `
      <path id="${pathId}" d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${1 + transition.count / maxCount * 5}" opacity=".52" />
      <circle r="${3 + transition.count / maxCount * 3}" fill="${color}" opacity=".92">
        <animateMotion dur="${duration.toFixed(2)}s" repeatCount="indefinite"><mpath href="#${pathId}" /></animateMotion>
      </circle>`;
  }).join("");
  const nodeSvg = activities.map(activity => {
    const [x, y] = positions.get(activity) || [0, 0];
    const count = volume.get(activity) || 0;
    const label = activity.length > 22 ? `${activity.slice(0, 19)}...` : activity;
    return `
      <circle cx="${x}" cy="${y}" r="${5 + Math.min(16, count / Math.max(1, analysis.eventCount) * 80)}" fill="#FFFFFF" stroke="#2563EB" stroke-width="1.4"><title>${escapeHtml(activity)} | ${count} events</title></circle>
      <text x="${x}" y="${y - 14}" text-anchor="middle" font-size="10" font-weight="900" fill="#182230">${count}</text>
      ${labels.has(activity) ? `<rect x="${x - 92}" y="${y + 15}" width="184" height="28" rx="7" fill="#FFFFFF" stroke="#BFDBFE" /><text x="${x}" y="${y + 34}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#182230">${escapeHtml(label)}</text>` : ""}`;
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#F8FAFC">${edgeSvg}${nodeSvg}</svg>`;
}

function Bottlenecks({ analysis }: { analysis: Analysis }) {
  const top = analysis.bottlenecks[0];
  return (
    <section className="grid cols">
      <div className="card">
        <PanelHeader
          kicker="Time impact"
          title="Bottleneck Analysis"
          detail={top ? `Primary delay: ${top.from} to ${top.to}, averaging ${formatHours(top.avgHours)} per handoff.` : "No bottleneck signal was detected."}
        />
        {analysis.bottlenecks.slice(0, 5).map(item => (
          <div key={`${item.from}-${item.to}`} className="finding">
            <div className="finding-head">
              <span className={`badge ${item.severity}`}>{item.severity}</span>
              <strong>{formatHours(item.impactHours)} impact</strong>
            </div>
            <h3>{item.from} to {item.to}</h3>
            <p>Average {formatHours(item.avgHours)}. P90 {formatHours(item.p90Hours)}. Max observed {formatHours(item.maxHours)}.</p>
          </div>
        ))}
      </div>
      <div className="card">
        <PanelHeader kicker="Evidence table" title="Transition Detail" detail="Sorted by total time impact across all handoffs." />
        <table><thead><tr><th>Transition</th><th>Count</th><th>Risk</th><th>Avg</th><th>P90</th></tr></thead><tbody>{analysis.bottlenecks.map(item => <tr key={`${item.from}-${item.to}`}><td>{item.from} &rarr; {item.to}</td><td>{item.count}</td><td><span className={`badge ${item.severity}`}>{item.severity}</span></td><td>{formatHours(item.avgHours)}</td><td>{formatHours(item.p90Hours)}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function Paths({ analysis }: { analysis: Analysis }) {
  const dominant = analysis.pathAnalysis[0];
  return (
    <section className="grid">
      <div className="card">
        <PanelHeader
          kicker="Variant analysis"
          title="Path Analysis"
          detail={dominant ? `Most common path represents ${dominant.share.toFixed(1)}% of cases and averages ${formatHours(dominant.avgHours)}.` : "No path variants were found."}
        />
        <PathTable paths={analysis.pathAnalysis} />
      </div>
      <div className="grid cols">
        <div className="card"><PanelHeader kicker="Cycle time risk" title="Slowest Paths" detail="Paths with the longest average duration." /><PathTable paths={analysis.slowestPaths} compact /></div>
        <div className="card"><PanelHeader kicker="Reference pattern" title="Fastest Paths" detail="Paths that can be used as a baseline for better flow." /><PathTable paths={analysis.fastestPaths} compact /></div>
      </div>
      <div className="card"><PanelHeader kicker="Rework signal" title="Rework and Looping Paths" detail="Repeated activities indicate avoidable handoffs or correction loops." /><PathTable paths={analysis.reworkPaths} /></div>
    </section>
  );
}

function PathTable({ paths, compact }: { paths: PathItem[]; compact?: boolean }) {
  return <table><thead><tr><th>Path</th><th>Cases</th><th>Share</th><th>Avg</th><th>P90</th><th>Loops</th><th>Status</th></tr></thead><tbody>{paths.map((path, index) => <tr key={index}><td><div className="path">{path.path.slice(0, compact ? 5 : 8).map((step, stepIndex) => <span className="step" key={`${step}-${stepIndex}`}>{step}</span>)}</div></td><td>{path.count}</td><td>{path.share.toFixed(1)}%</td><td>{formatHours(path.avgHours)}</td><td>{formatHours(path.p90Hours)}</td><td>{path.repeatedSteps}</td><td><span className={`badge ${path.status === "Needs attention" ? "Needs" : path.status}`}>{path.status}</span></td></tr>)}</tbody></table>;
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
