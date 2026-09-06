import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import MainLayout from "./layouts/MainLayout";

import Login from "./Pages/Login";
import Dashboard from "./Pages/Dashboard";
import Documents from "./Pages/Documents";
import AIAssistant from "./Pages/AIAssistant";
import Reports from "./Pages/Reports";
import Analytics from "./Pages/Analytics";
import WordCloud from "./Pages/WordCloud";
import Insights from "./Pages/Insights";
import Mines from "./Pages/Mines";
import MineProfile from "./Pages/MineProfile";
import Settings from "./Pages/Settings";
import NationalStatistics from "./Pages/NationalStatistics";
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/word-cloud" element={<ProtectedRoute><WordCloud /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
      <Route path="/mines" element={<ProtectedRoute><Mines /></ProtectedRoute>} />
      <Route path="/mines/:mineName" element={<ProtectedRoute><MineProfile /></ProtectedRoute>} />
      <Route path="/national-statistics" element={<ProtectedRoute><NationalStatistics /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;