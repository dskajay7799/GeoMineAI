import { useEffect, useState } from "react";
import { Cloud, FileText, Hash, Layers, Search, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";

function WordCloud() {
  const { authFetch } = useAuth();

  const [filters, setFilters] = useState({ categories: [], periods: [] });
  const [selectedCategory, setSelectedCategory] = useState("All Documents");
  const [selectedPeriod, setSelectedPeriod] = useState("");

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    authFetch("/api/wordcloud/filters")
      .then((response) => response.json())
      .then((data) => setFilters(data))
      .catch((err) => console.error("Failed to load filters:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (selectedCategory) params.append("category", selectedCategory);
    if (selectedPeriod) params.append("period", selectedPeriod);

    authFetch(`/api/wordcloud/analyze?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Analysis failed");
        return response.json();
      })
      .then((data) => {
        setAnalysis(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Word cloud analysis error:", err);
        setError("Unable to analyze documents");
        setLoading(false);
      });
  };

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keywords = analysis?.keywords || [];
  const topics = analysis?.topics || [];

  return (
    <div className="wordcloud-page">
      <MineImageCarousel />

      <div className="page-header">
        <div>
          <p className="page-label">DOCUMENT INTELLIGENCE</p>
          <h1>Word Cloud & Topics</h1>
          <p className="page-description">
            Discover important keywords and topics extracted from your
            actual uploaded documents.
          </p>
        </div>

        <div className="analysis-status">
          <span></span>
          Analysis Engine Ready
        </div>
      </div>

      <div className="analysis-controls">
        <div className="control-item">
          <label>DOCUMENT COLLECTION</label>

          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
            <option>All Documents</option>
            {filters.categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="control-item">
          <label>TIME PERIOD</label>

          <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
            <option value="">All Periods</option>
            {filters.periods.map((period) => (
              <option key={period} value={period}>{period}</option>
            ))}
          </select>
        </div>

        <button className="analyze-button" onClick={runAnalysis} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
          {loading ? "Analyzing..." : "Analyze Documents"}
        </button>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

      {analysis && (
        <>
          <div className="topic-kpis">
            <div className="topic-kpi">
              <div className="topic-kpi-icon">
                <FileText size={19} />
              </div>
              <div>
                <span>Documents Analyzed</span>
                <strong>{analysis.documents_analyzed}</strong>
              </div>
            </div>

            <div className="topic-kpi">
              <div className="topic-kpi-icon">
                <Hash size={19} />
              </div>
              <div>
                <span>Keywords Identified</span>
                <strong>{analysis.keywords_identified.toLocaleString()}</strong>
              </div>
            </div>

            <div className="topic-kpi">
              <div className="topic-kpi-icon">
                <Layers size={19} />
              </div>
              <div>
                <span>Topics Detected</span>
                <strong>{analysis.topics_detected}</strong>
              </div>
            </div>
          </div>

          <div className="wordcloud-layout">
            <div className="wordcloud-card">
              <div className="section-heading">
                <div>
                  <h3>Document Word Cloud</h3>
                  <p>Most frequently occurring terms</p>
                </div>
                <Cloud size={21} />
              </div>

              <div className="word-cloud">
                {keywords.length > 0 ? (
                  keywords.map((keyword) => (
                    <span key={keyword.word} className={`word-${keyword.size}`}>{keyword.word}</span>
                  ))
                ) : (
                  <p className="chart-empty">
                    No processed documents with text yet. Upload documents to
                    generate a word cloud.
                  </p>
                )}
              </div>
            </div>

            <div className="topics-card">
              <div className="section-heading">
                <div>
                  <h3>Identified Topics</h3>
                  <p>Topics ranked by frequency</p>
                </div>
                <Layers size={20} />
              </div>

              <div className="topic-list">
                {topics.length > 0 ? (
                  topics.map((topic, index) => (
                    <div className="topic-item" key={topic.name}>
                      <div className="topic-number">{index + 1}</div>

                      <div className="topic-content">
                        <div className="topic-title-row">
                          <strong>{topic.name}</strong>
                          <span>{topic.count}</span>
                        </div>

                        <div className="topic-progress">
                          <span style={{ width: `${topic.percentage}%` }}></span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="chart-empty">No topics detected yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default WordCloud;