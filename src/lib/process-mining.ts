export type EventRow = {
  caseId: string;
  activity: string;
  timestamp: string;
  resource: string | null;
  cost: number | null;
  attrs: Record<string, string>;
};

export type Mapping = {
  case_id: string;
  activity: string;
  timestamp: string;
  resource?: string;
  cost?: string;
  [key: string]: string | undefined;
};

const commonObjects = [
  "order_id",
  "purchase_order_id",
  "invoice_id",
  "payment_id",
  "delivery_id",
  "customer_id",
  "vendor_id",
  "material_id",
  "ticket_id",
  "claim_id",
  "provider_id",
  "group_id",
];

const aliases: Record<string, string[]> = {
  case_id: ["case_id", "case", "caseid", "case_key", "process_instance", "document_id", "baseclid", "clcl_claim_id"],
  activity: ["activity", "activity_name", "event", "event_name", "task", "step", "queue", "wqdf_desc3", "wqdf_desc2", "wqdf_desc"],
  timestamp: ["timestamp", "time", "event_time", "datetime", "date", "created_at", "wmhs_route_dt2", "wmhs_route_dt"],
  resource: ["resource", "user", "owner", "agent", "employee", "usus_usr_id", "wrol_role_desc2"],
  cost: ["cost", "amount", "value", "expense", "clcl_tot_chg_amt", "clck_net_pymt_amt"],
  customer_id: ["customer_id", "grgr_grp_id"],
  vendor_id: ["vendor_id", "prpr_prv_id"],
  provider_id: ["provider_id", "prpr_prv_id"],
  claim_id: ["claim_id", "clcl_claim_id", "baseclid"],
  group_id: ["group_id", "grgr_grp_id"],
};

export function detectMapping(headers: string[]) {
  const normalized = new Map(headers.map(header => [normalize(header), header]));
  const mapping: Mapping = { case_id: "", activity: "", timestamp: "" };
  for (const [canonical, candidates] of Object.entries(aliases)) {
    for (const candidate of candidates) {
      const match = normalized.get(candidate);
      if (match) {
        mapping[canonical] = match;
        break;
      }
    }
  }
  for (const header of headers) {
    const key = normalize(header);
    if (commonObjects.includes(key) || key.endsWith("_id")) {
      mapping[key] = header;
    }
  }
  return mapping;
}

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "_");
}

export function parseCost(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rowsToEvents(rows: Record<string, unknown>[], mapping: Mapping) {
  for (const required of ["case_id", "activity", "timestamp"] as const) {
    if (!mapping[required]) throw new Error(`Missing required mapping: ${required}`);
  }

  const objectKeys = Object.entries(mapping)
    .filter(([key, value]) => key.endsWith("_id") && value)
    .map(([key, value]) => [key, value as string] as const);

  const events: EventRow[] = [];
  for (const row of rows) {
    const caseId = String(row[mapping.case_id] ?? "").trim();
    const activity = String(row[mapping.activity] ?? "").trim();
    const rawTimestamp = row[mapping.timestamp];
    const date = new Date(String(rawTimestamp ?? ""));
    if (!caseId || !activity || Number.isNaN(date.getTime())) continue;

    const attrs: Record<string, string> = {};
    for (const [key, column] of objectKeys) {
      attrs[key] = String(row[column] ?? "").trim();
    }

    events.push({
      caseId,
      activity,
      timestamp: date.toISOString(),
      resource: mapping.resource ? String(row[mapping.resource] ?? "").trim() || null : null,
      cost: mapping.cost ? parseCost(row[mapping.cost]) : null,
      attrs,
    });
  }
  if (!events.length) {
    throw new Error("No usable events were found. Check the case, activity, and timestamp mapping.");
  }
  return events;
}

export function analyze(events: EventRow[]) {
  const cases = new Map<string, EventRow[]>();
  for (const event of events) {
    const list = cases.get(event.caseId) || [];
    list.push(event);
    cases.set(event.caseId, list);
  }
  for (const list of cases.values()) {
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  const activities = new Counter<string>();
  const resources = new Counter<string>();
  const variants = new Counter<string>();
  const variantPaths = new Map<string, string[]>();
  const variantDurations = new Map<string, number[]>();
  const transitions = new Counter<string>();
  const transitionDurations = new Map<string, number[]>();
  const transitionCases = new Map<string, Set<string>>();
  const objects = new Counter<string>();
  let completed = 0;
  let reworkCases = 0;
  let totalCost = 0;
  const durations: number[] = [];

  for (const [caseId, list] of cases) {
    const path = list.map(event => event.activity);
    const pathKey = path.join(" -> ");
    variantPaths.set(pathKey, path);
    variants.add(pathKey);
    if (new Set(path).size < path.length) reworkCases += 1;
    if (path.some(step => /complete|payment|closed|paid/i.test(step))) completed += 1;
    const caseDuration = list.length > 1 ? hoursBetween(list[0].timestamp, list[list.length - 1].timestamp) : 0;
    durations.push(caseDuration);
    const existing = variantDurations.get(pathKey) || [];
    existing.push(caseDuration);
    variantDurations.set(pathKey, existing);

    for (const event of list) {
      activities.add(event.activity);
      if (event.resource) resources.add(event.resource);
      totalCost += event.cost || 0;
      for (const [key, value] of Object.entries(event.attrs)) {
        if (key.endsWith("_id") && value) objects.add(`${key.replace("_id", "")}: ${value}`);
      }
    }

    for (let index = 0; index < list.length - 1; index += 1) {
      const left = list[index];
      const right = list[index + 1];
      const key = `${left.activity}|||${right.activity}`;
      transitions.add(key);
      const waits = transitionDurations.get(key) || [];
      waits.push(hoursBetween(left.timestamp, right.timestamp));
      transitionDurations.set(key, waits);
      const set = transitionCases.get(key) || new Set<string>();
      set.add(caseId);
      transitionCases.set(key, set);
    }
  }

  const bottlenecks = transitions.entries().map(([key, count]) => {
    const [from, to] = key.split("|||");
    const waits = transitionDurations.get(key) || [];
    const avg = average(waits);
    return {
      from,
      to,
      count,
      caseCount: transitionCases.get(key)?.size || 0,
      avgHours: avg,
      medianHours: median(waits),
      p90Hours: percentile(waits, 0.9),
      maxHours: Math.max(...waits, 0),
      severity: waitBand(avg),
      impactHours: avg * count,
    };
  }).sort((a, b) => b.impactHours - a.impactHours).slice(0, 15);

  const pathAnalysis = variants.entries().map(([pathKey, count]) => {
    const path = variantPaths.get(pathKey) || [];
    const pathDurations = variantDurations.get(pathKey) || [];
    const avg = average(pathDurations);
    const repeatedSteps = path.length - new Set(path).size;
    return {
      path,
      count,
      share: cases.size ? count / cases.size * 100 : 0,
      avgHours: avg,
      medianHours: median(pathDurations),
      p90Hours: percentile(pathDurations, 0.9),
      repeatedSteps,
      status: repeatedSteps || avg >= 168 ? "Needs attention" : avg >= 72 ? "Watch" : "Healthy",
    };
  }).sort((a, b) => b.count - a.count);

  return {
    caseCount: cases.size,
    eventCount: events.length,
    activityCount: activities.size,
    variantCount: variants.size,
    avgDurationHours: average(durations),
    medianDurationHours: median(durations),
    p90DurationHours: percentile(durations, 0.9),
    completionRate: cases.size ? completed / cases.size * 100 : 0,
    reworkRate: cases.size ? reworkCases / cases.size * 100 : 0,
    totalCost,
    activities: activities.entries().map(([name, count]) => ({ name, count })),
    resources: resources.entries().slice(0, 10).map(([name, count]) => ({ name, count })),
    transitions: transitions.entries().map(([key, count]) => {
      const [from, to] = key.split("|||");
      return { from, to, count, avgHours: average(transitionDurations.get(key) || []) };
    }),
    bottlenecks,
    pathAnalysis: pathAnalysis.slice(0, 30),
    slowestPaths: [...pathAnalysis].sort((a, b) => b.avgHours - a.avgHours).slice(0, 8),
    fastestPaths: [...pathAnalysis].sort((a, b) => a.avgHours - b.avgHours).slice(0, 8),
    reworkPaths: [...pathAnalysis].sort((a, b) => b.repeatedSteps - a.repeatedSteps || b.count - a.count).slice(0, 8),
    objects: objects.entries().slice(0, 30).map(([name, count]) => ({ name, count })),
    recommendations: recommendations(average(durations), cases.size ? reworkCases / cases.size * 100 : 0, bottlenecks),
  };
}

function recommendations(avgDuration: number, reworkRate: number, bottlenecks: Array<{ from: string; to: string; count: number; avgHours: number; severity: string; impactHours: number }>) {
  const recs = [];
  const top = bottlenecks[0];
  if (top) {
    recs.push({
      severity: top.severity,
      title: `Investigate delay from ${top.from} to ${top.to}`,
      detail: `Average wait is ${formatHours(top.avgHours)} across ${top.count} handoffs. This is the highest total time-impact transition.`,
    });
  }
  if (reworkRate > 20) {
    recs.push({
      severity: "High",
      title: "Reduce rework loops",
      detail: `${reworkRate.toFixed(1)}% of cases repeat at least one activity.`,
    });
  }
  if (avgDuration > 120) {
    recs.push({
      severity: "Medium",
      title: "Create aging alerts",
      detail: `Average case duration is ${formatHours(avgDuration)}. Add alerts for cases exceeding P90 cycle time.`,
    });
  }
  if (!recs.length) {
    recs.push({ severity: "Low", title: "Process looks stable", detail: "No severe bottleneck signal was detected." });
  }
  return recs;
}

class Counter<T> {
  private map = new Map<T, number>();
  add(key: T, amount = 1) { this.map.set(key, (this.map.get(key) || 0) + amount); }
  get size() { return this.map.size; }
  entries() { return [...this.map.entries()].sort((a, b) => b[1] - a[1]); }
}

function hoursBetween(left: string, right: string) {
  return Math.max(0, (new Date(right).getTime() - new Date(left).getTime()) / 3_600_000);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], pct: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * pct;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function waitBand(hours: number) {
  if (hours >= 168) return "Critical";
  if (hours >= 72) return "High";
  if (hours >= 24) return "Medium";
  return "Low";
}

export function formatHours(hours: number) {
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`;
  return `${hours.toFixed(1)} hrs`;
}
