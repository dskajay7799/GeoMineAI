import { useEffect, useState } from "react";
import { TrendingUp, BarChart3, Factory, Activity, Target, FileSpreadsheet, Loader2, Sparkles, Landmark } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";

const PIE_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#a21caf", "#0891b2", "#65a30d", "#c2410c"];
const BAR_COLORS = ["#2563eb", "#16a34a", "#f59e0b"];

function Analytics() {
  const { authFetch } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [eligibleDocuments, setEligibleDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [aiInsight, setAiInsight] = useState("");
  const [loadingAiInsight, setLoadingAiInsight] = useState(false);
  const [aiInsightError, setAiInsightError] = useState("");

  const [liveData, setLiveData] = useState(null);
  const [loadingLiveData, setLoadingLiveData] = useState(true);

  useEffect(() => {
    authFetch("/api/analytics/summary")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load analytics");
        return response.json();
      })
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Analytics error:", err);
        setError("Unable to load analytics data");
        setLoading(false);
      });

    authFetch("/api/documents")
      .then((response) => response.json())
      .then((data) => {
      const docs = (data.documents || []).filter(
          (d) =>
            ["XLSX", "XLS", "CSV"].includes(String(d.file_type || "").toUpperCase().trim()) &&
            d.processing_status === "Processed"
        );
        setEligibleDocuments(docs);
      })
      .catch((err) => console.error("Failed to load documents:", err));

    authFetch("/api/external-data/coal-ministry/analysis")
      .then((response) => response.json())
      .then((data) => {
        setLiveData(data);
        setLoadingLiveData(false);
      })
      .catch((err) => {
        console.error("Live data analysis error:", err);
        setLoadingLiveData(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectDocument = (documentId) => {
    setSelectedDocId(documentId);
    setAnalysis(null);
    setAnalysisError("");

    if (!documentId) return;

    setLoadingAnalysis(true);

    authFetch(`/api/documents/${documentId}/auto-analysis`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not analyze this file.");
        return data;
      })
      .then((data) => {
        setAnalysis(data);
        setLoadingAnalysis(false);
      })
      .catch((err) => {
        console.error("Auto-analysis error:", err);
        setAnalysisError(err.message);
        setLoadingAnalysis(false);
      });
  };

  const generateAiInsight = () => {
    setLoadingAiInsight(true);
    setAiInsightError("");
    setAiInsight("");

    authFetch("/api/ai/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "analytics" }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not generate insight");
        return data;
      })
      .then((data) => {
        setAiInsight(data.insight);
        setLoadingAiInsight(false);
      })
      .catch((err) => {
        console.error("AI insight error:", err);
        setAiInsightError(err.message);
        setLoadingAiInsight(false);
      });
  };

  if (loading) return <div className="dashboard-loading">Loading analytics...</div>;
  if (error) return <div className="dashboard-error">{error}</div>;

  const productionByYear = summary.production_by_year || [];
  const productionByMine = summary.production_by_mine || [];

  const growthLabel =
    summary.growth_percent !== null && summary.growth_percent !== undefined
      ? `${summary.growth_percent > 0 ? "+" : ""}${summary.growth_percent}%`
      : "N/A";

  return (
    <div className="analytics-page">
      <MineImageCarousel />

      <div className="page-header">
        <div>
          <p className="page-label">DATA INTELLIGENCE</p>
          <h1>Analytics & Insights</h1>
          <p className="page-description">
            Analyze production trends, operational performance and
            historical mining data extracted from your documents.
          </p>
        </div>
      </div>

      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <div className="analytics-kpi-icon"><Factory size={20} /></div>
          <div>
            <span>Total Production</span>
            <strong>{summary.total_production} MT</strong>
            <small>Across all processed documents</small>
          </div>
        </div>

        <div className="analytics-kpi">
          <div className="analytics-kpi-icon"><TrendingUp size={20} /></div>
          <div>
            <span>Production Growth</span>
            <strong>{growthLabel}</strong>
            <small>First vs latest reporting year</small>
          </div>
        </div>

        <div className="analytics-kpi">
          <div className="analytics-kpi-icon"><Activity size={20} /></div>
          <div>
            <span>Data Records</span>
            <strong>{summary.data_records.toLocaleString()}</strong>
            <small>Extracted facts across all sources</small>
          </div>
        </div>

        <div className="analytics-kpi">
          <div className="analytics-kpi-icon"><Target size={20} /></div>
          <div>
            <span>Validation Rate</span>
            <strong>{summary.validation_rate !== null ? `${summary.validation_rate}%` : "N/A"}</strong>
            <small>Avg. extraction confidence</small>
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card production-chart-card">
          <div className="analytics-card-header">
            <div>
              <h3>Coal Production Trend</h3>
              <p>Annual production in million tonnes (by reporting year)</p>
            </div>
            <div className="chart-legend">
              <span></span>
              Production
            </div>
          </div>

          <div className="chart-container">
            {productionByYear.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={productionByYear}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="production" strokeWidth={3} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="chart-empty">
                No production data with reporting years yet. Upload and
                process documents to see this chart.
              </p>
            )}
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-card-header">
            <div>
              <h3>Mine Comparison</h3>
              <p>Total production by mine</p>
            </div>
          </div>

          <div className="chart-container">
            {productionByMine.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={productionByMine}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mine" tick={{ fontSize: 9 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="production" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="chart-empty">No production data linked to a mine name yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* ==================== PER-FILE AUTO ANALYSIS ==================== */}

      <div className="analytics-card" style={{ marginTop: 20 }}>
        <div className="analytics-card-header">
          <div>
            <h3>Analyze a Document</h3>
            <p>Pick an uploaded spreadsheet — charts are generated automatically from its actual columns</p>
          </div>
          <FileSpreadsheet size={20} />
        </div>

        <div style={{ marginTop: 16 }}>
          <select
            value={selectedDocId}
            onChange={(e) => handleSelectDocument(e.target.value)}
            style={{
              height: 40, border: "1px solid #dce2ea", borderRadius: 6,
              padding: "0 12px", fontSize: 12, color: "#475569", width: "100%", maxWidth: 420,
            }}
          >
            <option value="">Select a document to analyze...</option>
            {eligibleDocuments.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.original_name}
              </option>
            ))}
          </select>

          {eligibleDocuments.length === 0 && (
            <p className="chart-empty" style={{ padding: "16px 0 0" }}>
              No processed Excel/CSV files found yet. Upload one to analyze it here.
            </p>
          )}
        </div>

        {loadingAnalysis && (
          <div className="documents-loading" style={{ marginTop: 20 }}>
            <Loader2 size={22} className="spin" />
            <span>Analyzing file...</span>
          </div>
        )}

        {analysisError && (
          <div className="dashboard-error" style={{ marginTop: 16 }}>{analysisError}</div>
        )}

        {analysis && !loadingAnalysis && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 16 }}>
              {analysis.row_count} rows &middot; {analysis.columns.length} columns detected:{" "}
              {analysis.columns.join(", ")}
            </p>

            {analysis.summary.length > 0 && (
              <div className="topic-kpis" style={{ marginBottom: 20 }}>
                {analysis.summary.map((stat) => (
                  <div className="topic-kpi" key={stat.column}>
                    <div className="topic-kpi-icon"><BarChart3 size={19} /></div>
                    <div>
                      <span>{stat.column}</span>
                      <strong>Sum: {stat.sum.toLocaleString()}</strong>
                      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
                        Avg {stat.avg} &middot; Min {stat.min} &middot; Max {stat.max}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {analysis.line_chart && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
                  {analysis.line_chart.title}
                </h4>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={analysis.line_chart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="x" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {analysis.line_chart.series.map((seriesName, index) => (
                      <Line
                        key={seriesName}
                        type="monotone"
                        dataKey={seriesName}
                        stroke={BAR_COLORS[index % BAR_COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {analysis.bar_charts.map((chart) => (
              <div key={chart.title} style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>{chart.title}</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}

            {analysis.pie_charts.map((chart) => (
              <div key={chart.title} style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>{chart.title}</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chart.data}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {chart.data.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ))}

            {analysis.bar_charts.length === 0 && analysis.pie_charts.length === 0 && !analysis.line_chart && (
              <p className="chart-empty">
                This file's columns didn't have a clear numeric + category combination to chart.
                Try a file with clearer column headers (e.g. "Mine", "Year", "Production").
              </p>
            )}
          </div>
        )}
      </div>

      {/* ==================== LIVE NATIONAL DATA ==================== */}

      <div className="analytics-card" style={{ marginTop: 20 }}>
        <div className="analytics-card-header">
          <div>
            <h3>National Coal Statistics (Live)</h3>
            <p>From the Ministry of Coal, Government of India</p>
          </div>
          <Landmark size={20} />
        </div>

        {loadingLiveData ? (
          <div className="documents-loading" style={{ marginTop: 20 }}>
            <Loader2 size={22} className="spin" />
            <span>Loading live data...</span>
          </div>
        ) : !liveData?.has_data ? (
          <p className="chart-empty" style={{ marginTop: 16 }}>
            No live data yet. Go to National Stats and click "Refresh from Ministry of Coal" first.
          </p>
        ) : (
          <div style={{ marginTop: 20 }}>
            {liveData.production_bar.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
                  Production vs Offtake by Company (MT)
                </h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={liveData.production_bar}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="production_achieved" name="Production" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="offtake_achieved" name="Offtake" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {liveData.production_pie.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
                  Production Share by Company
                </h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={liveData.production_pie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {liveData.production_pie.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {liveData.import_trend.length > 0 && (
              <div>
                <h4 style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
                  Coal Import Trend by Year (Million Tonnes)
                </h4>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={liveData.import_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Coking Coal" stroke="#2563eb" strokeWidth={2} />
                    <Line type="monotone" dataKey="Non-Coking Coal" stroke="#16a34a" strokeWidth={2} />
                    <Line type="monotone" dataKey="Total Coal Import" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="analytics-bottom-grid" style={{ marginTop: 20 }}>
        <div className="analytics-card">
          <div className="analytics-card-header">
            <div>
              <h3>Key Operational Indicators</h3>
              <p>Current performance overview</p>
            </div>
          </div>

          <div className="indicator-list">
            <div className="indicator-row">
              <div>
                <strong>Document Processing</strong>
                <span>Documents successfully processed</span>
              </div>
              <div className="indicator-value">
                <strong>{summary.processing_success_rate}%</strong>
                <div className="progress">
                  <span style={{ width: `${summary.processing_success_rate}%` }}></span>
                </div>
              </div>
            </div>

            <div className="indicator-row">
              <div>
                <strong>Data Validation</strong>
                <span>Average extraction confidence</span>
              </div>
              <div className="indicator-value">
                <strong>{summary.validation_rate !== null ? `${summary.validation_rate}%` : "N/A"}</strong>
                <div className="progress">
                  <span style={{ width: `${summary.validation_rate || 0}%` }}></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-card insight-card">
          <div className="insight-header">
            <div className="insight-icon"><BarChart3 size={20} /></div>
            <div>
              <h3>AI Insight</h3>
              <span>Generated from live production data</span>
            </div>
          </div>

          {aiInsight ? (
            <p>{aiInsight}</p>
          ) : (
            <p>
              {productionByYear.length >= 2 ? (
                <>
                  Production changed by <strong>{growthLabel}</strong> between{" "}
                  {productionByYear[0].year} and{" "}
                  {productionByYear[productionByYear.length - 1].year} based on
                  the documents processed so far.
                </>
              ) : (
                "Not enough reporting-year data has been processed yet to identify a production trend. Upload more documents with clear reporting years to unlock this insight."
              )}
            </p>
          )}

          {aiInsightError && <div className="dashboard-error" style={{ marginTop: 12 }}>{aiInsightError}</div>}

          <button className="insight-button" onClick={generateAiInsight} disabled={loadingAiInsight}>
            {loadingAiInsight ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {loadingAiInsight ? " Generating..." : " Generate Deeper AI Insight"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Analytics;