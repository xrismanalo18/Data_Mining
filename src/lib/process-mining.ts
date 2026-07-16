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

export type ClaimCaseInsight = {
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
  caseInsights: ClaimCaseInsight[];
  methodology: string[];
};

export type CorrelationAnalysis = {
  observationCount: number;
  variables: {
    name: string;
    type: "numeric" | "categorical";
    coverage: number;
    distinctCount: number;
    source: "process" | "uploaded";
  }[];
  relationships: {
    source: string;
    target: string;
    coefficient: number;
    strength: number;
    direction: "positive" | "negative" | "association";
    method: "Pearson r" | "Correlation ratio" | "Cramer's V";
    sampleSize: number;
  }[];
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

type ColumnStats = {
  nonEmptyRatio: number;
  uniqueCount: number;
  uniqueRatio: number;
  textRatio: number;
  numericRatio: number;
  dateRatio: number;
};

const headerHints: Record<"case_id" | "activity" | "timestamp" | "resource" | "cost", string[]> = {
  case_id: ["case", "claim", "order", "invoice", "ticket", "document", "instance", "trace", "process", "request", "record", "reference", "id", "key", "number", "no"],
  activity: ["activity", "event", "task", "step", "stage", "status", "queue", "action", "operation", "transition", "description", "desc", "name", "type"],
  timestamp: ["timestamp", "datetime", "date", "time", "created", "updated", "occurred", "completed", "started", "ended"],
  resource: ["resource", "user", "owner", "agent", "employee", "assignee", "handler", "operator", "role", "team"],
  cost: ["cost", "amount", "value", "expense", "price", "charge", "payment", "paid", "total"],
};

export function detectMapping(headers: string[], rows: Record<string, unknown>[] = []) {
  const mapping: Mapping = { case_id: "", activity: "", timestamp: "" };
  const stats = new Map(headers.map(header => [header, getColumnStats(rows, header)]));
  const used = new Set<string>();

  // Dates are the most reliably inferred from values, followed by identifiers
  // and categorical activities. Reserving in this order prevents one generic
  // column (for example "Event ID") from filling multiple required roles.
  for (const canonical of ["timestamp", "case_id", "activity", "resource", "cost"] as const) {
    const ranked = headers
      .filter(header => !used.has(header))
      .map(header => ({ header, score: scoreColumn(canonical, header, stats.get(header)!) }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (best && best.score >= minimumScore(canonical, rows.length)) {
      mapping[canonical] = best.header;
      used.add(best.header);
    }
  }

  // Preserve known object IDs independently from the core event mapping.
  for (const header of headers) {
    const key = normalize(header);
    if (commonObjects.includes(key) || key.endsWith("_id")) {
      mapping[key] = header;
    }
  }
  return mapping;
}

function normalize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getColumnStats(rows: Record<string, unknown>[], header: string): ColumnStats {
  const sample = rows.slice(0, 500).map(row => row[header]);
  if (!sample.length) {
    return { nonEmptyRatio: 0, uniqueCount: 0, uniqueRatio: 0, textRatio: 0, numericRatio: 0, dateRatio: 0 };
  }

  const values = sample.filter(value => value !== null && value !== undefined && String(value).trim() !== "");
  const unique = new Set(values.map(value => String(value).trim().toLowerCase()));
  const numeric = values.filter(isNumericLike).length;
  const dates = values.filter(isDateLike).length;
  const text = values.filter(value => !isNumericLike(value) && !isDateLike(value)).length;
  const divisor = Math.max(values.length, 1);
  return {
    nonEmptyRatio: values.length / sample.length,
    uniqueCount: unique.size,
    uniqueRatio: unique.size / divisor,
    textRatio: text / divisor,
    numericRatio: numeric / divisor,
    dateRatio: dates / divisor,
  };
}

function isNumericLike(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value).trim().replace(/[,$£€%\s]/g, "");
  return text !== "" && /^[-+]?\d+(?:\.\d+)?$/.test(text);
}

function isDateLike(value: unknown) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const text = String(value).trim();
  if (!text || !(/[T:/-]/.test(text) || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text))) return false;
  return !Number.isNaN(Date.parse(text));
}

function scoreColumn(canonical: keyof typeof headerHints, header: string, stats: ColumnStats) {
  const key = normalize(header);
  const tokens = new Set(key.split("_").filter(Boolean));
  const candidates = aliases[canonical] || [];
  let score = 0;

  if (candidates.some(candidate => normalize(candidate) === key)) score += 140;
  else if (candidates.some(candidate => {
    const alias = normalize(candidate);
    return alias.length >= 4 && (key.includes(alias) || alias.includes(key));
  })) score += 65;

  const hintMatches = headerHints[canonical].filter(hint => tokens.has(hint) || key.includes(hint)).length;
  score += Math.min(hintMatches, 3) * 24;
  score += stats.nonEmptyRatio * 15;

  if (canonical === "timestamp") {
    score += stats.dateRatio * 120;
    if (stats.dateRatio < 0.35 && stats.uniqueCount) score -= 45;
  } else if (canonical === "case_id") {
    if (stats.uniqueCount >= 2) score += 15;
    score += Math.min(stats.uniqueRatio, 0.95) * 25;
    if (key.endsWith("_id") || tokens.has("id") || tokens.has("number")) score += 30;
    score -= stats.dateRatio * 80;
  } else if (canonical === "activity") {
    const categorical = stats.uniqueCount >= 2 && stats.uniqueRatio <= 0.75;
    if (categorical) score += 50;
    score += stats.textRatio * 30;
    score -= stats.dateRatio * 110;
    if (stats.uniqueRatio > 0.95) score -= 30;
  } else if (canonical === "resource") {
    if (stats.uniqueCount >= 2 && stats.uniqueRatio <= 0.8) score += 25;
    score += stats.textRatio * 20;
    score -= stats.dateRatio * 80;
  } else if (canonical === "cost") {
    score += stats.numericRatio * 90;
    score -= stats.dateRatio * 100;
  }
  return score;
}

function minimumScore(canonical: keyof typeof headerHints, rowCount: number) {
  if (!rowCount) return 60;
  if (canonical === "timestamp") return 65;
  if (canonical === "activity") return 55;
  if (canonical === "case_id") return 45;
  return 70;
}

export function resolveMapping(rows: Record<string, unknown>[], supplied: Mapping) {
  const headers = Array.from(new Set(rows.slice(0, 50).flatMap(row => Object.keys(row))));
  const detected = detectMapping(headers, rows);
  const resolved: Mapping = { ...detected };

  for (const [key, value] of Object.entries(supplied)) {
    if (value && headers.includes(value)) resolved[key] = value;
  }
  return resolved;
}

export function parseCost(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rowsToEvents(rows: Record<string, unknown>[], mapping: Mapping) {
  mapping = resolveMapping(rows, mapping);
  for (const required of ["case_id", "activity", "timestamp"] as const) {
    if (!mapping[required]) {
      throw new Error(
        `Unable to identify a ${required.replace("_", " ")} column automatically. Choose it from the uploaded file's columns.`,
      );
    }
  }

  const objectKeys = Object.entries(mapping)
    .filter(([key, value]) => key.endsWith("_id") && value)
    .map(([key, value]) => [key, value as string] as const);

  const taskMiningAttrs = ["event_type", "window_title", "keystrokes", "mouse_clicks", "duration_seconds"];
  const headerLookup = new Map<string, string>();
  if (rows.length) {
    for (const header of Object.keys(rows[0])) headerLookup.set(normalize(header), header);
  }
  const extraKeys = taskMiningAttrs
    .map(key => [key, headerLookup.get(key)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const mappedColumns = new Set(Object.values(mapping).filter((value): value is string => Boolean(value)));
  const attributeColumns = rows.length
    ? Object.keys(rows[0]).filter(header => !mappedColumns.has(header))
    : [];

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
    for (const [key, column] of extraKeys) {
      const value = String(row[column] ?? "").trim();
      if (value) attrs[key] = value;
    }
    for (const column of attributeColumns) {
      const value = String(row[column] ?? "").trim();
      if (value) attrs[column] = value.slice(0, 1_000);
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
        if (key === "process_id") continue;
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

  const claims = analyzeClaims(cases, durations);
  const taskMining = analyzeTaskMining(cases, events);
  const correlations = analyzeCorrelations(cases, events);
  const touchpointGroups = analyzeTouchpointGroups(cases);

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
      return {
        from,
        to,
        count,
        caseCount: transitionCases.get(key)?.size || 0,
        avgHours: average(transitionDurations.get(key) || []),
      };
    }),
    bottlenecks,
    pathAnalysis: pathAnalysis.slice(0, 100),
    slowestPaths: [...pathAnalysis].sort((a, b) => b.avgHours - a.avgHours).slice(0, 8),
    fastestPaths: [...pathAnalysis].sort((a, b) => a.avgHours - b.avgHours).slice(0, 8),
    reworkPaths: [...pathAnalysis].sort((a, b) => b.repeatedSteps - a.repeatedSteps || b.count - a.count).slice(0, 8),
    objects: objects.entries().slice(0, 30).map(([name, count]) => ({ name, count })),
    recommendations: recommendations(average(durations), cases.size ? reworkCases / cases.size * 100 : 0, bottlenecks),
    claims,
    taskMining,
    correlations,
    touchpointGroups,
  };
}

function analyzeTouchpointGroups(cases: Map<string, EventRow[]>) {
  type TransitionAccumulator = { count: number; caseCount: number; totalHours: number };
  type GroupAccumulator = {
    caseCount: number;
    eventCount: number;
    wasteHours: number;
    activities: Map<string, number>;
    transitions: Map<string, TransitionAccumulator>;
  };
  const groups = new Map<number, GroupAccumulator>();

  for (const list of cases.values()) {
    const touchpoints = list.length;
    const group = groups.get(touchpoints) || {
      caseCount: 0,
      eventCount: 0,
      wasteHours: 0,
      activities: new Map<string, number>(),
      transitions: new Map<string, TransitionAccumulator>(),
    };
    group.caseCount += 1;
    group.eventCount += list.length;
    for (const event of list) group.activities.set(event.activity, (group.activities.get(event.activity) || 0) + 1);

    const transitionsInCase = new Set<string>();
    for (let index = 0; index < list.length - 1; index += 1) {
      const left = list[index];
      const right = list[index + 1];
      const key = `${left.activity}|||${right.activity}`;
      const transition = group.transitions.get(key) || { count: 0, caseCount: 0, totalHours: 0 };
      const waitHours = hoursBetween(left.timestamp, right.timestamp);
      transition.count += 1;
      transition.totalHours += waitHours;
      group.wasteHours += waitHours;
      if (!transitionsInCase.has(key)) {
        transition.caseCount += 1;
        transitionsInCase.add(key);
      }
      group.transitions.set(key, transition);
    }
    groups.set(touchpoints, group);
  }

  return [...groups.entries()].map(([touchpoints, group]) => ({
    touchpoints,
    caseCount: group.caseCount,
    eventCount: group.eventCount,
    wasteHours: group.wasteHours,
    share: cases.size ? group.caseCount / cases.size * 100 : 0,
    activities: [...group.activities.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count),
    transitions: [...group.transitions.entries()]
      .map(([key, value]) => {
        const [from, to] = key.split("|||");
        return {
          from,
          to,
          count: value.count,
          caseCount: value.caseCount,
          avgHours: value.count ? value.totalHours / value.count : 0,
        };
      })
      .sort((left, right) => right.caseCount - left.caseCount || right.count - left.count),
  })).sort((left, right) => left.touchpoints - right.touchpoints);
}

type CorrelationValue = string | number | null;

function analyzeCorrelations(cases: Map<string, EventRow[]>, events: EventRow[]): CorrelationAnalysis {
  const processVariables = new Set([
    "Cycle time (hours)",
    "Case event count",
    "Step position",
    "Wait time (hours)",
    "Rework count",
    "Unique activities",
    "Activity",
    "Resource",
    "Cost",
  ]);
  const observations: Record<string, CorrelationValue>[] = [];

  for (const list of cases.values()) {
    const cycleTime = list.length > 1 ? hoursBetween(list[0].timestamp, list[list.length - 1].timestamp) : 0;
    const activities = list.map(event => event.activity);
    const reworkCount = activities.length - new Set(activities).size;
    for (let index = 0; index < list.length; index += 1) {
      const event = list[index];
      const row: Record<string, CorrelationValue> = {
        "Cycle time (hours)": cycleTime,
        "Case event count": list.length,
        "Step position": index + 1,
        "Wait time (hours)": index ? hoursBetween(list[index - 1].timestamp, event.timestamp) : 0,
        "Rework count": reworkCount,
        "Unique activities": new Set(activities).size,
        Activity: event.activity,
      };
      if (event.resource) row.Resource = event.resource;
      if (event.cost !== null) row.Cost = event.cost;
      for (const [key, value] of Object.entries(event.attrs)) {
        const label = Object.prototype.hasOwnProperty.call(row, key) ? `Uploaded: ${key}` : key;
        row[label] = value;
      }
      observations.push(row);
    }
  }

  const keys = Array.from(new Set(observations.flatMap(row => Object.keys(row))));
  const variables = keys.map((name): CorrelationAnalysis["variables"][number] | null => {
    const rawValues = observations.map(row => row[name]).filter(isPresent);
    if (rawValues.length < Math.min(5, observations.length)) return null;
    const numericValues = rawValues.map(toCorrelationNumber).filter((value): value is number => value !== null);
    const numericRatio = numericValues.length / rawValues.length;
    const distinct = new Set(rawValues.map(value => String(value).trim().toLowerCase()));
    const coverage = rawValues.length / Math.max(observations.length, 1);
    const idLike = /(?:^|[ _-])(?:id|number|no|key|reference)(?:$|[ _-])/i.test(name);

    if (numericRatio >= 0.8 && new Set(numericValues).size >= 2) {
      return { name, type: "numeric", coverage, distinctCount: new Set(numericValues).size, source: processVariables.has(name) ? "process" : "uploaded" };
    }
    if (distinct.size >= 2 && distinct.size <= 50 && !(idLike && distinct.size / rawValues.length > 0.7)) {
      return { name, type: "categorical", coverage, distinctCount: distinct.size, source: processVariables.has(name) ? "process" : "uploaded" };
    }
    return null;
  }).filter((variable): variable is CorrelationAnalysis["variables"][number] => variable !== null).sort((left, right) => {
    const leftPriority = left.source === "process" ? 2 : left.type === "numeric" ? 1 : 0;
    const rightPriority = right.source === "process" ? 2 : right.type === "numeric" ? 1 : 0;
    return rightPriority - leftPriority || right.coverage - left.coverage || left.distinctCount - right.distinctCount;
  }).slice(0, 28);

  const relationships: CorrelationAnalysis["relationships"] = [];
  for (let leftIndex = 0; leftIndex < variables.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < variables.length; rightIndex += 1) {
      const left = variables[leftIndex];
      const right = variables[rightIndex];
      const pairs = observations
        .map(row => [row[left.name], row[right.name]] as const)
        .filter(([leftValue, rightValue]) => isPresent(leftValue) && isPresent(rightValue));
      if (pairs.length < 5) continue;

      let coefficient = 0;
      let method: CorrelationAnalysis["relationships"][number]["method"];
      let direction: CorrelationAnalysis["relationships"][number]["direction"] = "association";
      if (left.type === "numeric" && right.type === "numeric") {
        const numericPairs = pairs
          .map(([a, b]) => [toCorrelationNumber(a), toCorrelationNumber(b)] as const)
          .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null);
        coefficient = pearson(numericPairs.map(pair => pair[0]), numericPairs.map(pair => pair[1]));
        method = "Pearson r";
        direction = coefficient < 0 ? "negative" : "positive";
      } else if (left.type === "categorical" && right.type === "categorical") {
        coefficient = cramersV(pairs.map(pair => String(pair[0])), pairs.map(pair => String(pair[1])));
        method = "Cramer's V";
      } else {
        const categoricalFirst = left.type === "categorical";
        const mixedPairs = pairs
          .map(pair => ({ category: String(pair[categoricalFirst ? 0 : 1]), value: toCorrelationNumber(pair[categoricalFirst ? 1 : 0]) }))
          .filter((pair): pair is { category: string; value: number } => pair.value !== null);
        coefficient = correlationRatio(mixedPairs.map(pair => pair.category), mixedPairs.map(pair => pair.value));
        method = "Correlation ratio";
      }
      const strength = Math.abs(coefficient);
      if (Number.isFinite(strength) && strength >= 0.08) {
        relationships.push({
          source: left.name,
          target: right.name,
          coefficient,
          strength,
          direction,
          method,
          sampleSize: pairs.length,
        });
      }
    }
  }

  relationships.sort((left, right) => right.strength - left.strength || right.sampleSize - left.sampleSize);
  return { observationCount: events.length, variables, relationships: relationships.slice(0, 100) };
}

function isPresent(value: CorrelationValue | undefined): value is string | number {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function toCorrelationNumber(value: CorrelationValue | undefined) {
  if (!isPresent(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const negative = /^\(.*\)$/.test(value.trim());
  const cleaned = value.trim().replace(/[,$£€%\s()]/g, "");
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned) * (negative ? -1 : 1);
  return Number.isFinite(parsed) ? parsed : null;
}

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator ? numerator / denominator : 0;
}

function correlationRatio(categories: string[], values: number[]) {
  if (categories.length !== values.length || values.length < 2) return 0;
  const overall = average(values);
  const groups = new Map<string, number[]>();
  categories.forEach((category, index) => groups.set(category, [...(groups.get(category) || []), values[index]]));
  const between = [...groups.values()].reduce((sum, group) => sum + group.length * (average(group) - overall) ** 2, 0);
  const total = values.reduce((sum, value) => sum + (value - overall) ** 2, 0);
  return total ? Math.sqrt(between / total) : 0;
}

function cramersV(left: string[], right: string[]) {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftLevels = [...new Set(left)];
  const rightLevels = [...new Set(right)];
  if (leftLevels.length < 2 || rightLevels.length < 2) return 0;
  const rows = new Map(leftLevels.map((value, index) => [value, index]));
  const columns = new Map(rightLevels.map((value, index) => [value, index]));
  const table = Array.from({ length: leftLevels.length }, () => Array(rightLevels.length).fill(0));
  left.forEach((value, index) => { table[rows.get(value)!][columns.get(right[index])!] += 1; });
  const rowTotals = table.map(row => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = rightLevels.map((_, column) => table.reduce((sum, row) => sum + row[column], 0));
  let chiSquared = 0;
  for (let row = 0; row < table.length; row += 1) for (let column = 0; column < table[row].length; column += 1) {
    const expected = rowTotals[row] * columnTotals[column] / left.length;
    if (expected) chiSquared += (table[row][column] - expected) ** 2 / expected;
  }
  const denominator = left.length * Math.min(leftLevels.length - 1, rightLevels.length - 1);
  return denominator ? Math.sqrt(chiSquared / denominator) : 0;
}

function analyzeTaskMining(cases: Map<string, EventRow[]>, events: EventRow[]) {
  const tagged = events.filter(event => event.attrs.event_type);
  if (!tagged.length || tagged.length < events.length * 0.5) return null;
  const steps = new Map<string, { events: number; keystrokes: number; mouseClicks: number; totalDurationSeconds: number }>();
  const totals = { keystrokes: 0, mouseClicks: 0, durationSeconds: 0 };
  for (const event of tagged) {
    const keystrokes = Number(event.attrs.keystrokes) || 0;
    const mouseClicks = Number(event.attrs.mouse_clicks) || 0;
    const duration = Number(event.attrs.duration_seconds) || 0;
    totals.keystrokes += keystrokes;
    totals.mouseClicks += mouseClicks;
    totals.durationSeconds += duration;
    const step = steps.get(event.activity) || { events: 0, keystrokes: 0, mouseClicks: 0, totalDurationSeconds: 0 };
    step.events += 1;
    step.keystrokes += keystrokes;
    step.mouseClicks += mouseClicks;
    step.totalDurationSeconds += duration;
    steps.set(event.activity, step);
  }
  return {
    sessionCount: cases.size,
    totals,
    steps: [...steps.entries()]
      .map(([name, step]) => ({
        name,
        ...step,
        avgDurationSeconds: step.events ? step.totalDurationSeconds / step.events : 0,
      }))
      .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds),
  };
}

function analyzeClaims(cases: Map<string, EventRow[]>, durations: number[]): ClaimsAnalysis {
  const manualPattern = /manual|review|investigat|pend|exception|adjust|adjudicat|appeal|audit|correct|validate|verify|approval/i;
  const terminalPattern = /complete|payment|closed|paid|settled|approved|denied|reject/i;
  const routePattern = /reassign|transfer|reroute|handoff/i;
  const durationReference = Math.max(percentile(durations, 0.9), average(durations), 1);
  const routeCounter = new Map<string, { count: number; delays: number[] }>();
  const ownerStats = new Map<string, { events: number; claims: Set<string>; reassignedIn: number; reassignedOut: number }>();
  const driverTotals = { duration: 0, manual: 0, reassignment: 0, rework: 0, incomplete: 0 };
  const insights: ClaimCaseInsight[] = [];
  let completedClaims = 0;
  let exceptionClaims = 0;
  let stpClaims = 0;
  let manualClaims = 0;
  let reassignedClaims = 0;
  let totalReassignments = 0;
  let casesWithCost = 0;
  let currentCostExposure = 0;

  for (const [caseId, list] of cases) {
    const path = list.map(event => event.activity);
    const straightPath = path.filter((activity, index) => path.indexOf(activity) === index);
    const durationHours = list.length > 1 ? hoursBetween(list[0].timestamp, list[list.length - 1].timestamp) : 0;
    const repeatedSteps = path.length - new Set(path).size;
    const manualTouches = path.filter(activity => manualPattern.test(activity)).length;
    const completed = path.some(activity => terminalPattern.test(activity));
    const explicitRoutes = path.filter(activity => routePattern.test(activity)).length;
    let resourceChanges = 0;
    let previousOwner = "";

    for (const event of list) {
      const owner = event.resource?.trim() || "";
      if (!owner) continue;
      const stats = ownerStats.get(owner) || { events: 0, claims: new Set<string>(), reassignedIn: 0, reassignedOut: 0 };
      stats.events += 1;
      stats.claims.add(caseId);
      ownerStats.set(owner, stats);

      if (previousOwner && previousOwner !== owner) {
        resourceChanges += 1;
        const key = `${previousOwner}|||${owner}`;
        const route = routeCounter.get(key) || { count: 0, delays: [] };
        route.count += 1;
        route.delays.push(hoursBetween(list[Math.max(0, list.indexOf(event) - 1)].timestamp, event.timestamp));
        routeCounter.set(key, route);
        const fromStats = ownerStats.get(previousOwner);
        if (fromStats) fromStats.reassignedOut += 1;
        stats.reassignedIn += 1;
      }
      previousOwner = owner;
    }

    const reassignments = Math.max(resourceChanges, explicitRoutes);
    const manual = manualTouches > 0;
    const stp = completed && !manual && reassignments === 0 && repeatedSteps === 0;
    const exception = manual || reassignments > 0 || repeatedSteps > 0 || durationHours >= durationReference;
    const durationPoints = Math.min(35, durationHours / durationReference * 35);
    const manualPoints = manual ? Math.min(20, 8 + manualTouches * 4) : 0;
    const reassignmentPoints = Math.min(20, reassignments * 8);
    const reworkPoints = Math.min(15, repeatedSteps * 5);
    const incompletePoints = completed ? 0 : 10;
    const lpi = durationPoints + manualPoints + reassignmentPoints + reworkPoints + incompletePoints;
    const costValues = list.map(event => event.cost).filter((cost): cost is number => cost !== null && Number.isFinite(cost));
    const hasCostData = costValues.length > 0;
    const caseCost = Math.max(...costValues, 0);
    const reductionPoints =
      durationPoints * 0.3 +
      manualPoints * 0.25 +
      reassignmentPoints * 0.5 +
      reworkPoints * 0.4 +
      incompletePoints * 0.15;
    const savingsRate = lpi ? Math.min(1, reductionPoints / lpi) * 100 : 0;
    const estimatedSavings = hasCostData ? caseCost * savingsRate / 100 : 0;
    const loopSavings = hasCostData && lpi ? caseCost * (reworkPoints * 0.4 / lpi) : 0;
    const loops: ClaimCaseInsight["loops"] = [];
    const steps: ClaimCaseInsight["steps"] = list.map((event, index) => {
      const loopBackIndex = path.slice(0, index).lastIndexOf(event.activity);
      const isLoop = loopBackIndex >= 0;
      const waitHours = index ? hoursBetween(list[index - 1].timestamp, event.timestamp) : 0;
      if (isLoop) {
        const wasteHours = hoursBetween(list[loopBackIndex].timestamp, event.timestamp);
        loops.push({
          activity: event.activity,
          fromIndex: index,
          toIndex: loopBackIndex,
          wasteHours,
          lpiPoints: Math.min(15, 5 + wasteHours / durationReference * 10),
        });
      }
      return {
        activity: event.activity,
        timestamp: event.timestamp,
        owner: event.resource?.trim() || "Unassigned",
        waitHours,
        isLoop,
        loopBackIndex: isLoop ? loopBackIndex : null,
      };
    });
    const loopWasteHours = Math.min(durationHours, loops.reduce((sum, loop) => sum + loop.wasteHours, 0));

    driverTotals.duration += durationPoints;
    driverTotals.manual += manualPoints;
    driverTotals.reassignment += reassignmentPoints;
    driverTotals.rework += reworkPoints;
    driverTotals.incomplete += incompletePoints;
    if (completed) completedClaims += 1;
    if (exception) exceptionClaims += 1;
    if (stp) stpClaims += 1;
    if (manual) manualClaims += 1;
    if (reassignments > 0) reassignedClaims += 1;
    totalReassignments += reassignments;
    if (hasCostData) {
      casesWithCost += 1;
      currentCostExposure += caseCost;
    }

    insights.push({
      caseId,
      status: stp ? "Straight-through" : exception ? "Exception" : completed ? "Standard" : "Open",
      durationHours,
      eventCount: list.length,
      manualTouches,
      reassignments,
      repeatedSteps,
      currentOwner: [...list].reverse().find(event => event.resource?.trim())?.resource || "Unassigned",
      stp,
      exception,
      lpi,
      caseCost,
      hasCostData,
      estimatedSavings,
      savingsRate,
      loopSavings,
      path,
      straightPath,
      loopWasteHours,
      loopLpiPoints: reworkPoints,
      steps,
      loops,
    });
  }

  const caseCount = Math.max(cases.size, 1);
  const avgDriver = {
    duration: driverTotals.duration / caseCount,
    manual: driverTotals.manual / caseCount,
    reassignment: driverTotals.reassignment / caseCount,
    rework: driverTotals.rework / caseCount,
    incomplete: driverTotals.incomplete / caseCount,
  };
  const reductionRates = { duration: 0.3, manual: 0.25, reassignment: 0.5, rework: 0.4, incomplete: 0.15 };
  const currentLpi = Object.values(avgDriver).reduce((sum, value) => sum + value, 0);
  const lpiReduction =
    avgDriver.duration * reductionRates.duration +
    avgDriver.manual * reductionRates.manual +
    avgDriver.reassignment * reductionRates.reassignment +
    avgDriver.rework * reductionRates.rework +
    avgDriver.incomplete * reductionRates.incomplete;
  const projectedLpi = Math.max(0, currentLpi - lpiReduction);
  const hasCostData = casesWithCost > 0;
  const savingsRate = currentLpi ? lpiReduction / currentLpi * 100 : 0;
  const estimatedSavings = hasCostData ? currentCostExposure * savingsRate / 100 : 0;
  const projectedCost = Math.max(0, currentCostExposure - estimatedSavings);
  const stpDurations = insights.filter(item => item.stp).map(item => item.durationHours);
  const manualDurations = insights.filter(item => !item.stp).map(item => item.durationHours);
  const blockerRows = [
    { name: "Manual review", claims: manualClaims, detail: "Claim path includes review, validation, investigation, adjustment, or another manual-control activity." },
    { name: "Case reassignment", claims: reassignedClaims, detail: "Ownership changed or the path contains an assignment, routing, transfer, or handoff activity." },
    { name: "Rework loop", claims: insights.filter(item => item.repeatedSteps > 0).length, detail: "One or more activities repeat within the same claim." },
    { name: "Extended cycle time", claims: insights.filter(item => item.durationHours >= durationReference).length, detail: `Claim duration is at or above the observed P90 reference of ${formatHours(durationReference)}.` },
  ].filter(item => item.claims > 0);

  const lpiDrivers = [
    { name: "Cycle-time exposure", currentPoints: avgDriver.duration, reductionPoints: avgDriver.duration * reductionRates.duration, detail: "30% cycle-time improvement scenario applied to mapped cost exposure." },
    { name: "Manual intervention", currentPoints: avgDriver.manual, reductionPoints: avgDriver.manual * reductionRates.manual, detail: "25% manual-effort improvement scenario through higher straight-through processing." },
    { name: "Case reassignment", currentPoints: avgDriver.reassignment, reductionPoints: avgDriver.reassignment * reductionRates.reassignment, detail: "50% reassignment improvement scenario through ownership and routing controls." },
    { name: "Rework loops", currentPoints: avgDriver.rework, reductionPoints: avgDriver.rework * reductionRates.rework, detail: "40% rework improvement scenario through first-time-right handling." },
    { name: "Incomplete outcomes", currentPoints: avgDriver.incomplete, reductionPoints: avgDriver.incomplete * reductionRates.incomplete, detail: "15% completion improvement scenario for claims without a detected terminal event." },
  ].map(driver => ({
    ...driver,
    savingsAmount: hasCostData && lpiReduction ? estimatedSavings * driver.reductionPoints / lpiReduction : 0,
    savingsRate: currentLpi ? driver.reductionPoints / currentLpi * 100 : 0,
  })).sort((a, b) => b.reductionPoints - a.reductionPoints);

  return {
    completedClaims,
    exceptionClaims,
    exceptionRate: exceptionClaims / caseCount * 100,
    stpClaims,
    stpRate: stpClaims / caseCount * 100,
    manualClaims,
    manualTouchRate: manualClaims / caseCount * 100,
    reassignedClaims,
    reassignmentRate: reassignedClaims / caseCount * 100,
    totalReassignments,
    avgStpHours: average(stpDurations),
    avgManualHours: average(manualDurations),
    cycleTimeReductionHours: Math.max(0, average(manualDurations) - average(stpDurations)),
    currentLpi,
    projectedLpi,
    lpiReduction,
    lpiReductionRate: currentLpi ? lpiReduction / currentLpi * 100 : 0,
    hasCostData,
    costCoverageRate: casesWithCost / caseCount * 100,
    currentCostExposure,
    projectedCost,
    estimatedSavings,
    savingsRate,
    lpiDrivers,
    stpBlockers: blockerRows.map(item => ({ ...item, share: item.claims / caseCount * 100 })),
    reassignmentRoutes: [...routeCounter.entries()]
      .map(([key, value]) => {
        const [from, to] = key.split("|||");
        return { from, to, count: value.count, avgDelayHours: average(value.delays) };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    ownerWorkload: [...ownerStats.entries()]
      .map(([owner, value]) => ({
        owner,
        events: value.events,
        claims: value.claims.size,
        reassignedIn: value.reassignedIn,
        reassignedOut: value.reassignedOut,
      }))
      .sort((a, b) => b.claims - a.claims)
      .slice(0, 25),
    caseInsights: insights.sort((a, b) => b.estimatedSavings - a.estimatedSavings || b.lpi - a.lpi).slice(0, 250),
    methodology: [
      "Straight-through claims have a detected terminal outcome with no manual-control activity, reassignment, or repeated step.",
      "Reassignment uses resource changes when owners are mapped, plus explicit assignment, route, transfer, and handoff activities.",
      "Savings use the mapped cost field only. Datasets without usable cost values do not receive an invented dollar estimate.",
      "Cost exposure uses the highest mapped cost value per claim to avoid multiplying a claim amount repeated across event rows.",
      "The savings percentage is the internal process-improvement ratio applied to mapped cost exposure; dollar savings are an operational estimate, not booked financial results.",
    ],
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
