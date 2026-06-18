"use client";

import { useMemo, useState } from "react";

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
  lpiDrivers: {
    name: string;
    currentPoints: number;
    reductionPoints: number;
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
          <p>Executive insight, claim-flow exploration, straight-through processing, reassignment control, and LPI reduction—calculated from the selected uploaded dataset.</p>
        </div>
        <div className="lpi-hero">
          <span>Projected LPI reduction</span>
          <strong>{analysis.claims.lpiReduction.toFixed(1)} pts</strong>
          <small>{analysis.claims.lpiReductionRate.toFixed(1)}% improvement opportunity</small>
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
        <DeepKpi label="Current LPI" value={claims.currentLpi.toFixed(1)} detail="Lower is better" tone="purple" />
        <DeepKpi label="Projected LPI" value={claims.projectedLpi.toFixed(1)} detail={`Down ${claims.lpiReduction.toFixed(1)} points`} tone="teal" />
      </section>

      <section className="grid cols">
        <div className="card">
          <DeepHeader kicker="Executive focus" title="Claims Performance Outlook" detail="The strongest operational signals and their expected effect on LPI." />
          <div className="executive-findings">
            <ExecutiveFinding label="Primary LPI driver" value={topDriver?.name || "No material driver"} detail={topDriver ? `${topDriver.currentPoints.toFixed(1)} current points; ${topDriver.reductionPoints.toFixed(1)} points addressable.` : "No driver was detected."} />
            <ExecutiveFinding label="Top STP blocker" value={topBlocker?.name || "No blocker detected"} detail={topBlocker ? `${topBlocker.claims.toLocaleString()} claims (${topBlocker.share.toFixed(1)}%).` : "Current paths meet the STP rules."} />
            <ExecutiveFinding label="Cycle-time opportunity" value={formatHours(claims.cycleTimeReductionHours)} detail={`STP averages ${formatHours(claims.avgStpHours)} versus ${formatHours(claims.avgManualHours)} for non-STP claims.`} />
          </div>
        </div>
        <div className="card">
          <DeepHeader kicker="LPI reduction" title="Reduction by Driver" detail="Projected improvement is expressed exclusively as LPI reduction points." />
          <div className="driver-list">
            {claims.lpiDrivers.map(driver => (
              <div className="driver-row" key={driver.name}>
                <div><strong>{driver.name}</strong><span>{driver.detail}</span></div>
                <div className="driver-numbers"><b>-{driver.reductionPoints.toFixed(1)}</b><span>of {driver.currentPoints.toFixed(1)} pts</span></div>
                <div className="bar"><i style={{ width: `${Math.min(100, driver.currentPoints ? driver.reductionPoints / driver.currentPoints * 100 : 0)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <DeepHeader kicker="Priority claims" title="Highest LPI Cases" detail="Claims are ranked by cycle time, manual intervention, reassignment, rework, and incomplete outcome exposure." />
        <CaseTable cases={claims.caseInsights.slice(0, 12)} />
      </section>
      <Methodology items={claims.methodology} />
    </div>
  );
}

function ClaimsExplorer({ analysis }: { analysis: ProcessAnalysis }) {
  const [filter, setFilter] = useState("all");
  const cases = useMemo(() => {
    if (filter === "stp") return analysis.claims.caseInsights.filter(item => item.stp);
    if (filter === "exception") return analysis.claims.caseInsights.filter(item => item.exception);
    if (filter === "reassigned") return analysis.claims.caseInsights.filter(item => item.reassignments > 0);
    if (filter === "rework") return analysis.claims.caseInsights.filter(item => item.repeatedSteps > 0);
    return analysis.claims.caseInsights;
  }, [analysis.claims.caseInsights, filter]);
  const topPath = analysis.pathAnalysis[0];
  const transitions = [...analysis.transitions].sort((a, b) => b.count - a.count).slice(0, 12);

  return (
    <div className="grid deep-section">
      <section className="card">
        <DeepHeader kicker="How the claims process works" title="Claims Process Explorer" detail="Each node is an activity and each connector is an observed handoff. Volume shows frequency; color shows average waiting-time severity." />
        <div className="explorer-controls">
          {[
            ["all", "All claims"],
            ["stp", "Straight-through"],
            ["exception", "Exceptions"],
            ["reassigned", "Reassigned"],
            ["rework", "Rework"],
          ].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}
          <span>{cases.length.toLocaleString()} visible claims</span>
        </div>
        {topPath ? (
          <div className="claim-flow">
            {topPath.path.slice(0, 9).map((step, index) => (
              <div className="claim-flow-step" key={`${step}-${index}`}>
                <span>{index + 1}</span><strong>{step}</strong>
                {index < Math.min(topPath.path.length, 9) - 1 && <i aria-hidden="true">→</i>}
              </div>
            ))}
          </div>
        ) : <div className="empty-state">No claim path is available.</div>}
        <div className="flow-caption">
          <strong>Dominant path</strong>
          <span>{topPath ? `${topPath.count.toLocaleString()} claims · ${topPath.share.toFixed(1)}% share · ${formatHours(topPath.avgHours)} average` : "No path data"}</span>
        </div>
      </section>

      <section className="grid cols">
        <div className="card">
          <DeepHeader kicker="Observed handoffs" title="High-Volume Connections" detail="The most frequently traveled links in the uploaded claims process." />
          <div className="connection-list">
            {transitions.map(item => (
              <div className="connection-row" key={`${item.from}-${item.to}`}>
                <span className={`severity-dot ${waitTone(item.avgHours)}`} />
                <div><strong>{item.from} → {item.to}</strong><span>{item.count.toLocaleString()} transitions</span></div>
                <b>{formatHours(item.avgHours)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <DeepHeader kicker="Variant behavior" title="Top Claim Variants" detail="Compare dominant routes, duration, and repeated work." />
          <div className="variant-list">
            {analysis.pathAnalysis.slice(0, 8).map((path, index) => (
              <div className="variant-row" key={index}>
                <span className="variant-rank">{index + 1}</span>
                <div><strong>{path.path.slice(0, 4).join(" → ")}{path.path.length > 4 ? "…" : ""}</strong><span>{path.count} claims · {path.share.toFixed(1)}% · {path.repeatedSteps} loops</span></div>
                <b>{formatHours(path.avgHours)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="card">
        <DeepHeader kicker="Filtered evidence" title="Claim-Level Explorer" detail="Use the filters above to isolate the process behavior behind each outcome." />
        <CaseTable cases={cases.slice(0, 30)} />
      </section>
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
        <DeepKpi label="LPI reduction opportunity" value={`${claims.lpiReduction.toFixed(1)} pts`} detail={`${claims.lpiReductionRate.toFixed(1)}% projected`} tone="purple" />
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
        <DeepKpi label="Reassignment LPI" value={`${claims.lpiDrivers.find(item => item.name === "Case reassignment")?.currentPoints.toFixed(1) || "0.0"} pts`} detail="Current average contribution" tone="purple" />
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
            {candidates.map(item => <option key={item.caseId} value={item.caseId}>{item.caseId} · LPI {item.lpi.toFixed(1)} · {item.currentOwner}</option>)}
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
      <table><thead><tr><th>Claim</th><th>Status</th><th>Current owner</th><th>Duration</th><th>Manual</th><th>Reassign</th><th>Loops</th><th>LPI</th></tr></thead><tbody>
        {cases.map(item => (
          <tr key={item.caseId}>
            <td><strong>{item.caseId}</strong><div className="case-path">{item.path.slice(0, 3).join(" → ")}{item.path.length > 3 ? "…" : ""}</div></td>
            <td><span className={`badge ${item.stp ? "Healthy" : item.exception ? "High" : "Watch"}`}>{item.status}</span></td>
            <td>{item.currentOwner}</td><td>{formatHours(item.durationHours)}</td><td>{item.manualTouches}</td><td>{item.reassignments}</td><td>{item.repeatedSteps}</td><td><strong>{item.lpi.toFixed(1)}</strong></td>
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
