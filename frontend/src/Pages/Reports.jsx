import { useEffect, useState } from "react";
import {
  FileBarChart,
  Calendar,
  Mountain,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Eye,
  Loader2,
  Landmark,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";

function Reports() {
  const { authFetch, user } = useAuth();
  const canEdit = user?.role === "Admin" || user?.role === "Editor";

  const [filters, setFilters] = useState({ report_types: [], mines: [], periods: [] });

  const [selectedReportType, setSelectedReportType] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [selectedMine, setSelectedMine] = useState("All Mines");

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [notification, setNotification] = useState(null);

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const [liveReportsIndex, setLiveReportsIndex] = useState([]);
  const [loadingLiveIndex, setLoadingLiveIndex] = useState(true);
  const [selectedLiveReportUrl, setSelectedLiveReportUrl] = useState("");
  const [liveChapters, setLiveChapters] = useState([]);
  const [loadingLiveChapters, setLoadingLiveChapters] = useState(false);
  const [importingUrl, setImportingUrl] = useState("");
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    authFetch("/api/external-data/annual-reports")
      .then((response) => response.json())
      .then((data) => {
        setLiveReportsIndex(data.reports || []);
        setLoadingLiveIndex(false);
      })
      .catch((err) => {
        console.error("Failed to load live reports index:", err);
        setLoadingLiveIndex(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectLiveReport = (pageUrl) => {
    setSelectedLiveReportUrl(pageUrl);
    setLiveChapters([]);
    setImportMessage("");

    if (!pageUrl) return;

    setLoadingLiveChapters(true);

    authFetch(`/api/external-data/annual-reports/chapters?page_url=${encodeURIComponent(pageUrl)}`)
      .then((response) => response.json())
      .then((data) => {
        setLiveChapters(data.chapters || []);
        setLoadingLiveChapters(false);
      })
      .catch((err) => {
        console.error("Failed to load live chapters:", err);
        setLoadingLiveChapters(false);
      });
  };

  const handleImportLiveReport = async (chapter) => {
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

  useEffect(() => {
    authFetch("/api/reports/filters")
      .then((response) => response.json())
      .then((data) => {
        setFilters(data);
        if (data.report_types?.length) setSelectedReportType(data.report_types[0]);
        if (data.periods?.length) setSelectedPeriod(data.periods[0]);
      })
      .catch((error) => console.error("Failed to load filters:", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReports = () => {
    setLoadingReports(true);

    authFetch("/api/reports")
      .then((response) => response.json())
      .then((data) => setReports(data.reports || []))
      .catch((error) => console.error("Failed to load reports:", error))
      .finally(() => setLoadingReports(false));
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = () => {
    if (!selectedReportType) return;

    setPreviewLoading(true);
    setPreview(null);

    const params = new URLSearchParams({ report_type: selectedReportType });
    if (selectedPeriod) params.append("period", selectedPeriod);
    if (selectedMine) params.append("mine_name", selectedMine);

    authFetch(`/api/reports/preview?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => setPreview(data))
      .catch((error) => console.error("Preview failed:", error))
      .finally(() => setPreviewLoading(false));
  };

  const handleGenerate = async () => {
    if (!selectedReportType || !canEdit) return;

    setGenerating(true);
    setNotification(null);

    try {
      const response = await authFetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: selectedReportType,
          period: selectedPeriod || null,
          mine_name: selectedMine || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Report generation failed");
      }

      setNotification({ type: "success", message: "Report generated successfully." });
      fetchReports();
    } catch (error) {
      console.error("Generate report error:", error);
      setNotification({ type: "error", message: error.message || "Unable to generate report." });
    } finally {
      setGenerating(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleDownload = async (reportId, displayName) => {
    try {
      const response = await authFetch(`/api/reports/${reportId}/download`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = displayName || "report.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const reportTypeCounts = filters.report_types.map((type) => ({
    type,
    count: reports.filter((r) => r.report_type === type).length,
  }));

  return (
    <div className="reports-page">
      <MineImageCarousel />

      <div className="page-header">
        <div>
          <p className="page-label">REPORTING INTELLIGENCE</p>
          <h1>Automated Reports</h1>
          <p className="page-description">
            Generate standardized geological, mining and production reports
            using validated data.
          </p>
        </div>

        <div className="report-status">
          <CheckCircle2 size={16} />
          Data Pipeline Ready
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.type}`}>
          <div className="notification-content">
            <p>{notification.message}</p>
          </div>
        </div>
      )}

      <div className="report-workspace">
        <div className="report-generator">
          <div className="generator-header">
            <div className="generator-icon">
              <FileBarChart size={21} />
            </div>

            <div>
              <h2>Generate New Report</h2>
              <p>Select the required parameters to generate a report.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Report Type</label>

              <select value={selectedReportType} onChange={(event) => setSelectedReportType(event.target.value)}>
                {filters.report_types.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Reporting Period</label>

              <div className="input-with-icon">
                <Calendar size={17} />

                <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
                  <option value="">All Periods</option>
                  {filters.periods.map((period) => (
                    <option key={period} value={period}>{period}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Mine / Area</label>

              <div className="input-with-icon">
                <Mountain size={17} />

                <select value={selectedMine} onChange={(event) => setSelectedMine(event.target.value)}>
                  <option value="All Mines">All Mines</option>
                  {filters.mines.map((mine) => (
                    <option key={mine} value={mine}>{mine}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {preview && (
            <div className="data-validation">
              <div className="validation-title">
                <CheckCircle2 size={17} />
                <div>
                  <strong>Data Validation</strong>
                  <span>{preview.matched_document_count} document(s) match the selected filters.</span>
                </div>
              </div>

              <div className="validation-result">
                <strong>{preview.validation_score !== null ? `${preview.validation_score}%` : "N/A"}</strong>
                <span>Avg. Confidence</span>
              </div>
            </div>
          )}

          <div className="generator-actions">
            <button className="secondary-button" onClick={handlePreview} disabled={previewLoading || !selectedReportType}>
              {previewLoading ? <Loader2 size={16} className="spin" /> : <Eye size={16} />}
              Preview Data
            </button>

            {canEdit && (
              <button className="generate-report-button" onClick={handleGenerate} disabled={generating || !selectedReportType}>
                {generating ? <Loader2 size={17} className="spin" /> : <FileBarChart size={17} />}
                {generating ? "Generating..." : "Generate Report"}
              </button>
            )}
          </div>
        </div>

        <div className="report-side-card">
          <div className="side-card-header">
            <div className="small-report-icon">
              <FileBarChart size={18} />
            </div>

            <div>
              <h3>Reports by Type</h3>
              <p>How many of each you've generated</p>
            </div>
          </div>

          {reportTypeCounts.length === 0 ? (
            <p className="chart-empty" style={{ padding: "10px 0" }}>No report types available yet.</p>
          ) : (
            reportTypeCounts.map((item) => (
              <div className="template-item" key={item.type}>
                <span>{item.type}</span>
                <strong>{item.count}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="recent-reports">
        <div className="recent-reports-header">
          <div>
            <h3>Recently Generated Reports</h3>
            <p>Reports created through the platform</p>
          </div>

          <button className="view-button" onClick={fetchReports} disabled={loadingReports}>
            {loadingReports ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="report-table-container">
          <table>
            <thead>
              <tr>
                <th>REPORT</th>
                <th>TYPE</th>
                <th>PERIOD</th>
                <th>STATUS</th>
                <th>GENERATED</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-documents">
                    <FileText size={28} />
                    <strong>No reports generated yet</strong>
                    <span>Generate your first report above.</span>
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <div className="report-name">
                        <div className="report-file-icon">
                          <FileText size={17} />
                        </div>
                        <strong>{report.display_name}</strong>
                      </div>
                    </td>

                    <td>{report.report_type}</td>
                    <td>{report.period || "All"}</td>

                    <td>
                      <span className={report.status === "Ready" ? "report-ready" : "report-review"}>
                        {report.status === "Ready" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        {report.status}
                      </span>
                    </td>

                    <td>{formatDate(report.created_at)}</td>

                    <td>
                      <button className="download-button" onClick={() => handleDownload(report.id, report.display_name)}>
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== LIVE REPORTS (Ministry of Coal) ==================== */}

      <div className="conflicts-card" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <h3>
              Live Reports <span className="live-badge">LIVE</span>
            </h3>
            <p>Official annual reports from the Ministry of Coal, Government of India &mdash; browse and import any chapter</p>
          </div>
          <Landmark size={20} />
        </div>

        {loadingLiveIndex ? (
          <div className="documents-loading" style={{ marginTop: 16 }}>
            <Loader2 size={22} className="spin" />
            <span>Loading report list...</span>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <select
              value={selectedLiveReportUrl}
              onChange={(e) => handleSelectLiveReport(e.target.value)}
              style={{
                height: 40, border: "1px solid #dce2ea", borderRadius: 6,
                padding: "0 12px", fontSize: 12, color: "#475569", width: "100%", maxWidth: 420,
              }}
            >
              <option value="">Select a year's annual report...</option>
              {liveReportsIndex.map((report) => (
                <option key={report.url} value={report.url}>
                  {report.label}
                </option>
              ))}
            </select>

            {loadingLiveChapters && (
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

            {liveChapters.length > 0 && (
              <div className="borehole-list" style={{ marginTop: 16 }}>
                {liveChapters.map((chapter) => (
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

                      {canEdit && (
                        <button
                          className="secondary-button"
                          onClick={() => handleImportLiveReport(chapter)}
                          disabled={importingUrl === chapter.pdf_url}
                        >
                          {importingUrl === chapter.pdf_url ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            "Import"
                          )}
                        </button>
                      )}
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

export default Reports;