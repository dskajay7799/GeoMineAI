import React, { useEffect, useState } from "react";

import {
  FileText,
  FileBarChart,
  Database,
  Target,
  Zap,
  Mountain,
  AlertTriangle,
  Landmark,
} from "lucide-react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

import MineImageCarousel from "../components/MineImageCarousel";
import { SkeletonStatCards, SkeletonBlock } from "../components/Skeleton";
import AnimatedNumber from "../components/AnimatedNumber";


function Dashboard() {
  const { authFetch } = useAuth();
  const { t } = useLanguage();

  // =========================================================
  // STATE
  // =========================================================

  const [dashboardData, setDashboardData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [mines, setMines] = useState(null);
  const [quality, setQuality] = useState(null);
  const [liveHighlights, setLiveHighlights] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  // =========================================================
  // LOAD DASHBOARD DATA
  // =========================================================

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const [
          dashboardResponse,
          analyticsResponse,
          minesResponse,
          qualityResponse,
          liveDataResponse,
        ] = await Promise.all([
          authFetch("/api/dashboard"),

          authFetch("/api/analytics/summary"),

          authFetch("/api/mines"),

          authFetch("/api/insights/quality"),

          authFetch("/api/external-data/coal-ministry/analysis"),
        ]);


        // -----------------------------------------------------
        // DASHBOARD
        // -----------------------------------------------------

        if (!dashboardResponse.ok) {
          throw new Error("Failed to load dashboard data");
        }

        const dashboard = await dashboardResponse.json();


        // -----------------------------------------------------
        // OPTIONAL DATA
        // -----------------------------------------------------

        const analyticsSummary = analyticsResponse.ok
          ? await analyticsResponse.json()
          : null;

        const minesData = minesResponse.ok
          ? await minesResponse.json()
          : null;

        const qualityData = qualityResponse.ok
          ? await qualityResponse.json()
          : null;

        const liveData = liveDataResponse.ok
          ? await liveDataResponse.json()
          : null;


        // -----------------------------------------------------
        // UPDATE STATE
        // -----------------------------------------------------

        if (!isMounted) return;

        setDashboardData(dashboard);

        setAnalytics(analyticsSummary);

        setMines(minesData);

        setQuality(qualityData);

        setLiveHighlights(
          Array.isArray(liveData?.highlights)
            ? liveData.highlights
            : []
        );

        setLoading(false);

      } catch (err) {
        console.error("Dashboard error:", err);

        if (!isMounted) return;

        setError("Unable to connect to backend");

        setLoading(false);
      }
    };


    loadDashboard();


    return () => {
      isMounted = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // =========================================================
  // ERROR STATE
  // =========================================================

  if (error) {
    return (
      <div className="dashboard-error">
        {error}
      </div>
    );
  }


  // =========================================================
  // LOADING STATE
  // =========================================================

  if (loading) {
    return (
      <div className="dashboard">

        <MineImageCarousel />


        {/* PAGE HEADER */}

        <div className="page-header">

          <div>

            <SkeletonBlock
              height={10}
              width={140}
            />

            <SkeletonBlock
              height={26}
              width={320}
              style={{ marginTop: 10 }}
            />

            <SkeletonBlock
              height={12}
              width={420}
              style={{ marginTop: 10 }}
            />

          </div>

        </div>


        {/* STAT CARDS */}

        <SkeletonStatCards count={4} />


        {/* DASHBOARD CONTENT SKELETON */}

        <div className="dashboard-grid">

          <div className="chart-card">
            <SkeletonBlock
              height={280}
              radius={10}
            />
          </div>


          <div className="activity-card">
            <SkeletonBlock
              height={280}
              radius={10}
            />
          </div>

        </div>

      </div>
    );
  }


  // =========================================================
  // NO DATA STATE
  // =========================================================

  if (!dashboardData) {
    return (
      <div className="dashboard-error">
        No dashboard data available.
      </div>
    );
  }


  // =========================================================
  // STATISTICS
  // =========================================================

  const stats = [
    {
      title: t("minesTracked"),
      value: Number(mines?.count ?? 0),
      icon: Mountain,
    },

    {
      title: t("documentsProcessed"),
      value: Number(
        dashboardData.documents_processed ?? 0
      ),
      icon: FileText,
    },

    {
      title: t("reportsGenerated"),
      value: Number(
        dashboardData.reports_generated ?? 0
      ),
      icon: FileBarChart,
    },

    {
      title: t("needsReview"),
      value: Number(
        dashboardData.review_documents ?? 0
      ),
      icon: Database,
    },
  ];


  // =========================================================
  // PRODUCTION DATA
  // =========================================================

  const productionByYear =
    Array.isArray(analytics?.production_by_year)
      ? analytics.production_by_year
      : [];


  // =========================================================
  // DATA QUALITY ISSUES
  // =========================================================

  const dataIssues =
    Number(quality?.missing_metadata_count ?? 0) +
    Number(quality?.conflicts_count ?? 0);


  // =========================================================
  // MAIN DASHBOARD
  // =========================================================

  return (
    <div className="dashboard">

      {/* =====================================================
          MINE IMAGE CAROUSEL
          ===================================================== */}

      <MineImageCarousel />


      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="page-header">

        <div>

          <p className="page-label">
            {t("miningIntelligenceCenter")}
          </p>

          <h1>
            {t("miningIntelligenceDashboard")}
          </h1>

          <p className="page-description">
            {t("dashboardDescription")}
          </p>

        </div>

      </div>


      {/* =====================================================
          MAIN STAT CARDS
          ===================================================== */}

      <div className="stats-grid">

        {stats.map((stat) => {

          const Icon = stat.icon;

          return (
            <div
              className="stat-card"
              key={stat.title}
            >

              <div className="stat-top">

                <div className="stat-icon">
                  <Icon size={21} />
                </div>

              </div>


              <p>
                {stat.title}
              </p>


              <h2>
                {stat.value.toLocaleString()}
              </h2>

            </div>
          );
        })}

      </div>


      {/* =====================================================
          LIVE NATIONAL COAL STATISTICS
          ===================================================== */}

      {liveHighlights.length > 0 && (

        <div className="live-highlights-section">

          <div className="live-highlights-header">

            <Landmark size={16} />

            <span>
              Live National Coal Statistics &mdash;
              Ministry of Coal, Government of India
            </span>

          </div>


          <div className="live-highlights-grid">

            {liveHighlights.map((item, index) => (

              <div
                className="live-highlight-card"
                key={`${item.label}-${index}`}
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >

                <span className="live-highlight-label">
                  {item.label}
                </span>


                <strong className="live-highlight-value">

                  <AnimatedNumber
                    value={Number(item.value ?? 0)}
                    decimals={
                      item.unit === "%"
                        ? 2
                        : 2
                    }
                  />

                  <span className="live-highlight-unit">
                    {" "}
                    {item.unit}
                  </span>

                </strong>

              </div>

            ))}

          </div>

        </div>

      )}


      {/* =====================================================
          KPI SECTION
          ===================================================== */}

      <div className="analytics-kpis">


        {/* VALIDATION ACCURACY */}

        <div className="analytics-kpi">

          <div className="analytics-kpi-icon">
            <Target size={20} />
          </div>


          <div>

            <span>
              {t("validationAccuracy")}
            </span>


            <strong>

              {dashboardData.validation_accuracy !== null &&
              dashboardData.validation_accuracy !== undefined
                ? `${dashboardData.validation_accuracy}%`
                : t("notYetReviewed")}

            </strong>


            <small>
              {t("approvedVsReviewed")}
            </small>

          </div>

        </div>


        {/* AUTOMATION RATE */}

        <div className="analytics-kpi">

          <div className="analytics-kpi-icon">
            <Zap size={20} />
          </div>


          <div>

            <span>
              {t("automationRate")}
            </span>


            <strong>
              {dashboardData.automation_rate ?? 0}%
            </strong>


            <small>
              {t("docsProcessedNoReview")}
            </small>

          </div>

        </div>


        {/* DATA ISSUES */}

        <div className="analytics-kpi">

          <div
            className="analytics-kpi-icon"
            style={{
              background: "#fff7ed",
              color: "#c2410c",
            }}
          >
            <AlertTriangle size={20} />
          </div>


          <div>

            <span>
              {t("dataIssuesFlagged")}
            </span>


            <strong>
              {dataIssues}
            </strong>


            <small>
              {t("missingMetadataConflicts")}
            </small>

          </div>

        </div>

      </div>


      {/* =====================================================
          PRODUCTION + QUICK STATS
          ===================================================== */}

      <div className="dashboard-grid">


        {/* ===================================================
            PRODUCTION OVERVIEW
            =================================================== */}

        <div className="chart-card">

          <div className="card-header">

            <div>

              <h3>
                {t("productionOverview")}
              </h3>


              <p>
                {t("productionTrendDesc")}
              </p>

            </div>

          </div>


          <div className="chart-container">

            {productionByYear.length > 0 ? (

              <ResponsiveContainer
                width="100%"
                height={300}
              >

                <LineChart
                  data={productionByYear}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />


                  <XAxis
                    dataKey="year"
                  />


                  <YAxis />


                  <Tooltip />


                  <Line
                    type="monotone"
                    dataKey="production"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                  />

                </LineChart>

              </ResponsiveContainer>

            ) : (

              <p className="chart-empty">
                {t("noProductionData")}
              </p>

            )}

          </div>

        </div>


        {/* ===================================================
            QUICK STATS
            =================================================== */}

        <div className="activity-card">

          <div className="card-header">

            <div>

              <h3>
                {t("quickStats")}
              </h3>


              <p>
                {t("quickStatsDesc")}
              </p>

            </div>

          </div>


          {/* TOTAL DOCUMENTS */}

          <div className="activity-item">

            <div className="activity-icon">
              <FileText size={18} />
            </div>


            <div>

              <strong>
                {analytics?.document_count ?? 0}{" "}
                {t("totalDocuments")}
              </strong>


              <span>
                {dashboardData.processed_documents ?? 0}{" "}
                {t("processedSuccessfully")}
              </span>

            </div>

          </div>


          {/* EXTRACTED RECORDS */}

          <div className="activity-item">

            <div className="activity-icon">
              <Database size={18} />
            </div>


            <div>

              <strong>
                {analytics?.data_records ?? 0}{" "}
                {t("extractedRecords")}
              </strong>


              <span>
                {t("acrossAllSources")}
              </span>

            </div>

          </div>


          {/* TOTAL REPORTS */}

          <div className="activity-item">

            <div className="activity-icon">
              <FileBarChart size={18} />
            </div>


            <div>

              <strong>
                {dashboardData.reports_generated ?? 0}{" "}
                {t("totalReports")}
              </strong>


              <span>
                {t("totalToDate")}
              </span>

            </div>

          </div>


          {/* TOTAL PRODUCTION */}

          <div className="activity-item">

            <div className="activity-icon">
              <Target size={18} />
            </div>


            <div>

              <strong>
                {analytics?.total_production ?? 0}{" "}
                {t("totalProductionMT")}
              </strong>


              <span>
                {t("sumAcrossDocs")}
              </span>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}


export default Dashboard;