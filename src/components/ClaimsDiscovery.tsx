"use client";

import { useMemo, useState } from "react";

import type { CorrelationAnalysis } from "@/lib/process-mining";

type DiscoveryAnalysis = {
  caseCount: number;
  eventCount: number;
  correlations: CorrelationAnalysis;
};

type Relationship = CorrelationAnalysis["relationships"][number];

export default function ClaimsDiscovery({ analysis }: { analysis: DiscoveryAnalysis }) {
  const correlation = analysis.correlations;
  const [minimumStrength, setMinimumStrength] = useState(0.2);
  const [selectedVariable, setSelectedVariable] = useState("all");
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null);

  const visible = useMemo(() => correlation.relationships.filter(relationship =>
    relationship.strength >= minimumStrength &&
    (selectedVariable === "all" || relationship.source === selectedVariable || relationship.target === selectedVariable),
  ), [correlation.relationships, minimumStrength, selectedVariable]);
  const uploadedVariables = correlation.variables.filter(variable => variable.source === "uploaded");
  const strongest = correlation.relationships[0];

  if (!correlation.variables.length || !correlation.relationships.length) {
    return <section className="correlation-discovery">
      <header className="correlation-hero"><div><div className="section-kicker">Uploaded-data intelligence</div><h2>Correlation Analysis</h2><p>Discover which uploaded attributes move together and which ones are associated with process performance.</p></div></header>
      <div className="correlation-empty"><strong>Not enough variable data for correlation analysis</strong><p>Upload a file with at least two varying numeric or categorical columns. Newly uploaded files retain non-mapped Excel columns automatically.</p></div>
    </section>;
  }

  return <section className="correlation-discovery">
    <header className="correlation-hero">
      <div><div className="section-kicker">Uploaded-data intelligence</div><h2>Correlation Analysis</h2><p>Explore statistical relationships between uploaded Excel columns and observed process outcomes.</p></div>
      <span>{correlation.relationships.length.toLocaleString()} tested relationships</span>
    </header>

    <div className="correlation-kpis">
      <CorrelationKpi label="Observations" value={correlation.observationCount.toLocaleString()} detail={`${analysis.caseCount.toLocaleString()} cases`} />
      <CorrelationKpi label="Analyzed variables" value={correlation.variables.length.toLocaleString()} detail={`${uploadedVariables.length} uploaded columns`} />
      <CorrelationKpi label="Visible relationships" value={visible.length.toLocaleString()} detail={`strength ≥ ${minimumStrength.toFixed(2)}`} />
      <CorrelationKpi label="Strongest relationship" value={strongest ? strongest.strength.toFixed(2) : "—"} detail={strongest ? `${strongest.source} ↔ ${strongest.target}` : "No relationship"} />
    </div>

    <div className="correlation-toolbar">
      <label>Focus variable<select value={selectedVariable} onChange={event => setSelectedVariable(event.target.value)}><option value="all">All variables</option>{correlation.variables.map(variable => <option key={variable.name} value={variable.name}>{variable.name}</option>)}</select></label>
      <label>Minimum strength<input type="range" min="0.05" max="0.9" step="0.05" value={minimumStrength} onChange={event => setMinimumStrength(Number(event.target.value))} /><b>{minimumStrength.toFixed(2)}</b></label>
      <div className="correlation-legend"><span className="positive">Positive</span><span className="negative">Negative</span><span className="association">Association</span></div>
    </div>

    <div className="correlation-main-grid">
      <section className="correlation-panel correlation-graph-panel">
        <header><div><strong>Relationship graph</strong><span>Edge thickness represents statistical strength; select an edge for evidence.</span></div></header>
        <CorrelationGraph relationships={visible} variables={correlation.variables} selected={selectedRelationship} onSelect={setSelectedRelationship} />
      </section>
      <section className="correlation-panel correlation-detail-panel">
        <header><div><strong>Relationship evidence</strong><span>{selectedRelationship ? "Selected graph connection" : "Strongest visible connection"}</span></div></header>
        <RelationshipDetail relationship={selectedRelationship || visible[0] || null} />
        <div className="correlation-insights">
          <strong>Top signals</strong>
          {(visible.length ? visible : correlation.relationships).slice(0, 5).map(item => <button key={`${item.source}-${item.target}`} onClick={() => setSelectedRelationship(item)}><span>{item.source}<i>↔</i>{item.target}</span><b>{item.strength.toFixed(2)}</b><small>{item.method}</small></button>)}
        </div>
      </section>
    </div>

    <section className="correlation-panel">
      <header><div><strong>Correlation matrix</strong><span>Top variables in the current filtered relationship set.</span></div></header>
      <CorrelationMatrix relationships={visible.length ? visible : correlation.relationships} />
    </section>

    <section className="correlation-panel correlation-table-panel">
      <header><div><strong>Ranked relationship evidence</strong><span>Associations describe co-movement, not proof of causation.</span></div></header>
      <div className="correlation-table-wrap"><table><thead><tr><th>Variable A</th><th>Variable B</th><th>Method</th><th>Direction</th><th>Strength</th><th>Samples</th></tr></thead><tbody>{visible.slice(0, 100).map(item => <tr key={`${item.source}-${item.target}`} onClick={() => setSelectedRelationship(item)}><td><strong>{item.source}</strong></td><td><strong>{item.target}</strong></td><td>{item.method}</td><td><span className={`correlation-direction ${item.direction}`}>{item.direction}</span></td><td><div className="correlation-strength"><i style={{ width: `${item.strength * 100}%` }} /><b>{item.coefficient.toFixed(3)}</b></div></td><td>{item.sampleSize.toLocaleString()}</td></tr>)}</tbody></table></div>
    </section>
  </section>;
}

function CorrelationGraph({ relationships, variables, selected, onSelect }: { relationships: Relationship[]; variables: CorrelationAnalysis["variables"]; selected: Relationship | null; onSelect: (relationship: Relationship) => void }) {
  const edges = relationships.slice(0, 40);
  const names = [...new Set(edges.flatMap(edge => [edge.source, edge.target]))].slice(0, 18);
  const variableMap = new Map(variables.map(variable => [variable.name, variable]));
  const width = 900; const height = 500; const centerX = width / 2; const centerY = height / 2; const radiusX = 330; const radiusY = 190;
  const points = new Map(names.map((name, index) => {
    const angle = -Math.PI / 2 + index / Math.max(names.length, 1) * Math.PI * 2;
    return [name, { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY }];
  }));
  const degrees = new Map<string, number>();
  edges.forEach(edge => { degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1); degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1); });

  if (!edges.length) return <div className="correlation-graph-empty">No relationships meet the current filter.</div>;
  return <div className="correlation-graph"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Correlation relationship graph">
    {edges.filter(edge => points.has(edge.source) && points.has(edge.target)).map(edge => {
      const from = points.get(edge.source)!; const to = points.get(edge.target)!;
      const active = selected?.source === edge.source && selected?.target === edge.target;
      return <line key={`${edge.source}-${edge.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`${edge.direction} ${active ? "selected" : ""}`} strokeWidth={1 + edge.strength * 7} onClick={() => onSelect(edge)}><title>{edge.source} ↔ {edge.target}: {edge.coefficient.toFixed(3)} ({edge.method})</title></line>;
    })}
    {names.map(name => { const point = points.get(name)!; const variable = variableMap.get(name); const nodeRadius = Math.min(28, 15 + (degrees.get(name) || 0) * 1.5); return <g key={name} className={`correlation-node ${variable?.type || "numeric"}`} transform={`translate(${point.x} ${point.y})`}><circle r={nodeRadius} /><text y={nodeRadius + 15}>{shortLabel(name)}</text><title>{name} · {variable?.type || "variable"}</title></g>; })}
  </svg></div>;
}

function RelationshipDetail({ relationship }: { relationship: Relationship | null }) {
  if (!relationship) return <div className="correlation-detail-empty">Adjust the filter or select a graph connection.</div>;
  const strengthLabel = relationship.strength >= 0.7 ? "Strong" : relationship.strength >= 0.4 ? "Moderate" : "Weak";
  return <div className="correlation-detail"><span className={`correlation-direction ${relationship.direction}`}>{relationship.direction}</span><h3>{relationship.source}<i>↔</i>{relationship.target}</h3><div className="correlation-score"><strong>{relationship.coefficient.toFixed(3)}</strong><span>{strengthLabel} · {relationship.method}</span></div><p>{describeRelationship(relationship)}</p><dl><div><dt>Samples</dt><dd>{relationship.sampleSize.toLocaleString()}</dd></div><div><dt>Magnitude</dt><dd>{relationship.strength.toFixed(3)}</dd></div></dl></div>;
}

function CorrelationMatrix({ relationships }: { relationships: Relationship[] }) {
  const names = [...new Set(relationships.slice(0, 24).flatMap(item => [item.source, item.target]))].slice(0, 8);
  const lookup = new Map<string, Relationship>();
  relationships.forEach(item => { lookup.set(`${item.source}\0${item.target}`, item); lookup.set(`${item.target}\0${item.source}`, item); });
  return <div className="correlation-matrix"><table><thead><tr><th></th>{names.map(name => <th key={name} title={name}>{shortLabel(name)}</th>)}</tr></thead><tbody>{names.map(row => <tr key={row}><th title={row}>{shortLabel(row)}</th>{names.map(column => { const item = lookup.get(`${row}\0${column}`); const value = row === column ? 1 : item?.coefficient || 0; const magnitude = Math.abs(value); return <td key={column} title={`${row} ↔ ${column}: ${value.toFixed(3)}`} style={{ background: matrixColor(value, magnitude) }}>{row === column ? "1.00" : item ? value.toFixed(2) : "—"}</td>; })}</tr>)}</tbody></table></div>;
}

function CorrelationKpi({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function shortLabel(value: string) { return value.length > 18 ? `${value.slice(0, 16)}…` : value; }
function matrixColor(value: number, magnitude: number) { if (!magnitude) return "#f8fafc"; const alpha = Math.min(0.78, 0.12 + magnitude * 0.66); return value < 0 ? `rgba(239,68,68,${alpha})` : `rgba(14,165,233,${alpha})`; }
function describeRelationship(item: Relationship) {
  if (item.method === "Pearson r") return `${item.source} and ${item.target} show a ${item.direction} linear relationship across ${item.sampleSize.toLocaleString()} matched observations. Investigate the operational mechanism before treating it as causal.`;
  return `${item.source} and ${item.target} show a ${item.strength >= 0.7 ? "strong" : item.strength >= 0.4 ? "moderate" : "weak"} statistical association across ${item.sampleSize.toLocaleString()} matched observations. Compare category-level outcomes to identify the groups driving the signal.`;
}
