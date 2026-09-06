import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Mountain,
  FileText,
  TrendingUp,
  Layers,
  ShieldAlert,
  AlertTriangle,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

function MineProfile() {
  const { mineName } = useParams();
  const navigate = useNavigate();
  const { authFetch, user } = useAuth();
  const canEdit = user?.role === "Admin" || user?.role === "Editor";

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [boreholes, setBoreholes] = useState([]);
  const [addingPoint, setAddingPoint] = useState(false);
  const [newPoint, setNewPoint] = useState(null);
  const [pointForm, setPointForm] = useState({ label: "", depth: "", notes: "" });

  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insightError, setInsightError] = useState("");

  const generateInsight = () => {
    setLoadingInsight(true);
    setInsightError("");
    setInsight("");

    authFetch("/api/ai/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "mine_profile", mine_name: mineName }),
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

  const loadProfile = () => {
    authFetch(`/api/mines/${encodeURIComponent(mineName)}/profile`)
      .then((response) => {
        if (!response.ok) throw new Error("Mine profile not found");
        return response.json();
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Mine profile error:", err);
        setError("Could not load this mine's profile.");
        setLoading(false);
      });
  };

  const loadBoreholes = () => {
    authFetch(`/api/mines/${encodeURIComponent(mineName)}/boreholes`)
      .then((response) => response.json())
      .then((data) => setBoreholes(data.boreholes || []))
      .catch((error) => console.error("Boreholes error:", error));
  };

  useEffect(() => {
    loadProfile();
    loadBoreholes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineName]);

  if (loading) {
    return <div className="dashboard-loading">Loading mine profile...</div>;
  }

  if (error || !profile) {
    return <div className="dashboard-error">{error || "Profile not found."}</div>;
  }

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  };

  const handleMapClick = (event) => {
    if (!canEdit || !addingPoint) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 500);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 300);
    setNewPoint({ x, y });
  };

  const savePoint = async () => {
    if (!newPoint || !pointForm.label.trim()) return;

    try {
      const response = await authFetch(`/api/mines/${encodeURIComponent(mineName)}/boreholes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: pointForm.label.trim(),
          x: newPoint.x,
          y: newPoint.y,
          depth: pointForm.depth || null,
          notes: pointForm.notes || null,
        }),
      });

      if (!response.ok) throw new Error("Could not save point");

      setNewPoint(null);
      setPointForm({ label: "", depth: "", notes: "" });
      setAddingPoint(false);
      loadBoreholes();
    } catch (error) {
      console.error("Save borehole error:", error);
    }
  };

  const deletePoint = async (id) => {
    try {
      await authFetch(`/api/boreholes/${id}`, { method: "DELETE" });
      loadBoreholes();
    } catch (error) {
      console.error("Delete borehole error:", error);
    }
  };

  // ---- Relationship diagram geometry (real data, computed positions) ----
  const categoryEntries = Object.entries(profile.categories || {});
  const centerX = 260;
  const centerY = 150;
  const radius = 110;

  const categoryNodes = categoryEntries.map((entry, index) => {
    const angle = (index / Math.max(categoryEntries.length, 1)) * 2 * Math.PI - Math.PI / 2;
    return {
      name: entry[0],
      count: entry[1],
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  return (
    <div className="mine-profile-page">
      <button className="back-link" onClick={() => navigate("/mines")}>
        <ArrowLeft size={15} /> All Mines
      </button>

            <div className="page-header">
        <div>
          <p className="page-label">MINE PROFILE</p>
          <h1>{profile.mine_name}</h1>
          <p className="page-description">
            Auto-compiled profile from {profile.document_count} processed document(s).
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
              <p>Generated from this mine's live production data</p>
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

      <div className="topic-kpis">
        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <TrendingUp size={19} />
          </div>
          <div>
            <span>Total Production</span>
            <strong>{profile.total_production} MT</strong>
          </div>
        </div>

        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <Layers size={19} />
          </div>
          <div>
            <span>Total Overburden</span>
            <strong>{profile.total_overburden} Mm3</strong>
          </div>
        </div>

        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <FileText size={19} />
          </div>
          <div>
            <span>Documents</span>
            <strong>{profile.document_count}</strong>
          </div>
        </div>

        <div className="topic-kpi">
          <div className="topic-kpi-icon">
            <ShieldAlert size={19} />
          </div>
          <div>
            <span>Conflicts</span>
            <strong>{profile.conflicts_count}</strong>
          </div>
        </div>
      </div>

      {profile.conflicts_count > 0 && (
        <div className="mine-conflict-banner">
          <AlertTriangle size={16} />
          <span>
            {profile.conflicts_count} data conflict(s) found for this mine &mdash;
            check the Insights page for details.
          </span>
        </div>
      )}

      {/* ==================== RELATIONSHIP DIAGRAM ==================== */}

      <div className="conflicts-card">
        <div className="section-heading">
          <div>
            <h3>Mine Relationship Map</h3>
            <p>How this mine's documents break down by category</p>
          </div>
          <Mountain size={20} />
        </div>

        {categoryNodes.length === 0 ? (
          <p className="chart-empty">No categorized documents yet for this mine.</p>
        ) : (
          <svg viewBox="0 0 520 300" className="relationship-svg">
            {categoryNodes.map((node) => (
              <line
                key={`line-${node.name}`}
                x1={centerX}
                y1={centerY}
                x2={node.x}
                y2={node.y}
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />
            ))}

            <circle cx={centerX} cy={centerY} r="34" fill="#2563eb" />
            <text x={centerX} y={centerY - 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="700">
              {profile.mine_name.length > 12 ? profile.mine_name.slice(0, 10) + "…" : profile.mine_name}
            </text>
            <text x={centerX} y={centerY + 10} textAnchor="middle" fill="#dbeafe" fontSize="8">
              MINE
            </text>

            {categoryNodes.map((node) => (
              <g key={node.name}>
                <circle cx={node.x} cy={node.y} r="26" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
                <text x={node.x} y={node.y - 3} textAnchor="middle" fill="#1d4ed8" fontSize="9" fontWeight="700">
                  {node.name}
                </text>
                <text x={node.x} y={node.y + 10} textAnchor="middle" fill="#2563eb" fontSize="8">
                  {node.count} doc{node.count !== 1 ? "s" : ""}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* ==================== GEOLOGICAL LAYOUT (manual points) ==================== */}

      <div className="conflicts-card">
        <div className="section-heading">
          <div>
            <h3>Geological Layout</h3>
            <p>Manually recorded borehole / seam reference points for this mine</p>
          </div>
          {canEdit && (
            <button
              className="secondary-button"
              onClick={() => {
                setAddingPoint((prev) => !prev);
                setNewPoint(null);
              }}
            >
              <Plus size={14} /> {addingPoint ? "Cancel" : "Add Point"}
            </button>
          )}
        </div>

        {addingPoint && (
          <p className="chart-empty" style={{ padding: "10px 0" }}>
            Click anywhere on the layout below to place a point.
          </p>
        )}

        <svg
          viewBox="0 0 500 300"
          className="geo-layout-svg"
          onClick={handleMapClick}
          style={{ cursor: canEdit && addingPoint ? "crosshair" : "default" }}
        >
          <rect x="0" y="0" width="500" height="300" fill="#f8fafc" stroke="#e2e8f0" />

          {[...Array(10)].map((_, i) => (
            <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="300" stroke="#eef2f6" />
          ))}
          {[...Array(6)].map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i * 50} x2="500" y2={i * 50} stroke="#eef2f6" />
          ))}

          {boreholes.map((point) => (
            <g key={point.id}>
              <circle cx={point.x} cy={point.y} r="7" fill="#2563eb" stroke="white" strokeWidth="2" />
              <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#334155" fontSize="9" fontWeight="700">
                {point.label}
              </text>
            </g>
          ))}

          {newPoint && (
            <circle cx={newPoint.x} cy={newPoint.y} r="7" fill="#f59e0b" stroke="white" strokeWidth="2" />
          )}
        </svg>

        {newPoint && (
          <div className="borehole-form">
            <input
              type="text"
              placeholder="Label (e.g. Borehole 4)"
              value={pointForm.label}
              onChange={(e) => setPointForm({ ...pointForm, label: e.target.value })}
            />
            <input
              type="text"
              placeholder="Depth (optional)"
              value={pointForm.depth}
              onChange={(e) => setPointForm({ ...pointForm, depth: e.target.value })}
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={pointForm.notes}
              onChange={(e) => setPointForm({ ...pointForm, notes: e.target.value })}
            />
            <button className="generate-button" onClick={savePoint} disabled={!pointForm.label.trim()}>
              Save Point
            </button>
          </div>
        )}

        {boreholes.length > 0 && (
          <div className="borehole-list">
            {boreholes.map((point) => (
              <div className="borehole-list-item" key={point.id}>
                <div>
                  <strong>{point.label}</strong>
                  <span>
                    {point.depth ? `Depth: ${point.depth}` : "No depth recorded"}
                    {point.notes ? ` · ${point.notes}` : ""}
                  </span>
                </div>
                {canEdit && (
                  <button className="more-button" onClick={() => deletePoint(point.id)} aria-label="Delete point">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="conflicts-card">
        <div className="section-heading">
          <div>
            <h3>Documents for this Mine</h3>
            <p>All processed and pending documents referencing {profile.mine_name}</p>
          </div>
          <Mountain size={20} />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>DOCUMENT</th>
                <th>CATEGORY</th>
                <th>YEAR</th>
                <th>PRODUCTION</th>
                <th>OVERBURDEN</th>
                <th>DATE</th>
              </tr>
            </thead>

            <tbody>
              {profile.documents.map((document) => (
                <tr key={document.id}>
                  <td>{document.original_name}</td>
                  <td><span className="category-badge">{document.category}</span></td>
                  <td>{document.reporting_year || "-"}</td>
                  <td>
                    {document.coal_production
                      ? `${document.coal_production} ${document.coal_production_unit || ""}`
                      : "-"}
                  </td>
                  <td>
                    {document.overburden_removal
                      ? `${document.overburden_removal} ${document.overburden_removal_unit || ""}`
                      : "-"}
                  </td>
                  <td>{formatDate(document.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MineProfile;