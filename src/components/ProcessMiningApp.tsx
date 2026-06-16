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
        <div className="brand">Process Intelligence Platform</div>
        <nav>
          <button onClick={() => { setDetail(null); setPreview(null); }}>Datasets</button>
          <button onClick={() => document.getElementById("upload-card")?.scrollIntoView({ behavior: "smooth" })}>Upload Data</button>
        </nav>
      </header>
      <main>
        {error && <div className="card error" style={{ marginBottom: 16 }}>{error}</div>}
        <section className="grid cols">
          <div id="upload-card" className="card">
            <h1>Upload Dynamic Data</h1>
            <p>Upload Excel or CSV, confirm the mapping, and use that file as the basis for process mining analysis.</p>
            <form onSubmit={upload}>
              <label>Dataset Name</label>
              <input name="name" defaultValue="Uploaded Process Data" />
              <label>Excel or CSV File</label>
              <input name="file" type="file" accept=".xlsx,.xlsm,.xls,.csv" required />
              <div style={{ marginTop: 14 }}>
                <button className="button" disabled={busy}>{busy ? "Working..." : "Preview Mapping"}</button>
              </div>
            </form>
          </div>
          <div className="card">
            <h2>Datasets in Postgres</h2>
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
          <section style={{ marginTop: 16 }}>
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
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Confirm Mapping</h2>
      <p>File: <strong>{preview.filename}</strong> | Rows: <strong>{preview.rowCount.toLocaleString()}</strong></p>
      <div className="grid cols">
        <div>
          <Select label="Case ID" value={mapping.case_id || ""} headers={preview.headers} onChange={value => update("case_id", value)} />
          <Select label="Activity / Queue / Step" value={mapping.activity || ""} headers={preview.headers} onChange={value => update("activity", value)} />
          <Select label="Timestamp" value={mapping.timestamp || ""} headers={preview.headers} onChange={value => update("timestamp", value)} />
        </div>
        <div>
          <Select label="Resource / User" value={mapping.resource || ""} headers={preview.headers} onChange={value => update("resource", value)} optional />
          <Select label="Cost / Amount" value={mapping.cost || ""} headers={preview.headers} onChange={value => update("cost", value)} optional />
          <div style={{ marginTop: 16 }}><button className="button" onClick={onConfirm} disabled={busy}>{busy ? "Saving..." : "Run Analysis"}</button></div>
        </div>
      </div>
      <h3 style={{ marginTop: 18 }}>Data Preview</h3>
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
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1>{detail.dataset.name}</h1>
        <p>{detail.dataset.original_filename || "Uploaded dataset"}</p>
      </div>
      <section className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Cases" value={a.caseCount.toLocaleString()} />
        <Kpi label="Events" value={a.eventCount.toLocaleString()} />
        <Kpi label="Activities" value={a.activityCount.toLocaleString()} />
        <Kpi label="Avg Duration" value={formatHours(a.avgDurationHours)} />
        <Kpi label="Rework Rate" value={`${a.reworkRate.toFixed(1)}%`} />
        <Kpi label="Total Cost" value={`$${a.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </section>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div>;
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
  return (
    <section className="card">
      <h2>Process Movement Map</h2>
      <p>Dot speed follows actual average processing time for each transition.</p>
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
    const color = transition.avgHours < 24 ? "#5B5F97" : transition.avgHours < 72 ? "#2F855A" : transition.avgHours < 168 ? "#C47F17" : "#B42318";
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
      <circle cx="${x}" cy="${y}" r="${5 + Math.min(16, count / Math.max(1, analysis.eventCount) * 80)}" fill="#FFFDF7" stroke="#5B5F97" stroke-width="1.4"><title>${escapeHtml(activity)} | ${count} events</title></circle>
      <text x="${x}" y="${y - 14}" text-anchor="middle" font-size="10" font-weight="900" fill="#182230">${count}</text>
      ${labels.has(activity) ? `<rect x="${x - 92}" y="${y + 15}" width="184" height="28" rx="13" fill="#FFFDF7" stroke="#5B5F97" /><text x="${x}" y="${y + 34}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#182230">${escapeHtml(label)}</text>` : ""}`;
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#FCFBF7">${edgeSvg}${nodeSvg}</svg>`;
}

function Bottlenecks({ analysis }: { analysis: Analysis }) {
  return (
    <section className="grid cols">
      <div className="card">
        <h2>Bottleneck Analysis</h2>
        {analysis.bottlenecks.slice(0, 5).map(item => (
          <div key={`${item.from}-${item.to}`} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
            <span className={`badge ${item.severity}`}>{item.severity}</span>
            <h3 style={{ marginTop: 8 }}>{item.from} &rarr; {item.to}</h3>
            <p>Avg {formatHours(item.avgHours)} | P90 {formatHours(item.p90Hours)} | Impact {formatHours(item.impactHours)}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Transition Detail</h2>
        <table><thead><tr><th>Transition</th><th>Count</th><th>Risk</th><th>Avg</th><th>P90</th></tr></thead><tbody>{analysis.bottlenecks.map(item => <tr key={`${item.from}-${item.to}`}><td>{item.from} &rarr; {item.to}</td><td>{item.count}</td><td><span className={`badge ${item.severity}`}>{item.severity}</span></td><td>{formatHours(item.avgHours)}</td><td>{formatHours(item.p90Hours)}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function Paths({ analysis }: { analysis: Analysis }) {
  return <section className="grid"><div className="card"><PathTable title="Path Analysis" paths={analysis.pathAnalysis} /></div><div className="grid cols"><div className="card"><PathTable title="Slowest Paths" paths={analysis.slowestPaths} /></div><div className="card"><PathTable title="Fastest Paths" paths={analysis.fastestPaths} /></div></div><div className="card"><PathTable title="Rework / Looping Paths" paths={analysis.reworkPaths} /></div></section>;
}

function PathTable({ title, paths }: { title: string; paths: PathItem[] }) {
  return <><h2>{title}</h2><table><thead><tr><th>Path</th><th>Cases</th><th>Share</th><th>Avg</th><th>P90</th><th>Status</th></tr></thead><tbody>{paths.map((path, index) => <tr key={index}><td><div className="path">{path.path.slice(0, 8).map(step => <span className="step" key={step}>{step}</span>)}</div></td><td>{path.count}</td><td>{path.share.toFixed(1)}%</td><td>{formatHours(path.avgHours)}</td><td>{formatHours(path.p90Hours)}</td><td><span className={`badge ${path.status === "Needs attention" ? "Needs" : path.status}`}>{path.status}</span></td></tr>)}</tbody></table></>;
}

function Queues({ analysis }: { analysis: Analysis }) {
  return <section className="card"><h2>Queue Summary</h2><div className="queue-grid">{analysis.activities.map(item => <div className="queue-pill" key={item.name}><strong>{item.name}</strong><span>{item.count.toLocaleString()}</span></div>)}</div></section>;
}

function Recommendations({ analysis }: { analysis: Analysis }) {
  return <section className="card"><h2>Operational Recommendations</h2><div className="grid">{analysis.recommendations.map(item => <div className="card" key={item.title}><span className={`badge ${item.severity}`}>{item.severity}</span><h3 style={{ marginTop: 8 }}>{item.title}</h3><p>{item.detail}</p></div>)}</div></section>;
}

function Objects({ analysis }: { analysis: Analysis }) {
  return <section className="card"><h2>Object-Centric Signals</h2><table><thead><tr><th>Object</th><th>Events</th></tr></thead><tbody>{analysis.objects.map(item => <tr key={item.name}><td>{item.name}</td><td>{item.count}</td></tr>)}</tbody></table></section>;
}

function Actions() {
  return <section className="card"><h2>Actions</h2><p>Action-rule persistence is available through the API. The next UI pass can add rule creation here.</p></section>;
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
