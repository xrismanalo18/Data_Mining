import { z } from "zod";

import type { BottleneckAnalysis } from "@/lib/quick-bottleneck";

export const chartPlanSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  charts: z.array(z.object({
    type: z.enum(["bar", "donut", "table", "kpi"]),
    title: z.string().min(1).max(100),
    source: z.enum(["summary", "looping_events", "age_breakdown", "over30_events"]),
    metric: z.enum(["claim_count", "loop_instances", "total_days", "average_days", "unique_claims", "interest_amount", "share", "event_count"]),
    limit: z.number().int().min(1).max(20),
  })).min(1).max(6),
  insights: z.array(z.string().min(1).max(240)).max(5),
});

export type ChartPlan = z.infer<typeof chartPlanSchema>;

export type AiDashboardChart = {
  type: "bar" | "donut" | "table" | "kpi";
  title: string;
  metricLabel: string;
  rows: { label: string; value: number; formattedValue: string; detail: string }[];
};

export type AiDashboard = {
  title: string;
  description: string;
  generatedBy: "openai" | "local";
  notice?: string;
  charts: AiDashboardChart[];
  insights: string[];
};

const sourceMetrics: Record<ChartPlan["charts"][number]["source"], ChartPlan["charts"][number]["metric"][]> = {
  summary: ["claim_count", "loop_instances", "interest_amount"],
  looping_events: ["loop_instances", "total_days", "average_days", "unique_claims"],
  age_breakdown: ["claim_count", "average_days", "interest_amount", "share"],
  over30_events: ["loop_instances", "total_days", "average_days", "unique_claims", "event_count"],
};

export function validatePlan(plan: ChartPlan) {
  const charts = plan.charts.filter(chart => sourceMetrics[chart.source].includes(chart.metric));
  if (!charts.length) throw new Error("The generated dashboard did not contain a supported source and metric combination.");
  return { ...plan, charts };
}

export function materializeDashboard(plan: ChartPlan, analysis: BottleneckAnalysis, generatedBy: AiDashboard["generatedBy"], notice?: string): AiDashboard {
  const validPlan = validatePlan(plan);
  return {
    title: validPlan.title,
    description: validPlan.description,
    generatedBy,
    notice,
    charts: validPlan.charts.map(chart => materializeChart(chart, analysis)),
    insights: validPlan.insights,
  };
}

function materializeChart(chart: ChartPlan["charts"][number], analysis: BottleneckAnalysis): AiDashboardChart {
  let values: { label: string; value: number; detail: string }[] = [];
  if (chart.source === "summary") {
    values = summaryRows(chart.metric, analysis);
  } else if (chart.source === "looping_events") {
    values = analysis.loopingEvents.map(row => ({ label: row.event, value: metricValue(chart.metric, row), detail: `${row.uniqueBaseClids.toLocaleString()} Base CLIDs` }));
  } else if (chart.source === "age_breakdown") {
    values = analysis.ageBreakdown.map(row => ({ label: row.bucket, value: metricValue(chart.metric, row), detail: `${row.share.toFixed(1)}% of aged claims` }));
  } else {
    values = analysis.over30Events.map(row => ({ label: row.event, value: metricValue(chart.metric, row), detail: `${row.uniqueBaseClids.toLocaleString()} Base CLIDs` }));
  }

  const rows = values.sort((left, right) => right.value - left.value).slice(0, chart.limit).map(row => ({
    ...row,
    formattedValue: formatValue(chart.metric, row.value),
  }));
  return { type: chart.type, title: chart.title, metricLabel: metricLabel(chart.metric), rows };
}

function summaryRows(metric: ChartPlan["charts"][number]["metric"], analysis: BottleneckAnalysis) {
  if (metric === "interest_amount") return [{ label: "Interest amount", value: analysis.summary.totalInterestAmount, detail: "Latest record per Base CLID" }];
  if (metric === "loop_instances") return [{ label: "Loop instances", value: analysis.summary.loopInstances, detail: `${analysis.summary.loopingEvents} looping event names` }];
  return [
    { label: "All Base CLIDs", value: analysis.summary.uniqueBaseClaims, detail: `${analysis.summary.usableRows} usable rows` },
    { label: "Claims over 30 days", value: analysis.summary.claimsOver30Days, detail: `${analysis.summary.over30Rate.toFixed(1)}% over-30 rate` },
  ];
}

function metricValue(metric: ChartPlan["charts"][number]["metric"], row: Record<string, unknown>) {
  const fieldByMetric: Record<typeof metric, string> = {
    claim_count: "uniqueBaseClids",
    loop_instances: "loopInstances",
    total_days: "totalDaysBetween",
    average_days: "averageDaysBetween",
    unique_claims: "uniqueBaseClids",
    interest_amount: "totalInterestAmount",
    share: "share",
    event_count: "eventCount",
  };
  const value = row[fieldByMetric[metric]];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricLabel(metric: ChartPlan["charts"][number]["metric"]) {
  return ({ claim_count: "Claims", loop_instances: "Loop instances", total_days: "Total days", average_days: "Average days", unique_claims: "Unique Base CLIDs", interest_amount: "Interest amount", share: "Portfolio share", event_count: "Events" })[metric];
}

function formatValue(metric: ChartPlan["charts"][number]["metric"], value: number) {
  if (metric === "interest_amount") return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (metric === "share") return `${value.toFixed(1)}%`;
  if (metric === "total_days" || metric === "average_days") return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} days`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function localDashboardPlan(command: string, analysis: BottleneckAnalysis): ChartPlan {
  const request = command.toLowerCase();
  const wantsLoops = /loop|repeat|rework/.test(request);
  const wantsAge = /age|30|interest|paid/.test(request);
  const wantsDelay = /delay|queue|slow|event|touchpoint/.test(request);
  const charts: ChartPlan["charts"] = [];
  if (wantsAge || (!wantsLoops && !wantsDelay)) charts.push({ type: "donut", title: "Claim age population", source: "age_breakdown", metric: "claim_count", limit: 2 });
  if (wantsLoops || (!wantsAge && !wantsDelay)) charts.push({ type: "bar", title: "Highest looping queues", source: "looping_events", metric: "loop_instances", limit: 10 });
  if (wantsDelay || (!wantsAge && !wantsLoops)) charts.push({ type: "bar", title: "Largest aged-claim delays", source: "over30_events", metric: "total_days", limit: 10 });
  charts.push({ type: "kpi", title: "Portfolio totals", source: "summary", metric: "claim_count", limit: 2 });
  return {
    title: "Generated Bottleneck Dashboard",
    description: `Dashboard created for: ${command.slice(0, 180)}`,
    charts: charts.slice(0, 4),
    insights: [
      `${analysis.summary.claimsOver30Days.toLocaleString()} claims are over 30 days (${analysis.summary.over30Rate.toFixed(1)}%).`,
      `${analysis.summary.loopInstances.toLocaleString()} loop instances were detected across ${analysis.summary.loopingEvents.toLocaleString()} event names.`,
    ],
  };
}
