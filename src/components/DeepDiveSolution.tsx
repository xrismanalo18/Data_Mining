"use client";

import { useState } from "react";

import InteractiveClaimsExplorer from "@/components/InteractiveClaimsExplorer";

type PathItem = {
  path: string[];
  count: number;
  share: number;
  avgHours: number;
  p90Hours: number;
  repeatedSteps: number;
  status: string;
};

type ProcessAnalysis = {
  caseCount: number;
  eventCount: number;
  avgDurationHours: number;
  p90DurationHours?: number;
  completionRate?: number;
  reworkRate: number;
  activities: { name: string; count: number }[];
  transitions: { from: string; to: string; count: number; avgHours: number }[];
  pathAnalysis: PathItem[];
  claims: ClaimsAnalysis;
};

export type ClaimsAnalysis = {
  completedClaims: number;
  exceptionClaims: number;
  exceptionRate: number;
  stpClaims: number;
  stpRate: number;
  manualClaims: number;
  manualTouchRate: number;
  reassignedClaims: number;
  reassignmentRate: number;
  totalReassignments: number;
  avgStpHours: number;
  avgManualHours: number;
  cycleTimeReductionHours: number;
  currentLpi: number;
  projectedLpi: number;
  lpiReduction: number;
  lpiReductionRate: number;
  hasCostData: boolean;
  costCoverageRate: number;
  currentCostExposure: number;
  projectedCost: number;
  estimatedSavings: number;
  savingsRate: number;
  lpiDrivers: {
    name: string;
    currentPoints: number;
    reductionPoints: number;
    savingsAmount: number;
    savingsRate: number;
    detail: string;
  }[];
  stpBlockers: {
    name: string;
    claims: number;
    share: number;
    detail: string;
  }[];
  reassignmentRoutes: {
    from: string;
    to: string;
    count: number;
    avgDelayHours: number;
  }[];
  ownerWorkload: {
    owner: string;
    events: number;
    claims: number;
    reassignedIn: number;
    reassignedOut: number;
  }[];
  caseInsights: {
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
  }[];
  methodology: string[];
};

const views = [
  ["executive", "Executive Dashboard"],
  ["explorer", "Process Explorer"],
  ["stp", "Straight-Through Processing"],
  ["reassignment", "Case Reassignment"],
] as const;

export default function DeepDiveSolution({ analysis }: { analysis: ProcessAnalysis }) {
  const [view, setView] = useState<(typeof views)[number][0]>("executive");

  return (
    <section className="deep-dive">
      <div className="deep-dive-hero">
        <div>
          <div className="section-kicker">Claims process intelligence</div>
          <h2>Deep Dive Solution</h2>
          <p>Executive insight, claim-flow exploration, straight-through processing, reassignment control, and estimated savings—calculated from the selected uploaded dataset.</p>
        </div>
        <div className="lpi-hero">
          <span>Estimated savings</span>
          <strong>{formatSavings(analysis.claims.estimatedSavings, analysis.claims.hasCostData)}</strong>
          <small>{analysis.claims.hasCostData ? `${analysis.claims.savingsRate.toFixed(1)}% of mapped cost` : "Map a cost field to calculate"}</small>
        </div>
      </div>
      <div className="deep-dive-nav" role="tablist" aria-label="Deep Dive Solution views">
        {views.map(([id, label]) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>
      {view === "executive" && <ExecutiveDashboard analysis={analysis} />}
      {view === "explorer" && <InteractiveClaimsExplorer cases={analysis.claims.caseInsights} />}
      {view === "stp" && <StraightThrough analysis={analysis} />}
      {view === "reassignment" && <CaseReassignment analysis={analysis} />}
    </section>
  );
}

function ExecutiveDashboard({ analysis }: { analysis: ProcessAnalysis }) {
  const claims = analysis.claims;
  const topDriver = claims.lpiDrivers[0];
  const topBlocker = claims.stpBlockers[0];
  return (
    <div className="grid deep-section">
      <section className="deep-kpis">
        <DeepKpi label="Claims analyzed" value={analysis.caseCount.toLocaleString()} detail={`${claims.completedClaims.toLocaleString()} terminal outcomes`} tone="blue" />
        <DeepKpi label="STP rate" value={`${claims.stpRate.toFixed(1)}%`} detail={`${claims.stpClaims.toLocaleString()} straight-through claims`} tone="green" />
        <DeepKpi label="Exception rate" value={`${claims.exceptionRate.toFixed(1)}%`} detail={`${claims.exceptionClaims.toLocaleString()} claims require attention`} tone="red" />
        <DeepKpi label="Reassignment rate" value={`${claims.reassignmentRate.toFixed(1)}%`} detail={`${claims.totalReassignments.toLocaleString()} detected handoffs`} tone="amber" />
        <DeepKpi label="Cost exposure" value={formatSavings(claims.currentCostExposure, claims.hasCostData)} detail={claims.hasCostData ? `${claims.costCoverageRate.toFixed(1)}% claim coverage` : "Cost data required"} tone="purple" />
        <DeepKpi label="Estimated savings" value={formatSavings(claims.estimatedSavings, claims.hasCostData)} detail={claims.hasCostData ? `${claims.savingsRate.toFixed(1)}% opportunity` : "Cost data required"} tone="teal" />
      </section>

      <section className="grid cols">
        <div className="card">
          <DeepHeader kicker="Executive focus" title="Claims Performance Outlook" detail="The strongest operational signals and their estimated financial opportunity." />
          <div className="executive-findings">
            <ExecutiveFinding label="Primary savings driver" value={topDriver?.name || "No material driver"} detail={topDriver ? `${formatSavings(topDriver.savingsAmount, claims.hasCostData)} estimated savings (${topDriver.savingsRate.toFixed(1)}%).` : "No driver was detected."} />
            <ExecutiveFinding label="Top STP blocker" value={topBlocker?.name || "No blocker detected"} detail={topBlocker ? `${topBlocker.claims.toLocaleString()} claims (${topBlocker.share.toFixed(1)}%).` : "Current paths meet the STP rules."} />
            <ExecutiveFinding label="Cycle-time opportunity" value={formatHours(claims.cycleTimeReductionHours)} detail={`STP averages ${formatHours(claims.avgStpHours)} versus ${formatHours(claims.avgManualHours)} for non-STP claims.`} />
          </div>
        </div>
        <div className="card">
          <DeepHeader kicker="Savings opportunity" title="Estimated Savings by Driver" detail={claims.hasCostData ? "Dollar savings and percentage are based on mapped claim-cost exposure." : "Map a cost field during upload to calculate dollar savings."} />
          <div className="driver-list">
            {claims.lpiDrivers.map(driver => (
              <div className="driver-row" key={driver.name}>
                <div><strong>{driver.name}</strong><span>{driver.detail}</span></div>
                <div className="driver-numbers"><b>{formatSavings(driver.savingsAmount, claims.hasCostData)}</b><span>{claims.hasCostData ? `${driver.savingsRate.toFixed(1)}% of exposure` : "Cost data required"}</span></div>
                <div className="bar"><i style={{ width: `${Math.min(100, driver.currentPoints ? driver.reductionPoints / driver.currentPoints * 100 : 0)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <DeepHeader kicker="Priority claims" title="Highest Savings Opportunities" detail="Claims are ranked by estimated savings, process delay, manual intervention, reassignment, and rework." />
        <CaseTable cases={claims.caseInsights.slice(0, 12)} />
      </section>
      <Methodology items={claims.methodology} />
    </div>
  );
}

function StraightThrough({ analysis }: { analysis: ProcessAnalysis }) {
  const claims = analysis.claims;
  const maxClaims = Math.max(...claims.stpBlockers.map(item => item.claims), 1);
  return (
    <div className="grid deep-section">
      <section className="deep-kpis four">
        <DeepKpi label="STP claims" value={claims.stpClaims.toLocaleString()} detail={`${claims.stpRate.toFixed(1)}% of analyzed claims`} tone="green" />
        <DeepKpi label="Non-STP claims" value={(analysis.caseCount - claims.stpClaims).toLocaleString()} detail={`${(100 - claims.stpRate).toFixed(1)}% require intervention`} tone="red" />
        <DeepKpi label="STP cycle time" value={formatHours(claims.avgStpHours)} detail={`Non-STP: ${formatHours(claims.avgManualHours)}`} tone="blue" />
        <DeepKpi label="Estimated savings" value={formatSavings(claims.estimatedSavings, claims.hasCostData)} detail={claims.hasCostData ? `${claims.savingsRate.toFixed(1)}% projected` : "Cost data required"} tone="purple" />
      </section>
      <section className="grid cols">
        <div className="card">
          <DeepHeader kicker="Automation eligibility" title="STP Classification" detail="A claim is straight-through when it reaches a terminal outcome without manual-control activities, owner changes, or repeated steps." />
          <div className="stp-meter">
            <div className="stp-ring" style={{ "--stp": `${claims.stpRate * 3.6}deg` } as React.CSSProperties}><strong>{claims.stpRate.toFixed(1)}%</strong><span>STP</span></div>
            <div>
              <h3>{claims.stpClaims.toLocaleString()} claims met every rule</h3>
              <p>{claims.manualClaims.toLocaleString()} claims include manual intervention, while {claims.reassignedClaims.toLocaleString()} experienced reassignment.</p>
            </div>
          </div>
        </div>
        <div className="card">
          <DeepHeader kicker="Conversion opportunity" title="STP Blockers" detail="The most common reasons claims fall out of straight-through processing." />
          <div className="blocker-list">
            {claims.stpBlockers.map(blocker => (
              <div className="blocker-row" key={blocker.name}>
                <div><strong>{blocker.name}</strong><span>{blocker.detail}</span></div>
                <b>{blocker.claims.toLocaleString()} · {blocker.share.toFixed(1)}%</b>
                <div className="bar"><i style={{ width: `${blocker.claims / maxClaims * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="card">
        <DeepHeader kicker="Straight-through evidence" title="Claims Meeting STP Rules" detail="These claims completed without a detected manual touch, reassignment, or loop." />
        <CaseTable cases={claims.caseInsights.filter(item => item.stp).slice(0, 30)} />
      </section>
    </div>
  );
}

function CaseReassignment({ analysis }: { analysis: ProcessAnalysis }) {
  const claims = analysis.claims;
  const candidates = claims.caseInsights.filter(item => item.reassignments > 0 || item.exception).slice(0, 40);
  const owners = claims.ownerWorkload.map(item => item.owner);
  const [selectedCase, setSelectedCase] = useState(candidates[0]?.caseId || "");
  const [selectedOwner, setSelectedOwner] = useState(owners[0] || "");
  const [simulations, setSimulations] = useState<Record<string, string>>({});

  function simulate() {
    if (!selectedCase || !selectedOwner) return;
    setSimulations(current => ({ ...current, [selectedCase]: selectedOwner }));
  }

  return (
    <div className="grid deep-section">
      <section className="deep-kpis four">
        <DeepKpi label="Reassigned claims" value={claims.reassignedClaims.toLocaleString()} detail={`${claims.reassignmentRate.toFixed(1)}% of claims`} tone="amber" />
        <DeepKpi label="Owner handoffs" value={claims.totalReassignments.toLocaleString()} detail="Detected changes and routing events" tone="red" />
        <DeepKpi label="Active owners" value={claims.ownerWorkload.length.toLocaleString()} detail="From the mapped resource field" tone="blue" />
        <DeepKpi label="Reassignment savings" value={formatSavings(claims.lpiDrivers.find(item => item.name === "Case reassignment")?.savingsAmount || 0, claims.hasCostData)} detail={claims.hasCostData ? `${(claims.lpiDrivers.find(item => item.name === "Case reassignment")?.savingsRate || 0).toFixed(1)}% opportunity` : "Cost data required"} tone="purple" />
      </section>

      <section className="grid cols">
        <div className="card">
          <DeepHeader kicker="Routing pattern" title="Top Reassignment Routes" detail="Owner-to-owner changes ranked by observed volume and handoff delay." />
          {claims.reassignmentRoutes.length ? (
            <div className="connection-list">
              {claims.reassignmentRoutes.map(route => (
                <div className="connection-row" key={`${route.from}-${route.to}`}>
                  <span className={`severity-dot ${waitTone(route.avgDelayHours)}`} />
                  <div><strong>{route.from} → {route.to}</strong><span>{route.count} handoffs</span></div>
                  <b>{formatHours(route.avgDelayHours)}</b>
                </div>
              ))}
            </div>
          ) : <div className="empty-state"><strong>No owner-to-owner changes detected</strong><p>Map a resource or owner column during upload to enable owner-level reassignment routes.</p></div>}
        </div>
        <div className="card">
          <DeepHeader kicker="What-if control" title="Reassignment Simulator" detail="Test a routing decision in this browser session. Nothing here is written to PostgreSQL." />
          <label>Exception claim</label>
          <select value={selectedCase} onChange={event => setSelectedCase(event.target.value)}>
            {candidates.map(item => <option key={item.caseId} value={item.caseId}>{item.caseId} · {formatSavings(item.estimatedSavings, item.hasCostData)} · {item.currentOwner}</option>)}
          </select>
          <label>Proposed owner</label>
          <select value={selectedOwner} onChange={event => setSelectedOwner(event.target.value)}>
            {owners.map(owner => <option key={owner} value={owner}>{owner}</option>)}
          </select>
          <button className="button simulation-button" onClick={simulate} disabled={!selectedCase || !selectedOwner}>Simulate reassignment</button>
          {Object.keys(simulations).length > 0 && (
            <div className="simulation-results">
              <strong>Session-only simulation</strong>
              {Object.entries(simulations).map(([caseId, owner]) => <span key={caseId}>{caseId} → {owner}</span>)}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <DeepHeader kicker="Capacity signal" title="Owner Workload and Routing Balance" detail="Claims touched, inbound assignments, and outbound assignments by owner." />
        <table><thead><tr><th>Owner</th><th>Claims touched</th><th>Events</th><th>Reassigned in</th><th>Reassigned out</th><th>Net flow</th></tr></thead><tbody>
          {claims.ownerWorkload.map(owner => <tr key={owner.owner}><td><strong>{owner.owner}</strong></td><td>{owner.claims}</td><td>{owner.events}</td><td>{owner.reassignedIn}</td><td>{owner.reassignedOut}</td><td>{owner.reassignedIn - owner.reassignedOut > 0 ? "+" : ""}{owner.reassignedIn - owner.reassignedOut}</td></tr>)}
        </tbody></table>
      </section>
    </div>
  );
}

function CaseTable({ cases }: { cases: ClaimsAnalysis["caseInsights"] }) {
  if (!cases.length) return <div className="empty-state"><strong>No claims match this view</strong><p>Try another filter or confirm the uploaded activity and resource mappings.</p></div>;
  return (
    <div className="table-scroll">
      <table><thead><tr><th>Claim</th><th>Status</th><th>Current owner</th><th>Duration</th><th>Manual</th><th>Reassign</th><th>Loops</th><th>Est. savings</th><th>Savings %</th></tr></thead><tbody>
        {cases.map(item => (
          <tr key={item.caseId}>
            <td><strong>{item.caseId}</strong><div className="case-path">{item.path.slice(0, 3).join(" → ")}{item.path.length > 3 ? "…" : ""}</div></td>
            <td><span className={`badge ${item.stp ? "Healthy" : item.exception ? "High" : "Watch"}`}>{item.status}</span></td>
            <td>{item.currentOwner}</td><td>{formatHours(item.durationHours)}</td><td>{item.manualTouches}</td><td>{item.reassignments}</td><td>{item.repeatedSteps}</td><td><strong>{formatSavings(item.estimatedSavings, item.hasCostData)}</strong></td><td>{item.hasCostData ? `${item.savingsRate.toFixed(1)}%` : "—"}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}

function Methodology({ items }: { items: string[] }) {
  return <section className="card methodology"><DeepHeader kicker="Explainability" title="Calculation Rules" detail="The dashboard uses deterministic rules so each metric can be traced to the uploaded event log." /><ol>{items.map(item => <li key={item}>{item}</li>)}</ol></section>;
}

function DeepKpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <div className={`deep-kpi tone-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function DeepHeader({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return <div className="panel-header"><div className="section-kicker">{kicker}</div><h2>{title}</h2><p>{detail}</p></div>;
}

function ExecutiveFinding({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="executive-finding"><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>;
}

function waitTone(hours: number) {
  if (hours >= 168) return "critical";
  if (hours >= 72) return "high";
  if (hours >= 24) return "medium";
  return "low";
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
