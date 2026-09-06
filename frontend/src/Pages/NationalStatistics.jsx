import { useEffect, useState } from "react";
import { RefreshCw, Loader2, ExternalLink, Landmark, FileText, Download, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";

function NationalStatistics() {
  const { authFetch, user } = useAuth();
  const canRefresh = user?.role === "Admin" || user?.role === "Editor";

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [reportsIndex, setReportsIndex] = useState([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [selectedReportUrl, setSelectedReportUrl] = useState("");
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [importingUrl, setImportingUrl] = useState("");
  const [importMessage, setImportMessage] = useState("");

  const loadLatest = () => {
    setLoading(true);
    authFetch("/api/external-data/coal-ministry/latest")
      .then((response) => response.json())
      .then((data) => {
        setTables(data.tables || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load external data:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadLatest();

    authFetch("/api/external-data/annual-reports")
      .then((response) => response.json())
      .then((data) => {
        setReportsIndex(data.reports || []);
        setLoadingIndex(false);
      })
      .catch((err) => {
        console.error("Failed to load annual reports index:", err);
        setLoadingIndex(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");

    try {
      const response = await authFetch("/api/external-data/coal-ministry/refresh", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not refresh live data");
      }

      loadLatest();
    } catch (err) {
      console.error("Refresh error:", err);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectReport = (pageUrl) => {
    setSelectedReportUrl(pageUrl);
    setChapters([]);
    setImportMessage("");

    if (!pageUrl) return;

    setLoadingChapters(true);

    authFetch(`/api/external-data/annual-reports/chapters?page_url=${encodeURIComponent(pageUrl)}`)
      .then((response) => response.json())
      .then((data) => {
        setChapters(data.chapters || []);
        setLoadingChapters(false);
      })
      .catch((err) => {
        console.error("Failed to load chapters:", err);
        setLoadingChapters(false);
      });
  };

  const handleImport = async (chapter) => {
    setImportingUrl(chapter.pdf_url);
    setImportMessage("");

    try {
      const response = await authFetch("/api/external-data/annual-reports/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: chapter.title, pdf_url: chapter.pdf_url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Import failed");
      }

      setImportMessage(`"${chapter.title}" imported and is now processing — check the Documents page.`);
    } catch (err) {
      console.error("Import error:", err);
      setImportMessage(`Failed to import "${chapter.title}": ${err.message}`);
    } finally {
      setImportingUrl("");
    }
  };

  const timeAgo = (dateString) => {
    if (!dateString) return "never";
    const diffMs = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="national-stats-page">
      <MineImageCarousel />

      <div className="page-header">
        <div>
          <p className="page-label">LIVE GOVERNMENT DATA</p>
          <h1>National Coal Statistics</h1>
          <p className="page-description">
            Live production, offtake and import data pulled directly from the
            Ministry of Coal, Government of India.
          </p>
        </div>

        {canRefresh && (
          <button className="generate-button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {refreshing ? "Refreshing..." : "Refresh from Ministry of Coal"}
          </button>
        )}
      </div>

      {error && <div className="dashboard-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="dashboard-loading">Loading live data...</div>
      ) : tables.length === 0 ? (
        <div className="quality-empty">
          <Landmark size={28} />
          <strong>No live data yet</strong>
          <span>Click "Refresh from Ministry of Coal" to pull the latest official statistics.</span>
        </div>
      ) : (
        tables.map((table) => (
          <div className="conflicts-card" key={table.table_label} style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <div>
                <h3>{table.table_label}</h3>
                <p>
                  Source: {table.source_name} &middot; Last fetched {timeAgo(table.fetched_at)}
                </p>
              </div>
              <a href={table.source_url} target="_blank" rel="noreferrer" className="more-button" aria-label="View source">
                <ExternalLink size={18} />
              </a>
            </div>

            <div className="table-container" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    {table.columns.map((col, index) => (
                      <th key={index}>{col}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* ==================== ANNUAL REPORTS ARCHIVE ==================== */}

      <div className="conflicts-card" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <h3>Annual Reports Archive</h3>
            <p>Browse official Ministry of Coal annual reports (2009–10 to present) and import any chapter directly into Document Intelligence</p>
          </div>
          <FileText size={20} />
        </div>

        {loadingIndex ? (
          <div className="documents-loading" style={{ marginTop: 16 }}>
            <Loader2 size={22} className="spin" />
            <span>Loading report list...</span>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <select
              value={selectedReportUrl}
              onChange={(e) => handleSelectReport(e.target.value)}
              style={{
                height: 40, border: "1px solid #dce2ea", borderRadius: 6,
                padding: "0 12px", fontSize: 12, color: "#475569", width: "100%", maxWidth: 420,
              }}
            >
              <option value="">Select a year's annual report...</option>
              {reportsIndex.map((report) => (
                <option key={report.url} value={report.url}>
                  {report.label}
                </option>
              ))}
            </select>

            {loadingChapters && (
              <div className="documents-loading" style={{ marginTop: 16 }}>
                <Loader2 size={22} className="spin" />
                <span>Loading chapters...</span>
              </div>
            )}

            {importMessage && (
              <div className="notification success" style={{ marginTop: 16 }}>
                <div className="notification-icon"><CheckCircle2 size={18} /></div>
                <div className="notification-content"><p>{importMessage}</p></div>
              </div>
            )}

            {chapters.length > 0 && (
              <div className="borehole-list" style={{ marginTop: 16 }}>
                {chapters.map((chapter) => (
                  <div className="borehole-list-item" key={chapter.pdf_url}>
                    <div>
                      <strong>{chapter.title}</strong>
                      <span>Official PDF chapter</span>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <a
                        href={chapter.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="more-button"
                        aria-label="Open PDF"
                      >
                        <Download size={14} />
                      </a>

                      <button
                        className="secondary-button"
                        onClick={() => handleImport(chapter)}
                        disabled={importingUrl === chapter.pdf_url}
                      >
                        {importingUrl === chapter.pdf_url ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          "Import"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NationalStatistics;