import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Bot,
  FileBarChart,
  BarChart3,
  Cloud,
  ShieldAlert,
  Mountain,
  Landmark,
  Settings,
  Bell,
  Search,
  LogOut,
  Languages,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
function MainLayout({ children }) {
  const { user, logout, authFetch } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const MENU_ITEMS = [
    { name: t("dashboard"), path: "/", icon: LayoutDashboard },
    { name: t("documents"), path: "/documents", icon: FileText },
    { name: t("mines"), path: "/mines", icon: Mountain },
    { name: t("aiAssistant"), path: "/ai-assistant", icon: Bot },
    { name: t("reports"), path: "/reports", icon: FileBarChart },
    { name: t("analytics"), path: "/analytics", icon: BarChart3 },
    { name: t("wordCloud"), path: "/word-cloud", icon: Cloud },
    { name: t("insights"), path: "/insights", icon: ShieldAlert },
    { name: "National Stats", path: "/national-statistics", icon: Landmark },
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initial = user?.username ? user.username.charAt(0).toUpperCase() : "?";

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      authFetch(`/api/search?q=${encodeURIComponent(searchTerm.trim())}`)
        .then((response) => response.json())
        .then((data) => setSearchResults(data.results || []))
        .catch((error) => console.error("Search error:", error));
    }, 350);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const fetchNotifications = () => {
    authFetch("/api/notifications")
      .then((response) => response.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      })
      .catch((error) => console.error("Notifications error:", error));
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (result) => {
    setSearchOpen(false);
    setSearchTerm("");

    if (result.type === "document") navigate("/documents");
    else if (result.type === "report") navigate("/reports");
    else if (result.type === "draft") navigate("/ai-assistant");
  };

  const markNotificationRead = async (id) => {
    await authFetch(`/api/notifications/${id}/read`, { method: "POST" });
    fetchNotifications();
  };

  const markAllRead = async () => {
    await authFetch("/api/notifications/read-all", { method: "POST" });
    fetchNotifications();
  };

  const timeAgo = (dateString) => {
    if (!dateString) return "";
    const diffMs = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">G</div>

          <div>
            <h2>GeoMine AI</h2>
            <span>Mining Intelligence</span>
          </div>
        </div>

        <nav className="navigation">
          <p className="menu-title">{t("mainMenu")}</p>

          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </NavLink>
            );
          })}

          <p className="menu-title settings-title">{t("system")}</p>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              isActive ? "nav-item active" : "nav-item"
            }
          >
            <Settings size={20} />
            <span>{t("settings")}</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot"></div>

          <div>
            <strong>{t("systemOnline")}</strong>
            <span>{t("allServicesOperational")}</span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="search-box" ref={searchRef} style={{ position: "relative" }}>
            <Search size={19} />

            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
            />

            {searchOpen && searchTerm.trim() && (
              <div className="search-dropdown">
                {searchResults.length === 0 ? (
                  <div className="search-dropdown-empty">No matches found</div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      className="search-dropdown-item"
                      onClick={() => handleResultClick(result)}
                    >
                      <span className={`search-type-badge search-type-${result.type}`}>
                        {result.type}
                      </span>
                      <div>
                        <strong>{result.title}</strong>
                        <span>{result.subtitle}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="topbar-right">
                        <button
              className="notification-button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <button
              className="notification-button"
              aria-label="Toggle language"
              onClick={() => changeLanguage(language === "en" ? "hi" : "en")}
              title={language === "en" ? "Switch to Hindi" : "Switch to English"}
            >
              <Languages size={20} />
            </button>
            <div style={{ position: "relative" }} ref={notifRef}>
              <button
                className="notification-button"
                aria-label={t("notifications")}
                onClick={() => setNotifOpen((prev) => !prev)}
              >
                <Bell size={20} />
                {unreadCount > 0 && <span className="notification-dot"></span>}
              </button>

              {notifOpen && (
                <div className="notification-dropdown">
                  <div className="notification-dropdown-header">
                    <strong>{t("notifications")}</strong>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead}>{t("markAllRead")}</button>
                    )}
                  </div>

                  <div className="notification-dropdown-list">
                    {notifications.length === 0 ? (
                      <div className="search-dropdown-empty">{t("noNotifications")}</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          className={`notification-dropdown-item ${n.is_read ? "" : "unread"}`}
                          onClick={() => {
                            markNotificationRead(n.id);
                            if (n.link) navigate(n.link);
                            setNotifOpen(false);
                          }}
                        >
                          <span>{n.message}</span>
                          <small>{timeAgo(n.created_at)}</small>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="user-profile">
              <div className="avatar">{initial}</div>

              <div className="user-info">
                <strong>{user?.username || "User"}</strong>
                <span>{user?.role || ""}</span>
              </div>
            </div>

            <button
              className="notification-button"
              aria-label={t("logout")}
              onClick={handleLogout}
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="content">
          <div key={location.pathname} className="page-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;