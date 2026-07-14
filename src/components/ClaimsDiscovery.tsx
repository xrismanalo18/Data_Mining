"use client";

import { useMemo, useState } from "react";

import type { ClaimsAnalysis } from "@/components/DeepDiveSolution";

type CaseInsight = ClaimsAnalysis["caseInsights"][number];

type DiscoveryAnalysis = {
  caseCount: number;
  claims: ClaimsAnalysis;
};

type Variant = {
  key: string;
  rank: number;
  path: string[];
  claims: CaseInsight[];
  count: number;
  share: number;
  avgHours: number;
  p90Hours: number;
  exceptionRate: number;
  stpRate: number;
  loopRate: number;
  totalCost: number;
  savings: number;
};

export default function ClaimsDiscovery({ analysis }: { analysis: DiscoveryAnalysis }) {
  const variants = useMemo(() => buildVariants(analysis.claims.caseInsights), [analysis.claims.caseInsights]);
  const [selectedRank, setSelectedRank] = useState(1);
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState("all");
  const [zoom, setZoom] = useState(.76);
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const selected = variants[Math.min(selectedRank - 1, Math.max(variants.length - 1, 0))];
  const selectedClaim = selected?.claims.find(item => item.caseId === selectedClaimId) || null;
  const visibleClaims = selected?.claims.filter(item => {
    const matchesSearch = !search || item.caseId.toLowerCase().includes(search.toLowerCase()) || item.path.some(step => step.toLowerCase().includes(search.toLowerCase()));
    const matchesHealth = health === "all" || (health === "stp" && item.stp) || (health === "exception" && item.exception) || (health === "loop" && item.repeatedSteps > 0);
    return matchesSearch && matchesHealth;
  }) || [];

  if (!selected) return <section className="card claims-discovery"><div className="empty-state"><strong>No claim variants detected</strong><p>Upload an event log containing case ID, activity, and timestamp to discover claim behavior.</p></div></section>;

  const selectVariant = (rank: number) => {
    setSelectedRank(rank);
    setSelectedClaimId("");
  };
  const maxCount = Math.max(...variants.slice(0, 15).map(item => item.count), 1);
  const healthTone = selected.exceptionRate >= 35 ? "critical" : selected.loopRate >= 20 ? "watch" : "healthy";
  const primaryIssue = selected.exceptionRate >= selected.loopRate
    ? `${selected.exceptionRate.toFixed(1)}% of claims in this variant are exceptions.`
    : `${selected.loopRate.toFixed(1)}% of claims repeat at least one activity.`;

  return <section className="claims-discovery">
    <header className="claims-discovery-hero">
      <div><div className="section-kicker">Uploaded-data intelligence</div><h2>Claims Discovery</h2><p>Variants, claim evidence, loops, and improvement opportunities stay synchronized as you explore.</p></div>
      <span className={`claims-health ${healthTone}`}>{healthTone === "healthy" ? "Healthy flow" : healthTone === "watch" ? "Rework watch" : "High exception risk"}</span>
    </header>

    <div className="claims-kpi-row">
      <DiscoveryKpi label="Total claims" value={analysis.caseCount.toLocaleString()} detail={`${variants.length.toLocaleString()} discovered variants`} />
      <DiscoveryKpi label="Variant claims" value={selected.count.toLocaleString()} detail={`${selected.share.toFixed(1)}% coverage`} />
      <DiscoveryKpi label="Average cycle" value={formatHours(selected.avgHours)} detail={`P90 ${formatHours(selected.p90Hours)}`} />
      <DiscoveryKpi label="STP rate" value={`${selected.stpRate.toFixed(1)}%`} detail={`${selected.claims.filter(item => item.stp).length} straight-through`} />
      <DiscoveryKpi label="Exception rate" value={`${selected.exceptionRate.toFixed(1)}%`} detail={`${selected.claims.filter(item => item.exception).length} affected claims`} danger={selected.exceptionRate >= 25} />
      <DiscoveryKpi label="Loop rate" value={`${selected.loopRate.toFixed(1)}%`} detail={`${selected.claims.filter(item => item.repeatedSteps > 0).length} reworked claims`} danger={selected.loopRate >= 20} />
      {analysis.claims.hasCostData && <DiscoveryKpi label="Savings opportunity" value={money(selected.savings)} detail={`${money(selected.totalCost)} cost exposure`} />}
    </div>

    <div className="claims-variant-toolbar">
      <div><strong>Variant {selected.rank}</strong><span>{shortPath(selected.path)}</span></div>
      <label>Variant rank <input type="range" min="1" max={Math.min(variants.length, 15)} value={selected.rank} onChange={event => selectVariant(Number(event.target.value))} /><b>{selected.rank} / {Math.min(variants.length, 15)}</b></label>
    </div>

    <div className="claims-discovery-grid">
      <section className="claims-panel claims-map-panel">
        <header><div><strong>Claims process explorer</strong><span>Actual activity sequence for Variant {selected.rank}</span></div><div className="claims-zoom"><button onClick={() => setZoom(value => Math.max(.3, value - .1))}>−</button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom(value => Math.min(1.7, value + .1))}>+</button><button onClick={() => setZoom(.76)}>Fit</button></div></header>
        <VariantMap variant={selected} zoom={zoom} />
      </section>

      <section className="claims-panel claims-variant-panel">
        <header><div><strong>Most common variants</strong><span>Click a bar to redraw the explorer</span></div></header>
        <div className="claims-variant-bars">
          {variants.slice(0, 15).map(item => <button key={item.key} className={item.rank === selected.rank ? "active" : ""} onClick={() => selectVariant(item.rank)}>
            <span>V{item.rank}</span><i><em style={{ width: `${Math.max(3, item.count / maxCount * 100)}%` }} /></i><b>{item.count.toLocaleString()}</b><small>{item.share.toFixed(1)}%</small>
          </button>)}
        </div>
      </section>
    </div>

    <div className="claims-insight-grid">
      <section className="claims-panel claims-opportunity">
        <header><div><strong>Variant diagnosis</strong><span>Evidence-backed interpretation</span></div></header>
        <div className={`claims-diagnosis ${healthTone}`}><b>{primaryIssue}</b><p>{diagnose(selected)}</p></div>
        <dl>
          <div><dt>Manual-touch claims</dt><dd>{selected.claims.filter(item => item.manualTouches > 0).length.toLocaleString()}</dd></div>
          <div><dt>Reassigned claims</dt><dd>{selected.claims.filter(item => item.reassignments > 0).length.toLocaleString()}</dd></div>
          <div><dt>Loop waste</dt><dd>{formatHours(selected.claims.reduce((sum, item) => sum + item.loopWasteHours, 0))}</dd></div>
          <div><dt>Average LPI</dt><dd>{average(selected.claims.map(item => item.lpi)).toFixed(1)}</dd></div>
        </dl>
      </section>
      <section className="claims-panel claims-compare">
        <header><div><strong>Actual versus straight path</strong><span>What the selected claims did and the clean route</span></div></header>
        <PathComparison label="Actual" path={selected.path} tone="actual" />
        <PathComparison label="Straight" path={selected.claims[0]?.straightPath || selected.path} tone="straight" />
      </section>
    </div>

    <section className="claims-panel claims-evidence">
      <header><div><strong>Underlying claim evidence</strong><span>{visibleClaims.length.toLocaleString()} claims match the current filters</span></div><div className="claims-evidence-filters"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Claim or activity" /><select value={health} onChange={event => setHealth(event.target.value)}><option value="all">All claims</option><option value="stp">STP</option><option value="exception">Exceptions</option><option value="loop">Loops</option></select></div></header>
      <div className="claims-table-wrap"><table><thead><tr><th>Claim</th><th>Status</th><th>Cycle</th><th>Events</th><th>Loops</th><th>Manual</th><th>Reassigned</th><th>Opportunity</th></tr></thead><tbody>
        {visibleClaims.slice(0, 100).map(item => <tr key={item.caseId} onClick={() => setSelectedClaimId(item.caseId)} className={selectedClaimId === item.caseId ? "selected" : ""}><td><strong>{item.caseId}</strong></td><td><span className={`claim-state ${item.stp ? "stp" : item.exception ? "exception" : "manual"}`}>{item.stp ? "STP" : item.exception ? "Exception" : item.status}</span></td><td>{formatHours(item.durationHours)}</td><td>{item.eventCount}</td><td>{item.repeatedSteps}</td><td>{item.manualTouches}</td><td>{item.reassignments}</td><td>{analysis.claims.hasCostData ? money(item.estimatedSavings) : `${item.lpi.toFixed(1)} LPI`}</td></tr>)}
      </tbody></table></div>
    </section>

    {selectedClaim && <ClaimDrawer claim={selectedClaim} onClose={() => setSelectedClaimId("")} hasCost={analysis.claims.hasCostData} />}
  </section>;
}

function VariantMap({ variant, zoom }: { variant: Variant; zoom: number }) {
  const names = [...new Set(variant.path)];
  const index = new Map(names.map((name, position) => [name, position]));
  const transitions = new Map<string, { from: string; to: string; count: number }>();
  for (const claim of variant.claims) for (let step = 0; step < claim.path.length - 1; step += 1) {
    const from = claim.path[step]; const to = claim.path[step + 1]; const key = `${from}\u0000${to}`;
    transitions.set(key, { from, to, count: (transitions.get(key)?.count || 0) + 1 });
  }
  const width = Math.max(1000, names.length * 245 + 180); const height = 520; const y = 260;
  const xOf = (name: string) => 100 + (index.get(name) || 0) * 245;
  return <div className="claims-map-scroll"><div style={{ width: width * zoom, height: height * zoom }}><svg viewBox={`0 0 ${width} ${height}`} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
    <defs><marker id="claims-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker><marker id="claims-loop-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs>
    {[...transitions.values()].map((edge, order) => {
      const fromX = xOf(edge.from); const toX = xOf(edge.to); const backward = toX <= fromX;
      const path = edge.from === edge.to
        ? `M ${fromX + 72} ${y - 8} C ${fromX + 170} ${y - 105}, ${fromX + 170} ${y + 105}, ${fromX + 72} ${y + 8}`
        : backward
          ? `M ${fromX - 72} ${y} C ${fromX - 90} ${80 + order * 18}, ${toX + 90} ${80 + order * 18}, ${toX + 72} ${y}`
          : `M ${fromX + 72} ${y} C ${fromX + 115} ${y - 60 - order % 3 * 24}, ${toX - 115} ${y - 60 - order % 3 * 24}, ${toX - 72} ${y}`;
      return <g key={`${edge.from}-${edge.to}`} className={backward ? "claim-map-edge loop" : "claim-map-edge"}><path id={`claim-edge-${order}`} d={path} style={{ strokeWidth: 1.2 + edge.count / Math.max(variant.count, 1) * 4 }} markerEnd={`url(#${backward ? "claims-loop-arrow" : "claims-arrow"})`} /><text><textPath href={`#claim-edge-${order}`} startOffset="50%">{edge.count.toLocaleString()}</textPath></text></g>;
    })}
    {names.map(name => <g className="claim-map-node" key={name} transform={`translate(${xOf(name)} ${y})`}><rect x="-76" y="-22" width="152" height="44" rx="12" /><circle cx="-56" cy="0" r="13" /><text className="volume" x="-56" y="4">{variant.count}</text><text x="-35" y="4">{name.length > 18 ? `${name.slice(0, 17)}…` : name}</text><title>{name} · {variant.count} claims</title></g>)}
  </svg></div></div>;
}

function ClaimDrawer({ claim, onClose, hasCost }: { claim: CaseInsight; onClose: () => void; hasCost: boolean }) {
  return <div className="claim-drawer-backdrop" onClick={onClose}><aside className="claim-drawer" onClick={event => event.stopPropagation()}><header><div><span>Claim evidence</span><h3>{claim.caseId}</h3></div><button onClick={onClose}>×</button></header><div className="claim-drawer-kpis"><b>{formatHours(claim.durationHours)}<small>Cycle</small></b><b>{claim.eventCount}<small>Events</small></b><b>{claim.repeatedSteps}<small>Loops</small></b><b>{hasCost ? money(claim.estimatedSavings) : claim.lpi.toFixed(1)}<small>{hasCost ? "Opportunity" : "LPI"}</small></b></div><ol>{claim.steps.map((step, index) => <li className={step.isLoop ? "loop" : ""} key={`${step.activity}-${index}`}><i>{index + 1}</i><div><strong>{step.activity}</strong><span>{new Date(step.timestamp).toLocaleString()} · wait {formatHours(step.waitHours)}</span>{step.owner && <small>Owner: {step.owner}</small>}</div></li>)}</ol></aside></div>;
}

function PathComparison({ label, path, tone }: { label: string; path: string[]; tone: string }) { return <div className={`claims-path-row ${tone}`}><b>{label}</b><div>{path.map((step, index) => <span key={`${step}-${index}`}>{step}{index < path.length - 1 && <i>→</i>}</span>)}</div></div>; }
function DiscoveryKpi({ label, value, detail, danger }: { label: string; value: string; detail: string; danger?: boolean }) { return <div className={danger ? "danger" : ""}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

function buildVariants(claims: CaseInsight[]): Variant[] {
  const groups = new Map<string, CaseInsight[]>();
  for (const claim of claims) { const key = JSON.stringify(claim.path); groups.set(key, [...(groups.get(key) || []), claim]); }
  return [...groups.entries()].map(([key, items]) => {
    const durations = items.map(item => item.durationHours).sort((a, b) => a - b);
    return { key, rank: 0, path: items[0]?.path || [], claims: items, count: items.length, share: items.length / Math.max(claims.length, 1) * 100, avgHours: average(durations), p90Hours: percentile(durations, .9), exceptionRate: rate(items, item => item.exception), stpRate: rate(items, item => item.stp), loopRate: rate(items, item => item.repeatedSteps > 0), totalCost: items.reduce((sum, item) => sum + item.caseCost, 0), savings: items.reduce((sum, item) => sum + item.estimatedSavings, 0) };
  }).sort((a, b) => b.count - a.count || b.totalCost - a.totalCost).map((item, index) => ({ ...item, rank: index + 1 }));
}

function diagnose(variant: Variant) {
  const repeated = variant.path.filter((step, index) => variant.path.indexOf(step) !== index);
  if (repeated.length) return `${[...new Set(repeated)].join(", ")} repeats in the actual route. Prioritize the return condition, missing information, and ownership rule that sends claims back.`;
  if (variant.exceptionRate >= 25) return "The route is structurally direct, but a high share of its claims still meet exception criteria. Inspect manual-control events, queue aging, and terminal outcomes in the evidence table.";
  if (variant.stpRate < 70) return "This route has limited straight-through performance. Compare the actual and straight paths, then focus on manual touches and handoffs that do not change the claim outcome.";
  return "This variant is comparatively stable. Protect its routing rules and use it as a reference pattern for higher-friction variants.";
}
function rate<T>(items: T[], test: (item: T) => boolean) { return items.filter(test).length / Math.max(items.length, 1) * 100; }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1); }
function percentile(values: number[], p: number) { return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : 0; }
function shortPath(path: string[]) { return path.length <= 4 ? path.join(" → ") : `${path.slice(0, 4).join(" → ")} → …`; }
function formatHours(hours: number) { return hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hrs`; }
function money(value: number) { return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
