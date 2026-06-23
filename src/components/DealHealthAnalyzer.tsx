"use client";

import { FormEvent, useState } from "react";

type DealHealthResult = {
  filename: string;
  sheetName: string;
  rowCount: number;
  averageScore: number;
  band: string;
  risk: string;
  uploadedMae: number | null;
  bandCounts: Record<string, number>;
  modelMetrics: {
    dataset: {
      rows: number;
      trainingRows: number;
      testingRows: number;
      testSize: number;
      randomState: number;
    };
    model: { mae: number; rmse: number; r2: number };
    baseline: { mae: number; rmse: number; r2: number };
    maeImprovementPct: number;
    crossValidation: { folds: number; bestMeanMae: number };
  };
  topDrivers: { feature: string; gain: number }[];
  contracts: {
    contractId: string;
    clientName: string;
    predictedScore: number;
    actualScore: number | null;
    band: string;
    risk: string;
  }[];
};

const bandOrder = ["Excellent", "Healthy", "Watch List", "At Risk", "Critical"];

export default function DealHealthAnalyzer() {
  const [result, setResult] = useState<DealHealthResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/deal-health", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to score contracts.");
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to score contracts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="contract-analyzer">
      <div className="card contract-analyzer-intro">
        <div>
          <div className="section-kicker">Contract Analyzer</div>
          <h2>IT Hardware Sales Contracts</h2>
          <p>Upload the contract workbook to run the trained XGBoost regression model.</p>
        </div>
        <form onSubmit={analyze}>
          <input name="file" type="file" accept=".xlsx,.xls,.csv" required />
          <button className="button" disabled={busy}>
            {busy ? "Scoring..." : "Predict Deal Health"}
          </button>
        </form>
      </div>

      {error && <div className="notice error">{error}</div>}
      {result && <DealHealthResults result={result} />}
    </section>
  );
}

function DealHealthResults({ result }: { result: DealHealthResult }) {
  const totalGain = result.topDrivers.reduce((sum, item) => sum + item.gain, 0) || 1;
  return (
    <section className="card deal-health-card">
      <div className="deal-health-header">
        <div>
          <div className="section-kicker">XGBoost prediction</div>
          <h2>Deal Health Score</h2>
          <p>{result.filename} · {result.rowCount.toLocaleString()} contracts · {result.sheetName}</p>
        </div>
        <div className={`deal-score-ring score-${tone(result.risk)}`}>
          <strong>{result.averageScore.toFixed(1)}</strong>
          <span>/ 100</span>
        </div>
        <div className="deal-health-verdict">
          <span className={`badge ${tone(result.risk)}`}>{result.band}</span>
          <strong>{result.risk} portfolio risk</strong>
          <small>Model R² {result.modelMetrics.model.r2.toFixed(3)}</small>
        </div>
      </div>

      <div className="deal-health-kpis">
        <Metric label="Test MAE" value={result.modelMetrics.model.mae.toFixed(2)} detail="Average score-point error" />
        <Metric label="Test RMSE" value={result.modelMetrics.model.rmse.toFixed(2)} detail="Penalizes larger misses" />
        <Metric label="Baseline improvement" value={`${result.modelMetrics.maeImprovementPct.toFixed(1)}%`} detail="MAE reduction vs mean model" />
        <Metric label="Train / Test" value={`${result.modelMetrics.dataset.trainingRows} / ${result.modelMetrics.dataset.testingRows}`} detail="80% / 20%, seed 42" />
        <Metric label="Uploaded-file MAE" value={result.uploadedMae === null ? "N/A" : result.uploadedMae.toFixed(2)} detail="Shown when target scores exist" />
      </div>

      <div className="deal-health-grid">
        <div>
          <h3>Health distribution</h3>
          <div className="health-distribution">
            {bandOrder.map(band => {
              const count = result.bandCounts[band] || 0;
              const share = result.rowCount ? count / result.rowCount * 100 : 0;
              return (
                <div className="health-band-row" key={band}>
                  <span>{band}</span>
                  <div><i style={{ width: `${share}%` }} /></div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h3>Top model drivers</h3>
          <div className="driver-list">
            {result.topDrivers.map(item => (
              <div key={item.feature}>
                <span>{item.feature}</span>
                <div><i style={{ width: `${item.gain / totalGain * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="subsection-title">Lowest predicted deal health</h3>
      <div className="deal-table-wrap">
        <table>
          <thead>
            <tr><th>Contract</th><th>Client</th><th>Predicted</th><th>Actual</th><th>Band</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {result.contracts.map(contract => (
              <tr key={contract.contractId}>
                <td><strong>{contract.contractId}</strong></td>
                <td>{contract.clientName}</td>
                <td>{contract.predictedScore.toFixed(1)}</td>
                <td>{contract.actualScore === null ? "—" : contract.actualScore.toFixed(1)}</td>
                <td><span className={`badge ${tone(contract.risk)}`}>{contract.band}</span></td>
                <td>{contract.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function tone(risk: string) {
  if (risk === "Critical") return "Critical";
  if (risk === "High") return "High";
  if (risk === "Medium") return "Watch";
  return "Healthy";
}
