"use client";

import { FormEvent, useMemo, useState } from "react";

import type { AiDashboard } from "@/lib/ai-dashboard";
import type { BottleneckAnalysis, BottleneckMapping } from "@/lib/quick-bottleneck";
import { postWorkbook, readApiResponse } from "@/lib/client-file-upload";

type Preview = {
  uploadId: string;
  filename: string;
  sheetName: string;
  headerRow: number;
  rowCount: number;
  headers: string[];
  detectedMapping: BottleneckMapping;
  sampleRows: Record<string, unknown>[];
};

const mappingFields: { key: keyof BottleneckMapping; label: string; required?: boolean; detail: string }[] = [
  { key: "claim_id", label: "Claim ID", required: true, detail: "Last two characters are removed to derive Base CLID." },
  { key: "event_name", label: "WQDF_DESC / Event", detail: "Primary event or queue name." },
  { key: "comments", label: "Comments", detail: "Used when the event name is blank." },
  { key: "event_timestamp", label: "Event Timestamp", required: true, detail: "Used for event sequence and elapsed-day calculations." },
  { key: "received_date", label: "Received Date", required: true, detail: "Minimum value determines claim start." },
  { key: "paid_date", label: "Paid Date", required: true, detail: "Maximum value determines claim completion." },
  { key: "amount", label: "CLCK_INT_AMT", detail: "Latest claim record is counted once." },
];

const templates = [
  { id: 1, number: "01", title: "Looping Events / Queues", detail: "Repeated events inside the same normalized Base CLID." },
  { id: 2, number: "02", title: "Claim Age Breakdown", detail: "Compare claims aged 30 days and less with claims over 30 days." },
  { id: 3, number: "03", title: ">30-Day Event Delays", detail: "Find the event queues driving elapsed time in aged claims." },
] as const;

type BottleneckView = 1 | 2 | 3 | "etl" | "executive" | "dynamic";
type CommandMessage = { role: "assistant" | "user"; text: string };

export default function QuickBottleneckAnalysis() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<BottleneckMapping | null>(null);
  const [analysis, setAnalysis] = useState<BottleneckAnalysis | null>(null);
  const [filename, setFilename] = useState("");
  const [view, setView] = useState<BottleneckView>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const response = await postWorkbook(new FormData(event.currentTarget), "/api/bottleneck/preview");
      const body = await readApiResponse<Preview & { error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Unable to preview bottleneck file.");
      setPreview(body); setMapping(body.detectedMapping); setFilename(body.filename);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to preview bottleneck file."); }
    finally { setBusy(false); }
  }

  async function runAnalysis() {
    if (!preview || !mapping) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/bottleneck/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: preview.uploadId, mapping }) });
      const body = await readApiResponse<{ analysis: BottleneckAnalysis; filename: string; error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Unable to run bottleneck analysis.");
      setAnalysis(body.analysis); setFilename(body.filename); setPreview(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to run bottleneck analysis."); }
    finally { setBusy(false); }
  }

  const reset = () => { setPreview(null); setMapping(null); setAnalysis(null); setFilename(""); setError(""); setView(1); };

  return <section className="quick-bottleneck">
    <header className="quick-bottleneck-hero">
      <div><div className="section-kicker">Independent diagnostic workspace</div><h2>Quick Bottleneck Analysis</h2><p>Upload a separate claims workbook to run focused loop, aging, and queue-delay diagnostics without changing the main process dataset.</p></div>
      <span>Separate file source</span>
    </header>
    {error && <div className="notice error">{error}</div>}

    {!preview && !analysis && <div className="bottleneck-upload-card">
      <div><strong>Upload bottleneck workbook</strong><p>This upload is isolated from Process Map and Correlation Analysis data.</p></div>
      <form onSubmit={upload}><input name="file" type="file" accept=".xlsx,.xlsm,.xls,.csv" required /><button className="button" disabled={busy}>{busy ? "Reading workbook…" : "Preview and map"}</button></form>
    </div>}

    {preview && mapping && <BottleneckMappingPreview preview={preview} mapping={mapping} setMapping={setMapping} busy={busy} onRun={runAnalysis} onCancel={reset} />}
    {analysis && <BottleneckDashboard analysis={analysis} filename={filename} view={view} setView={setView} onReset={reset} />}
  </section>;
}

function BottleneckMappingPreview({ preview, mapping, setMapping, busy, onRun, onCancel }: { preview: Preview; mapping: BottleneckMapping; setMapping: (mapping: BottleneckMapping) => void; busy: boolean; onRun: () => void; onCancel: () => void }) {
  const missing = mappingFields.filter(field => field.required && !mapping[field.key]);
  const missingEvent = !mapping.event_name && !mapping.comments;
  return <div className="bottleneck-mapping-card">
    <header><div><strong>Confirm bottleneck field mapping</strong><span>{preview.filename} · {preview.rowCount.toLocaleString()} rows · {preview.sheetName}, header row {preview.headerRow}</span></div><button type="button" onClick={onCancel}>Cancel</button></header>
    {(missing.length > 0 || missingEvent) && <div className="notice error">Select {missing.map(field => field.label).concat(missingEvent ? ["WQDF_DESC or Comments"] : []).join(", ")}.</div>}
    <div className="bottleneck-mapping-grid">{mappingFields.map(field => <label key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><select value={mapping[field.key]} onChange={event => setMapping({ ...mapping, [field.key]: event.target.value })}><option value="">{field.required ? "Select column" : "Not available"}</option>{preview.headers.map(header => <option key={header} value={header}>{header}</option>)}</select><small>{field.detail}</small></label>)}</div>
    <div className="bottleneck-preview-table"><table><thead><tr>{preview.headers.slice(0, 8).map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.sampleRows.slice(0, 3).map((row, index) => <tr key={index}>{preview.headers.slice(0, 8).map(header => <td key={header}>{String(row[header] ?? "").slice(0, 45)}</td>)}</tr>)}</tbody></table></div>
    <footer><button type="button" onClick={onCancel}>Choose another file</button><button className="button" type="button" disabled={busy || missing.length > 0 || missingEvent} onClick={onRun}>{busy ? "Analyzing…" : "Build dashboard"}</button></footer>
  </div>;
}

function BottleneckDashboard({ analysis, filename, view, setView, onReset }: { analysis: BottleneckAnalysis; filename: string; view: BottleneckView; setView: (view: BottleneckView) => void; onReset: () => void }) {
  const amount = analysis.summary.totalInterestAmount;
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<CommandMessage[]>([
    { role: "assistant", text: "Your workbook is ready. Ask me to show loops, compare claim age, inspect >30-day queues, run ETL health, or build an executive dashboard." },
  ]);
  const [dynamicDashboard, setDynamicDashboard] = useState<AiDashboard | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  async function executeCommand(rawCommand: string) {
    const request = rawCommand.trim();
    if (!request) return;
    const normalized = request.toLowerCase();
    const wantsGeneratedDashboard = /\b(create|build|generate|design|make|visualize|visualise|plot)\b/.test(normalized) && /\b(dashboard|chart|report|visual|graph)\b/.test(normalized);
    if (wantsGeneratedDashboard) {
      setCommand("");
      setAiBusy(true);
      setMessages(current => [...current, { role: "user" as const, text: request }, { role: "assistant" as const, text: "Creating a dashboard from the available workbook metricsâ€¦" }].slice(-8));
      try {
        const apiResponse = await fetch("/api/bottleneck/chart-command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: request, analysis }) });
        const body = await readApiResponse<{ dashboard: AiDashboard; message?: string; error?: string }>(apiResponse);
        if (!apiResponse.ok) throw new Error(body.error || "Unable to create the dashboard.");
        setDynamicDashboard(body.dashboard);
        setView("dynamic");
        setMessages(current => [...current.slice(0, -1), { role: "assistant" as const, text: body.message || "Dashboard created." }]);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unable to create the dashboard.";
        setMessages(current => [...current.slice(0, -1), { role: "assistant" as const, text: message }]);
      } finally {
        setAiBusy(false);
      }
      return;
    }
    let nextView: BottleneckView = view;
    let response = "I built an executive view from the available workbook measures. Try mentioning loops, claim age, queue delays, ETL, or interest amount for a more focused result.";

    if (/\b(etl|extract|transform|load|data quality|clean|pipeline|mapping)\b/.test(normalized)) {
      nextView = "etl";
      response = `ETL health is ready: ${analysis.summary.usableRows.toLocaleString()} of ${analysis.summary.sourceRows.toLocaleString()} rows were usable, and ${analysis.summary.uniqueBaseClaims.toLocaleString()} normalized Base CLIDs were produced.`;
    } else if (/\b(loop|looping|repeat|rework|duplicate event)\b/.test(normalized)) {
      nextView = 1;
      response = `Showing looping events. I found ${analysis.summary.loopInstances.toLocaleString()} repeated instances across ${analysis.summary.loopingEvents.toLocaleString()} event or queue names.`;
    } else if (/\b(age|aging|aged|30 day|30-day|interest|amount)\b/.test(normalized)) {
      nextView = 2;
      response = `Showing the claim-age breakdown. ${analysis.summary.claimsOver30Days.toLocaleString()} claims are over 30 days, representing ${analysis.summary.over30Rate.toFixed(1)}% of claims with valid age dates.`;
    } else if (/\b(delay|delays|queue|queues|touchpoint|event gap|slow)\b/.test(normalized)) {
      nextView = 3;
      response = `Showing event and queue delays for claims over 30 days. ${analysis.over30Events.length.toLocaleString()} event labels are available for review.`;
    } else if (/\b(executive|summary|overview|another dashboard|new dashboard|dashboard)\b/.test(normalized)) {
      nextView = "executive";
      response = "I created an executive dashboard combining aged claims, loop exposure, interest amount, and the largest event-delay signals.";
    } else if (/\b(help|what can you do|commands)\b/.test(normalized)) {
      response = "I can open any of the three Quick Analysis reports, build an ETL health view, or create an executive dashboard. For example: ‘run ETL health’ or ‘show the queues causing delays’.";
    } else {
      nextView = "executive";
    }

    setView(nextView);
    setMessages(current => [...current, { role: "user" as const, text: request }, { role: "assistant" as const, text: response }].slice(-8));
    setCommand("");
  }

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void executeCommand(command);
  }

  return <div className="bottleneck-dashboard">
    <div className="bottleneck-sourcebar"><div><span>Analysis source</span><strong>{filename}</strong></div><button type="button" onClick={onReset}>Upload another bottleneck file</button></div>
    <div className="bottleneck-workbench">
      <aside className="bottleneck-quick-rail">
        <header><span>Quick Analysis</span><strong>Ready-made reports</strong><small>Select a report or ask the command assistant below.</small></header>
        <div className="bottleneck-template-cards">{templates.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.number}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div></button>)}</div>
        <div className="bottleneck-rail-divider"><span>Command-created views</span></div>
        <button className={`bottleneck-generated-view ${view === "etl" ? "active" : ""}`} onClick={() => setView("etl")}><i>ETL</i><span><strong>ETL Health</strong><small>Rows, normalization, and pipeline yield</small></span></button>
        <button className={`bottleneck-generated-view ${view === "executive" ? "active" : ""}`} onClick={() => setView("executive")}><i>AI</i><span><strong>Executive Dashboard</strong><small>Combined operational summary</small></span></button>
        {dynamicDashboard && <button className={`bottleneck-generated-view ${view === "dynamic" ? "active" : ""}`} onClick={() => setView("dynamic")}><i>NEW</i><span><strong>{dynamicDashboard.title}</strong><small>Created from your command</small></span></button>}
      </aside>
      <main className="bottleneck-dashboard-canvas">
        <div className="bottleneck-summary-kpis">
          <DashboardKpi label="Base CLIDs" value={analysis.summary.uniqueBaseClaims.toLocaleString()} detail={`${analysis.summary.usableRows.toLocaleString()} usable rows`} tone="blue" />
          <DashboardKpi label=">30-day claims" value={analysis.summary.claimsOver30Days.toLocaleString()} detail={`${analysis.summary.over30Rate.toFixed(1)}% of aged claims`} tone="red" />
          <DashboardKpi label="Loop instances" value={analysis.summary.loopInstances.toLocaleString()} detail={`${analysis.summary.loopingEvents} repeated events`} tone="amber" />
          <DashboardKpi label="Interest amount" value={money(amount)} detail="Latest record per Base CLID" tone="green" />
        </div>
        {view === 1 && <LoopingDashboard rows={analysis.loopingEvents} />}
        {view === 2 && <AgeDashboard rows={analysis.ageBreakdown} />}
        {view === 3 && <Over30Dashboard rows={analysis.over30Events} />}
        {view === "etl" && <EtlDashboard analysis={analysis} />}
        {view === "executive" && <ExecutiveDashboard analysis={analysis} />}
        {view === "dynamic" && dynamicDashboard && <AiGeneratedDashboard dashboard={dynamicDashboard} />}
      </main>
    </div>
    <CommandCenter command={command} setCommand={setCommand} messages={messages} busy={aiBusy} onSubmit={submitCommand} onSuggestion={command => void executeCommand(command)} />
  </div>;
}

function LoopingDashboard({ rows }: { rows: BottleneckAnalysis["loopingEvents"] }) {
  const maxLoops = Math.max(...rows.map(row => row.loopInstances), 1);
  const totalDays = rows.reduce((sum, row) => sum + row.totalDaysBetween, 0);
  const uniqueClaims = rows.reduce((sum, row) => sum + row.uniqueBaseClids, 0);
  return <DashboardSection kicker="Template 1" title="Looping Events / Queue Names" detail="Repeated event labels within normalized Base CLIDs, using WQDF_DESC and Comments fallback.">
    <div className="bottleneck-mini-kpis"><MiniKpi label="Looping event names" value={rows.length.toLocaleString()} /><MiniKpi label="Total loop instances" value={rows.reduce((sum, row) => sum + row.loopInstances, 0).toLocaleString()} /><MiniKpi label="Elapsed loop days" value={days(totalDays)} /><MiniKpi label="Claim-event coverage" value={uniqueClaims.toLocaleString()} /></div>
    <div className="bottleneck-content-grid"><HorizontalGraph title="Top looping queues" subtitle="Loop instances" rows={rows.slice(0, 12).map(row => ({ label: row.event, value: row.loopInstances, width: row.loopInstances / maxLoops * 100, detail: `${row.uniqueBaseClids} Base CLIDs` }))} /><InsightCard title="How to use this" items={rows.slice(0, 4).map(row => `${row.event}: ${row.loopInstances} loops and ${days(row.totalDaysBetween)} elapsed between repeats.`)} /></div>
    <MetricTable headers={["Event / Queue", "Avg days between", "Total days", "Loop instances", "Unique Base CLIDs"]} rows={rows.map(row => [row.event, row.averageDaysBetween.toFixed(2), row.totalDaysBetween.toFixed(2), row.loopInstances.toLocaleString(), row.uniqueBaseClids.toLocaleString()])} />
  </DashboardSection>;
}

function AgeDashboard({ rows }: { rows: BottleneckAnalysis["ageBreakdown"] }) {
  const maxClaims = Math.max(...rows.map(row => row.uniqueBaseClids), 1);
  return <DashboardSection kicker="Template 2" title="Claim Age Breakdown" detail="Claim age is measured from minimum Received Date to maximum Paid Date; exactly 30 days is included in the lower bucket.">
    <div className="age-comparison">
      {rows.map((row, index) => <article key={row.bucket} className={index ? "late" : "on-time"}>
        <header><span>{row.bucket}</span><strong>{row.uniqueBaseClids.toLocaleString()}</strong><small>unique Base CLIDs</small></header>
        <div className="age-share-track"><i style={{ width: `${row.uniqueBaseClids / maxClaims * 100}%` }} /></div>
        <dl><div><dt>Portfolio share</dt><dd>{row.share.toFixed(1)}%</dd></div><div><dt>Average age</dt><dd>{days(row.averageAgeDays)}</dd></div><div><dt>Interest amount</dt><dd>{money(row.totalInterestAmount)}</dd></div></dl>
      </article>)}
    </div>
    <div className="age-stacked-chart">
      <strong>Claim population split</strong>
      <div>{rows.map((row, index) => <span key={row.bucket} className={index ? "late" : "on-time"} style={{ width: `${row.share}%` }} title={`${row.bucket}: ${row.share.toFixed(1)}%`}>{row.share >= 12 ? `${row.share.toFixed(1)}%` : ""}</span>)}</div>
      <footer>{rows.map((row, index) => <span key={row.bucket}><i className={index ? "late" : "on-time"} />{row.bucket}</span>)}</footer>
    </div>
    <MetricTable headers={["Age group", "Unique Base CLIDs", "Average age days", "SUM CLCK_INT_AMT", "Share"]} rows={rows.map(row => [row.bucket, row.uniqueBaseClids.toLocaleString(), row.averageAgeDays.toFixed(2), money(row.totalInterestAmount), `${row.share.toFixed(1)}%`])} />
  </DashboardSection>;
}

function Over30Dashboard({ rows }: { rows: BottleneckAnalysis["over30Events"] }) {
  const maxDays = Math.max(...rows.map(row => row.totalDaysBetween), 1);
  return <DashboardSection kicker="Template 3" title=">30-Day Event / Queue Delays" detail="All events from claims whose maximum Paid Date is more than 30 days after minimum Received Date.">
    <div className="bottleneck-mini-kpis"><MiniKpi label="Event / queue names" value={rows.length.toLocaleString()} /><MiniKpi label="Total elapsed days" value={days(rows.reduce((sum, row) => sum + row.totalDaysBetween, 0))} /><MiniKpi label="Loop instances" value={rows.reduce((sum, row) => sum + row.loopInstances, 0).toLocaleString()} /><MiniKpi label="Event records" value={rows.reduce((sum, row) => sum + row.eventCount, 0).toLocaleString()} /></div>
    <div className="bottleneck-content-grid"><HorizontalGraph title="Queues consuming aged-claim time" subtitle="Total days before event" rows={rows.slice(0, 12).map(row => ({ label: row.event, value: row.totalDaysBetween, width: row.totalDaysBetween / maxDays * 100, detail: `${row.uniqueBaseClids} Base CLIDs` }))} /><InsightCard title="Highest delay signals" items={rows.slice(0, 4).map(row => `${row.event}: ${days(row.averageDaysBetween)} average arrival gap across ${row.uniqueBaseClids} Base CLIDs.`)} /></div>
    <MetricTable headers={["Event / Queue", "Avg days between", "Total days", "Loop instances", "Unique Base CLIDs", "Events"]} rows={rows.map(row => [row.event, row.averageDaysBetween.toFixed(2), row.totalDaysBetween.toFixed(2), row.loopInstances.toLocaleString(), row.uniqueBaseClids.toLocaleString(), row.eventCount.toLocaleString()])} />
  </DashboardSection>;
}

function EtlDashboard({ analysis }: { analysis: BottleneckAnalysis }) {
  const rejectedRows = Math.max(0, analysis.summary.sourceRows - analysis.summary.usableRows);
  const yieldRate = analysis.summary.sourceRows ? analysis.summary.usableRows / analysis.summary.sourceRows * 100 : 0;
  return <DashboardSection kicker="Command view" title="ETL Pipeline Health" detail="Validation of the extraction, normalization, and claim-level aggregation used by the Quick Analysis reports.">
    <div className="bottleneck-mini-kpis"><MiniKpi label="Extracted rows" value={analysis.summary.sourceRows.toLocaleString()} /><MiniKpi label="Usable rows" value={analysis.summary.usableRows.toLocaleString()} /><MiniKpi label="Excluded rows" value={rejectedRows.toLocaleString()} /><MiniKpi label="Pipeline yield" value={`${yieldRate.toFixed(1)}%`} /></div>
    <div className="etl-pipeline">
      <article><i>01</i><span><strong>Extract</strong><small>{analysis.summary.sourceRows.toLocaleString()} workbook rows read</small></span></article>
      <b>→</b>
      <article><i>02</i><span><strong>Transform</strong><small>Claim IDs normalized and dates parsed</small></span></article>
      <b>→</b>
      <article><i>03</i><span><strong>Load</strong><small>{analysis.summary.uniqueBaseClaims.toLocaleString()} Base CLIDs aggregated</small></span></article>
    </div>
    <div className="bottleneck-content-grid"><HorizontalGraph title="ETL row disposition" subtitle="Workbook records" rows={[{ label: "Usable rows", value: analysis.summary.usableRows, width: yieldRate, detail: `${yieldRate.toFixed(1)}% yield` }, { label: "Excluded rows", value: rejectedRows, width: analysis.summary.sourceRows ? rejectedRows / analysis.summary.sourceRows * 100 : 0, detail: "Missing required claim data" }]} /><InsightCard title="Transformation rules applied" items={["Remove the final two Claim ID characters to derive Base CLID.", "Use WQDF_DESC, with Comments as the event-name fallback.", "Use minimum Received Date and maximum Paid Date for claim age.", "Take CLCK_INT_AMT from the latest claim record only."]} /></div>
  </DashboardSection>;
}

function ExecutiveDashboard({ analysis }: { analysis: BottleneckAnalysis }) {
  const maxDelay = Math.max(...analysis.over30Events.slice(0, 8).map(row => row.totalDaysBetween), 1);
  const topLoop = analysis.loopingEvents[0];
  const topDelay = analysis.over30Events[0];
  return <DashboardSection kicker="Command view" title="Executive Bottleneck Dashboard" detail="A combined view of portfolio aging, event rework, interest exposure, and the largest queue-delay signals.">
    <div className="bottleneck-mini-kpis"><MiniKpi label="Claims over 30 days" value={analysis.summary.claimsOver30Days.toLocaleString()} /><MiniKpi label="Over-30 rate" value={`${analysis.summary.over30Rate.toFixed(1)}%`} /><MiniKpi label="Repeated event instances" value={analysis.summary.loopInstances.toLocaleString()} /><MiniKpi label="Interest exposure" value={money(analysis.summary.totalInterestAmount)} /></div>
    <div className="bottleneck-content-grid"><HorizontalGraph title="Largest aged-claim event delays" subtitle="Total days" rows={analysis.over30Events.slice(0, 8).map(row => ({ label: row.event, value: row.totalDaysBetween, width: row.totalDaysBetween / maxDelay * 100, detail: `${row.uniqueBaseClids} claims` }))} /><InsightCard title="Executive signals" items={[`${analysis.summary.claimsOver30Days.toLocaleString()} claims exceed 30 days (${analysis.summary.over30Rate.toFixed(1)}% of claims with valid age dates).`, topLoop ? `${topLoop.event} is the leading loop signal with ${topLoop.loopInstances.toLocaleString()} repeated instances.` : "No repeated event labels were detected.", topDelay ? `${topDelay.event} has the largest accumulated event delay at ${days(topDelay.totalDaysBetween)}.` : "No >30-day event-delay records were detected.", `${money(analysis.summary.totalInterestAmount)} in interest amount was counted once per Base CLID.`]} /></div>
    <div className="age-stacked-chart"><strong>Claim population split</strong><div>{analysis.ageBreakdown.map((row, index) => <span key={row.bucket} className={index ? "late" : "on-time"} style={{ width: `${row.share}%` }}>{row.share >= 12 ? `${row.share.toFixed(1)}%` : ""}</span>)}</div><footer>{analysis.ageBreakdown.map((row, index) => <span key={row.bucket}><i className={index ? "late" : "on-time"} />{row.bucket}</span>)}</footer></div>
  </DashboardSection>;
}

function AiGeneratedDashboard({ dashboard }: { dashboard: AiDashboard }) {
  return <section className="ai-generated-dashboard">
    <header><div><span>{dashboard.generatedBy === "openai" ? "AI-generated view" : "Generated view"}</span><h3>{dashboard.title}</h3><p>{dashboard.description}</p></div><b>{dashboard.generatedBy === "openai" ? "OpenAI planner" : "Local planner"}</b></header>
    {dashboard.notice && <div className="ai-dashboard-notice">{dashboard.notice}</div>}
    <div className="ai-dashboard-grid">{dashboard.charts.map((chart, index) => <AiDashboardChartView key={`${chart.title}-${index}`} chart={chart} />)}</div>
    <InsightCard title="Generated insights" items={dashboard.insights} />
    <footer>Dashboard values were calculated by the application from aggregate workbook results. The model selected only the layout, sources, and metrics.</footer>
  </section>;
}

function AiDashboardChartView({ chart }: { chart: AiDashboard["charts"][number] }) {
  const max = Math.max(...chart.rows.map(row => row.value), 1);
  if (chart.type === "kpi") return <section className="ai-dashboard-chart ai-kpi-chart"><header><strong>{chart.title}</strong><span>{chart.metricLabel}</span></header><div>{chart.rows.map(row => <article key={row.label}><span>{row.label}</span><strong>{row.formattedValue}</strong><small>{row.detail}</small></article>)}</div></section>;
  if (chart.type === "table") return <section className="ai-dashboard-chart ai-table-chart"><header><strong>{chart.title}</strong><span>{chart.metricLabel}</span></header><div><table><thead><tr><th>Category</th><th>{chart.metricLabel}</th><th>Context</th></tr></thead><tbody>{chart.rows.map(row => <tr key={row.label}><td><strong>{row.label}</strong></td><td>{row.formattedValue}</td><td>{row.detail}</td></tr>)}</tbody></table></div></section>;
  if (chart.type === "donut") return <section className="ai-dashboard-chart ai-donut-chart"><header><strong>{chart.title}</strong><span>{chart.metricLabel}</span></header><div><i style={{ background: donutGradient(chart.rows) }}><em /></i><ol>{chart.rows.map((row, index) => <li key={row.label}><b style={{ background: dashboardColors[index % dashboardColors.length] }} /><span>{row.label}</span><strong>{row.formattedValue}</strong></li>)}</ol></div></section>;
  return <section className="ai-dashboard-chart ai-bar-chart"><header><strong>{chart.title}</strong><span>{chart.metricLabel}</span></header><div>{chart.rows.length ? chart.rows.map(row => <article key={row.label}><span title={row.label}>{row.label}</span><i><em style={{ width: `${Math.max(2, row.value / max * 100)}%` }} /></i><strong>{row.formattedValue}</strong><small>{row.detail}</small></article>) : <div className="bottleneck-empty">No matching rows were available.</div>}</div></section>;
}

const dashboardColors = ["#0ea5e9", "#f97316", "#22c55e", "#8b5cf6", "#ef4444", "#14b8a6"];
function donutGradient(rows: AiDashboard["charts"][number]["rows"]) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  if (!total) return "conic-gradient(#e2e8f0 0 100%)";
  let cursor = 0;
  return `conic-gradient(${rows.map((row, index) => { const start = cursor; cursor += Math.max(0, row.value) / total * 100; return `${dashboardColors[index % dashboardColors.length]} ${start}% ${cursor}%`; }).join(",")})`;
}

function CommandCenter({ command, setCommand, messages, busy, onSubmit, onSuggestion }: { command: string; setCommand: (value: string) => void; messages: CommandMessage[]; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onSuggestion: (command: string) => void }) {
  const suggestions = ["Run ETL health", "Show looping queues", "Create a dashboard for claim age and delays", "Build an executive dashboard"];
  return <section className="bottleneck-command-center">
    <header><div><span>Analysis command center</span><strong>Ask the workbook</strong></div><small>Commands change the dashboard using the loaded file.</small></header>
    <div className="bottleneck-chat-log" aria-live="polite">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role}><i>{message.role === "assistant" ? "AI" : "You"}</i><p>{message.text}</p></div>)}</div>
    <div className="bottleneck-command-suggestions">{suggestions.map(suggestion => <button type="button" key={suggestion} disabled={busy} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}</div>
    <form onSubmit={onSubmit}><input value={command} disabled={busy} onChange={event => setCommand(event.target.value)} placeholder="Example: Create a dashboard comparing claim age, loops, and queue delays" aria-label="Analysis command" /><button className="button" disabled={busy || !command.trim()}>{busy ? "Building dashboard..." : "Send command"} <span>Go</span></button></form>
    <footer>Commands operate only on this uploaded workbook and supported analytics views. They never execute operating-system or database commands.</footer>
  </section>;
}

function DashboardSection({ kicker, title, detail, children }: { kicker: string; title: string; detail: string; children: React.ReactNode }) { return <section className="bottleneck-report"><header><div><span>{kicker}</span><h3>{title}</h3><p>{detail}</p></div></header>{children}<footer className="bottleneck-methodology">Results are descriptive diagnostics based on the mapped workbook fields. Validate operational causes before acting on an association.</footer></section>; }
function DashboardKpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`tone-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function MiniKpi({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function HorizontalGraph({ title, subtitle, rows }: { title: string; subtitle: string; rows: { label: string; value: number; width: number; detail: string }[] }) { return <section className="bottleneck-graph"><header><strong>{title}</strong><span>{subtitle}</span></header><div>{rows.length ? rows.map(row => <div className="bottleneck-bar" key={row.label}><span title={row.label}>{row.label}</span><i><em style={{ width: `${Math.max(2, row.width)}%` }} /></i><b>{formatMetric(row.value)}</b><small>{row.detail}</small></div>) : <div className="bottleneck-empty">No matching event records were detected.</div>}</div></section>; }
function InsightCard({ title, items }: { title: string; items: string[] }) { return <aside className="bottleneck-insights"><header><strong>{title}</strong><span>Prioritized observations</span></header>{items.length ? <ol>{items.map((item, index) => <li key={item}><i>{index + 1}</i><span>{item}</span></li>)}</ol> : <div className="bottleneck-empty">No actionable signals were detected.</div>}</aside>; }
function MetricTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="bottleneck-table"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.slice(0, 200).map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((value, cell) => <td key={cell}>{cell === 0 ? <strong>{value}</strong> : value}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length}>No records matched this analysis.</td></tr>}</tbody></table></div>; }
function money(value: number) { return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }); }
function days(value: number) { return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} days`; }
function formatMetric(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value >= 100 ? value.toFixed(0) : value.toFixed(value % 1 ? 1 : 0); }
