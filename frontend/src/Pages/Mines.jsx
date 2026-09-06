import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mountain, FileText, TrendingUp, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";

function Mines() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [mines, setMines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/mines")
      .then((response) => response.json())
      .then((data) => {
        setMines(data.mines || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Mines error:", error);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading mine profiles...</div>;
  }

  return (
    <div className="mines-page">
      <MineImageCarousel />

      <div className="page-header">
        <div>
          <p className="page-label">MINE PROFILES</p>
          <h1>Digital Mine Profiles</h1>
          <p className="page-description">
            Aggregated production, documents and data quality per mine,
            compiled automatically from your processed documents.
          </p>
        </div>
      </div>

      {mines.length === 0 ? (
        <div className="quality-empty">
          <Mountain size={28} />
          <strong>No mine profiles yet</strong>
          <span>Upload and process documents that mention a mine name to see profiles here.</span>
        </div>
      ) : (
        <div className="mine-grid">
          {mines.map((mine) => (
            <button
              className="mine-card"
              key={mine.mine_name}
              onClick={() => navigate(`/mines/${encodeURIComponent(mine.mine_name)}`)}
            >
              <div className="mine-card-icon">
                <Mountain size={20} />
              </div>

              <h3>{mine.mine_name}</h3>

              <div className="mine-card-stats">
                <div>
                  <FileText size={13} />
                  <span>{mine.document_count} documents</span>
                </div>
                <div>
                  <TrendingUp size={13} />
                  <span>{mine.total_production} MT total</span>
                </div>
              </div>

              <div className="mine-card-footer">
                <span>{mine.years.length ? mine.years.join(", ") : "No years recorded"}</span>
                <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Mines;