import { useEffect, useState } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  FileWarning,
  Copy,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";

function Insights() {
  const { authFetch } = useAuth();

  const [quality, setQuality] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insightError, setInsightError] = useState("");

  useEffect(() => {
    Promise.all([
      authFetch("/api/insights/quality").then((r) => r.json()),
      authFetch("/api/insights/conflicts").then((r) => r.json()),
    ])
      .then(([qualityData, conflictsData]) => {
        setQuality(qualityData);
        setConflicts(conflictsData.conflicts || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Insights error:", error);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateInsight = () => {
    setLoadingInsight(true);
    setInsightError("");
    setInsight("");

    authFetch("/api/ai/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "data_quality" }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not generate insight");
        return data;
      })
      .then((data) => {
        setInsight(data.insight);
        setLoadingInsight(false);
      })
      .catch((err) => {
        console.error("Insight error:", err);
        setInsightError(err.message);
        setLoadingInsight(false);
      });
  };

  if (loading) {
    return <div className="dashboard-loading">Loading insights...</div>;
  }

  const fieldLabel = (field) =>
    field === "coal_production" ? "Coal Production" : "Overburden Removal";

  return (
    <div className="insights-page">
      <MineImageCarousel />

      <div className="page-header">
        <div>
          <p className="page-label">DATA GOVERNANCE</p>
          <h1>Data Quality &amp; Conflict Detector</h1>
          <p className="page-description">
            Automatically detect missing metadata, weak extractions,
            duplicates, and contradicting figures across your documents.
          </p>
        </div>

        <button className="generate-button" onClick={generateInsight} disabled={loadingInsight}>
          {loadingInsight ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {loadingInsight ? "Generating..." : "Generate AI Insight"}
        </button>
      </div>

      {(insight || insightError) && (
        <div className="conflicts-card" style={{ marginBottom: 20 }}>
          <div className="section-heading">
            <div>
              <h3>AI Insight</h3>
              <p>Generated from your live data quality and conflict metrics</p>
            </div>
            <Sparkles size={20} />
          </div>

          {insightError ? (
            <div className="dashboard-error" style={{ marginTop: 14 }}>{insightError}</div>
          ) : (
            <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.8, marginTop: 14 }}>
              {insight}
            </p>
          )}
        </div>
      )}

      <div className="quality-score-card">
        <div className="quality-score-ring">
          <span>
            {quality?.quality_score !== null && quality?.quality_score !== undefined
              ? `${quality.quality_score}%`
              : "N/A"}
          </span>
        </div>

        <div className="quality-score-details">
          <h3>Overall Data Quality Score</h3>
          <p>
            Based on {quality?.total_processed ?? 0} processed documents &mdash;
            documents with missing metadata, very short extracted text, or
            duplicate filenames are counted as flagged.
          </p>
        </div>
      </div>

      <div className="topic-kpis">
        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <FileWarning size={19} />
          </div>
          <div>
            <span>Missing Metadata</span>
            <strong>{quality?.missing_metadata_count ?? 0}</strong>
          </div>
        </div>

        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <AlertTriangle size={19} />
          </div>
          <div>
            <span>Weak Text Extraction</span>
            <strong>{quality?.low_extraction_count ?? 0}</strong>
          </div>
        </div>

        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <Copy size={19} />
          </div>
          <div>
            <span>Duplicate Filenames</span>
            <strong>{quality?.duplicate_count ?? 0}</strong>
          </div>
        </div>

        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <ShieldAlert size={19} />
          </div>
          <div>
            <span>Data Conflicts</span>
            <strong>{quality?.conflicts_count ?? 0}</strong>
          </div>
        </div>
      </div>

      <div className="conflicts-card">
        <div className="section-heading">
          <div>
            <h3>Detected Data Conflicts</h3>
            <p>Same mine and reporting year, different reported figures</p>
          </div>
          <ShieldAlert size={20} />
        </div>

        {conflicts.length === 0 ? (
          <div className="quality-empty">
            <CheckCircle2 size={26} color="#16a34a" />
            <strong>No conflicts detected</strong>
            <span>All matching mine/year records agree across documents.</span>
          </div>
        ) : (
          <div className="conflict-list">
            {conflicts.map((conflict, index) => (
              <div className="conflict-item" key={index}>
                <div className="conflict-item-header">
                  <span className="conflict-badge">
                    <AlertTriangle size={12} /> Conflict
                  </span>
                  <strong>
                    {conflict.mine_name} &middot; {conflict.reporting_year} &middot;{" "}
                    {fieldLabel(conflict.field)}
                  </strong>
                </div>

                <div className="conflict-values">
                  {conflict.values.map((value) => (
                    <div className="conflict-value-row" key={value.document_id}>
                      <span className="conflict-doc-name">{value.document_name}</span>
                      <span className="conflict-doc-value">
                        {value.value} {value.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Insights;