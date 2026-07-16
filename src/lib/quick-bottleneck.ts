export type BottleneckMapping = {
  claim_id: string;
  event_name: string;
  comments: string;
  event_timestamp: string;
  received_date: string;
  paid_date: string;
  amount: string;
};

export type BottleneckAnalysis = {
  summary: {
    sourceRows: number;
    usableRows: number;
    uniqueBaseClaims: number;
    claimsOver30Days: number;
    over30Rate: number;
    loopingEvents: number;
    loopInstances: number;
    totalInterestAmount: number;
  };
  loopingEvents: {
    event: string;
    averageDaysBetween: number;
    totalDaysBetween: number;
    loopInstances: number;
    uniqueBaseClids: number;
  }[];
  ageBreakdown: {
    bucket: "30 days and less" | "More than 30 days";
    uniqueBaseClids: number;
    averageAgeDays: number;
    totalInterestAmount: number;
    share: number;
  }[];
  over30Events: {
    event: string;
    averageDaysBetween: number;
    totalDaysBetween: number;
    loopInstances: number;
    uniqueBaseClids: number;
    eventCount: number;
  }[];
};

const aliases: Record<keyof BottleneckMapping, string[]> = {
  claim_id: ["baseclid", "base_clid", "claim_id", "claimid", "claim_number", "clcl_claim_id", "clcl_id"],
  event_name: ["wqdf_desc", "wqdf_desc2", "wqdf_desc3", "event", "event_name", "activity", "queue", "queue_name"],
  comments: ["comments", "comment", "notes", "note", "event_comments"],
  event_timestamp: ["wmhs_route_dt2", "wmhs_route_dt", "event_timestamp", "event_date", "route_date", "activity_date", "timestamp", "datetime"],
  received_date: ["received_date", "receive_date", "claim_received_date", "min_received_date", "clcl_rcvd_dt", "received_dt"],
  paid_date: ["paid_date", "payment_date", "max_paid_date", "check_paid_date", "clck_paid_dt", "paid_dt"],
  amount: ["clck_int_amt", "interest_amount", "interest_amt", "int_amount", "int_amt"],
};

export function detectBottleneckMapping(headers: string[], rows: Record<string, unknown>[]) {
  const mapping: BottleneckMapping = { claim_id: "", event_name: "", comments: "", event_timestamp: "", received_date: "", paid_date: "", amount: "" };
  const normalized = new Map(headers.map(header => [normalize(header), header]));
  const used = new Set<string>();

  for (const key of Object.keys(mapping) as (keyof BottleneckMapping)[]) {
    const exact = aliases[key].map(alias => normalized.get(alias)).find(Boolean);
    if (exact && !used.has(exact)) {
      mapping[key] = exact;
      used.add(exact);
    }
  }

  const dateColumns = headers
    .filter(header => !used.has(header))
    .map(header => ({ header, ratio: dateRatio(rows, header) }))
    .sort((left, right) => right.ratio - left.ratio);
  if (!mapping.event_timestamp && dateColumns[0]?.ratio >= 0.6) mapping.event_timestamp = dateColumns[0].header;

  if (!mapping.claim_id) {
    mapping.claim_id = headers.find(header => /(?:claim|base).*(?:id|no|number)|(?:id|no|number).*(?:claim|base)/i.test(normalize(header))) || "";
  }
  if (!mapping.event_name) {
    mapping.event_name = headers.find(header => /event|activity|queue|wqdf|status|step/i.test(normalize(header))) || "";
  }
  if (!mapping.comments) mapping.comments = headers.find(header => /comment|note/i.test(normalize(header))) || "";
  if (!mapping.amount) mapping.amount = headers.find(header => /interest.*(?:amt|amount)|(?:amt|amount).*interest|clck_int/i.test(normalize(header))) || "";
  return mapping;
}

export function analyzeQuickBottleneck(rows: Record<string, unknown>[], mapping: BottleneckMapping): BottleneckAnalysis {
  for (const required of ["claim_id", "event_timestamp", "received_date", "paid_date"] as const) {
    if (!mapping[required]) throw new Error(`Select the ${required.replaceAll("_", " ")} column.`);
  }
  if (!mapping.event_name && !mapping.comments) throw new Error("Select WQDF_DESC, Comments, or another event-name column.");

  type RecordRow = {
    rowNumber: number;
    baseClid: string;
    event: string;
    eventTime: number | null;
    receivedTime: number | null;
    paidTime: number | null;
    amount: number | null;
  };
  const records: RecordRow[] = [];
  rows.forEach((row, index) => {
    const claimId = clean(row[mapping.claim_id]);
    if (!claimId) return;
    const eventName = clean(mapping.event_name ? row[mapping.event_name] : "") || clean(mapping.comments ? row[mapping.comments] : "") || "Unlabeled event";
    records.push({
      rowNumber: index + 1,
      baseClid: claimId.length > 2 ? claimId.slice(0, -2) : claimId,
      event: eventName,
      eventTime: parseDate(row[mapping.event_timestamp]),
      receivedTime: parseDate(row[mapping.received_date]),
      paidTime: parseDate(row[mapping.paid_date]),
      amount: mapping.amount ? parseAmount(row[mapping.amount]) : null,
    });
  });

  const claims = new Map<string, RecordRow[]>();
  for (const record of records) claims.set(record.baseClid, [...(claims.get(record.baseClid) || []), record]);
  const loopMap = new Map<string, { gaps: number[]; loops: number; claims: Set<string> }>();
  const over30EventMap = new Map<string, { gaps: number[]; loops: number; claims: Set<string>; count: number }>();
  const ageGroups = {
    short: { ages: [] as number[], claims: 0, amount: 0 },
    long: { ages: [] as number[], claims: 0, amount: 0 },
  };

  for (const [baseClid, claimRecords] of claims) {
    const receivedDates = claimRecords.map(record => record.receivedTime).filter((value): value is number => value !== null);
    const paidDates = claimRecords.map(record => record.paidTime).filter((value): value is number => value !== null);
    const minReceived = receivedDates.length ? Math.min(...receivedDates) : null;
    const maxPaid = paidDates.length ? Math.max(...paidDates) : null;
    const ageDays = minReceived !== null && maxPaid !== null ? Math.max(0, daysBetween(minReceived, maxPaid)) : null;
    const latestRecord = [...claimRecords].sort((left, right) =>
      (left.paidTime ?? left.eventTime ?? Number.NEGATIVE_INFINITY) - (right.paidTime ?? right.eventTime ?? Number.NEGATIVE_INFINITY) || left.rowNumber - right.rowNumber,
    ).at(-1)!;

    if (ageDays !== null) {
      const ageGroup = ageDays > 30 ? ageGroups.long : ageGroups.short;
      ageGroup.ages.push(ageDays);
      ageGroup.claims += 1;
      ageGroup.amount += latestRecord.amount || 0;
    }

    const byEvent = new Map<string, RecordRow[]>();
    for (const record of claimRecords) byEvent.set(record.event, [...(byEvent.get(record.event) || []), record]);
    for (const [event, eventRecords] of byEvent) {
      if (eventRecords.length < 2) continue;
      const times = eventRecords.map(record => record.eventTime).filter((value): value is number => value !== null).sort((left, right) => left - right);
      const gaps = consecutiveGaps(times);
      const aggregate = loopMap.get(event) || { gaps: [], loops: 0, claims: new Set<string>() };
      aggregate.gaps.push(...gaps);
      aggregate.loops += eventRecords.length - 1;
      aggregate.claims.add(baseClid);
      loopMap.set(event, aggregate);
    }

    if (ageDays !== null && ageDays > 30) {
      const ordered = claimRecords.filter(record => record.eventTime !== null).sort((left, right) => left.eventTime! - right.eventTime! || left.rowNumber - right.rowNumber);
      const eventCounts = new Map<string, number>();
      ordered.forEach(record => eventCounts.set(record.event, (eventCounts.get(record.event) || 0) + 1));
      ordered.forEach((record, index) => {
        const aggregate = over30EventMap.get(record.event) || { gaps: [], loops: 0, claims: new Set<string>(), count: 0 };
        if (index > 0) aggregate.gaps.push(daysBetween(ordered[index - 1].eventTime!, record.eventTime!));
        aggregate.claims.add(baseClid);
        aggregate.count += 1;
        over30EventMap.set(record.event, aggregate);
      });
      for (const [event, count] of eventCounts) {
        if (count > 1) over30EventMap.get(event)!.loops += count - 1;
      }
    }
  }

  const loopingEvents = [...loopMap.entries()].map(([event, value]) => ({
    event,
    averageDaysBetween: average(value.gaps),
    totalDaysBetween: sum(value.gaps),
    loopInstances: value.loops,
    uniqueBaseClids: value.claims.size,
  })).sort((left, right) => right.loopInstances - left.loopInstances || right.totalDaysBetween - left.totalDaysBetween);

  const agedClaimCount = ageGroups.short.claims + ageGroups.long.claims;
  const ageBreakdown: BottleneckAnalysis["ageBreakdown"] = [
    { bucket: "30 days and less", uniqueBaseClids: ageGroups.short.claims, averageAgeDays: average(ageGroups.short.ages), totalInterestAmount: ageGroups.short.amount, share: agedClaimCount ? ageGroups.short.claims / agedClaimCount * 100 : 0 },
    { bucket: "More than 30 days", uniqueBaseClids: ageGroups.long.claims, averageAgeDays: average(ageGroups.long.ages), totalInterestAmount: ageGroups.long.amount, share: agedClaimCount ? ageGroups.long.claims / agedClaimCount * 100 : 0 },
  ];
  const over30Events = [...over30EventMap.entries()].map(([event, value]) => ({
    event,
    averageDaysBetween: average(value.gaps),
    totalDaysBetween: sum(value.gaps),
    loopInstances: value.loops,
    uniqueBaseClids: value.claims.size,
    eventCount: value.count,
  })).sort((left, right) => right.totalDaysBetween - left.totalDaysBetween || right.loopInstances - left.loopInstances);

  return {
    summary: {
      sourceRows: rows.length,
      usableRows: records.length,
      uniqueBaseClaims: claims.size,
      claimsOver30Days: ageGroups.long.claims,
      over30Rate: agedClaimCount ? ageGroups.long.claims / agedClaimCount * 100 : 0,
      loopingEvents: loopingEvents.length,
      loopInstances: loopingEvents.reduce((total, event) => total + event.loopInstances, 0),
      totalInterestAmount: ageGroups.short.amount + ageGroups.long.amount,
    },
    loopingEvents,
    ageBreakdown,
    over30Events,
  };
}

function normalize(value: string) { return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function clean(value: unknown) { return String(value ?? "").trim(); }
function parseDate(value: unknown) { const text = clean(value); if (!text) return null; const parsed = new Date(text).getTime(); return Number.isNaN(parsed) ? null : parsed; }
function parseAmount(value: unknown) { const text = clean(value).replace(/[,$£€\s]/g, "").replace(/^\((.*)\)$/, "-$1"); if (!text) return null; const parsed = Number(text); return Number.isFinite(parsed) ? parsed : null; }
function daysBetween(left: number, right: number) { return Math.max(0, (right - left) / 86_400_000); }
function consecutiveGaps(times: number[]) { return times.slice(1).map((time, index) => daysBetween(times[index], time)); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0; }
function dateRatio(rows: Record<string, unknown>[], header: string) { const values = rows.slice(0, 200).map(row => row[header]).filter(value => clean(value)); return values.length ? values.filter(value => parseDate(value) !== null).length / values.length : 0; }
