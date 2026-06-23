import modelArtifact from "@/data/deal-health-model.json";

type ContractRow = Record<string, unknown>;
type CompactTree = {
  left: number[];
  right: number[];
  splitIndices: number[];
  splitConditions: number[];
  defaultLeft: number[];
  baseWeights: number[];
};
type DealHealthModel = {
  target: string;
  baseScore: number;
  numericColumns: string[];
  numericMedians: Record<string, number>;
  categoricalColumns: string[];
  categoricalFallbacks: Record<string, string>;
  categoricalValues: Record<string, string[]>;
  featureNames: string[];
  trees: CompactTree[];
  featureImportances: { feature: string; gain: number }[];
  metrics: {
    dataset: {
      rows: number;
      featuresBeforeEncoding: number;
      trainingRows: number;
      testingRows: number;
      testSize: number;
      randomState: number;
    };
    model: { mae: number; rmse: number; r2: number };
    baseline: { mae: number; rmse: number; r2: number };
    maeImprovementPct: number;
    crossValidation: {
      folds: number;
      bestMeanMae: number;
      bestParameters: Record<string, number>;
    };
  };
};

const model = modelArtifact as DealHealthModel;

function valueIsMissing(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function numericValue(value: unknown, fallback: number) {
  if (valueIsMissing(value)) return fallback;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateParts(value: unknown) {
  if (valueIsMissing(value)) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    quarter: Math.floor(date.getUTCMonth() / 3) + 1,
    dayOfYear: Math.floor((current - start) / 86_400_000),
    time: current,
  };
}

function withDateFeatures(row: ContractRow) {
  const result = { ...row };
  const effective = dateParts(row.Effective_Date);
  const end = dateParts(row.Contract_End_Date);
  for (const [prefix, parts] of [
    ["Effective_Date", effective],
    ["Contract_End_Date", end],
  ] as const) {
    if (!parts) continue;
    result[`${prefix}_Year`] = parts.year;
    result[`${prefix}_Month`] = parts.month;
    result[`${prefix}_Quarter`] = parts.quarter;
    result[`${prefix}_DayOfYear`] = parts.dayOfYear;
  }
  if (effective && end) {
    result.Calculated_Contract_Duration_Days = Math.round(
      (end.time - effective.time) / 86_400_000,
    );
  }
  delete result.Effective_Date;
  delete result.Contract_End_Date;
  return result;
}

function vectorize(rawRow: ContractRow) {
  const row = withDateFeatures(rawRow);
  const vector: number[] = [];
  for (const column of model.numericColumns) {
    vector.push(numericValue(row[column], model.numericMedians[column]));
  }
  for (const column of model.categoricalColumns) {
    const value = valueIsMissing(row[column])
      ? model.categoricalFallbacks[column]
      : String(row[column]);
    for (const category of model.categoricalValues[column]) {
      vector.push(value === category ? 1 : 0);
    }
  }
  return vector;
}

function scoreVector(vector: number[]) {
  let score = model.baseScore;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.left[node] !== -1) {
      const featureValue = vector[tree.splitIndices[node]];
      if (Number.isNaN(featureValue)) {
        node = tree.defaultLeft[node] ? tree.left[node] : tree.right[node];
      } else {
        node = featureValue < tree.splitConditions[node]
          ? tree.left[node]
          : tree.right[node];
      }
    }
    score += tree.splitConditions[node];
  }
  return Math.max(0, Math.min(100, score));
}

export function healthBand(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Healthy";
  if (score >= 60) return "Watch List";
  if (score >= 40) return "At Risk";
  return "Critical";
}

export function riskFlag(score: number) {
  if (score >= 75) return "Low";
  if (score >= 60) return "Medium";
  if (score >= 40) return "High";
  return "Critical";
}

export function predictDealHealth(row: ContractRow) {
  const predictedScore = scoreVector(vectorize(row));
  return {
    contractId: String(row.Contract_ID || "Unidentified contract"),
    clientName: String(row.Client_Name || "Unknown client"),
    predictedScore,
    band: healthBand(predictedScore),
    risk: riskFlag(predictedScore),
    actualScore: valueIsMissing(row[model.target])
      ? null
      : numericValue(row[model.target], Number.NaN),
  };
}

export function summarizeDealHealth(rows: ContractRow[]) {
  const predictions = rows.map(predictDealHealth);
  const averageScore = predictions.length
    ? predictions.reduce((total, item) => total + item.predictedScore, 0) / predictions.length
    : 0;
  const bandCounts = predictions.reduce<Record<string, number>>((counts, item) => {
    counts[item.band] = (counts[item.band] || 0) + 1;
    return counts;
  }, {});
  const actualPairs = predictions.filter(
    (item): item is typeof item & { actualScore: number } =>
      item.actualScore !== null && Number.isFinite(item.actualScore),
  );
  const uploadedMae = actualPairs.length
    ? actualPairs.reduce(
        (total, item) => total + Math.abs(item.actualScore - item.predictedScore),
        0,
      ) / actualPairs.length
    : null;

  return {
    rowCount: rows.length,
    averageScore,
    band: healthBand(averageScore),
    risk: riskFlag(averageScore),
    bandCounts,
    uploadedMae,
    modelMetrics: model.metrics,
    topDrivers: model.featureImportances.slice(0, 8).map(item => ({
      feature: readableFeatureName(item.feature),
      gain: item.gain,
    })),
    contracts: [...predictions]
      .sort((left, right) => left.predictedScore - right.predictedScore)
      .slice(0, 25),
  };
}

function readableFeatureName(feature: string) {
  return feature
    .replace(/_/g, " ")
    .replace(/\bUsd\b/gi, "USD")
    .replace(/\bPct\b/gi, "%")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
