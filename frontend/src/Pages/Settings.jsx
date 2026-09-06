import { useEffect, useState } from "react";
import {
  User,
  Shield,
  Database,
  Bell,
  Brain,
  CheckCircle2,
  Trash2,
  UserPlus,
  Loader2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function Settings() {
  const { user, authFetch } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const isAdmin = user?.role === "Admin";

  const [activeTab, setActiveTab] = useState("general");

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("Viewer");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchUsers = () => {
    if (!isAdmin) return;
    setLoadingUsers(true);

    authFetch("/api/auth/users")
      .then((response) => response.json())
      .then((data) => setUsers(data.users || []))
      .catch((error) => console.error("Failed to load users:", error))
      .finally(() => setLoadingUsers(false));
  };

  const fetchLogs = () => {
    if (!isAdmin) return;
    setLoadingLogs(true);

    authFetch("/api/audit-logs")
      .then((response) => response.json())
      .then((data) => setLogs(data.logs || []))
      .catch((error) => console.error("Failed to load audit logs:", error))
      .finally(() => setLoadingLogs(false));
  };

  const fetchNotifications = () => {
    setLoadingNotifications(true);

    authFetch("/api/notifications")
      .then((response) => response.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      })
      .catch((error) => console.error("Failed to load notifications:", error))
      .finally(() => setLoadingNotifications(false));
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === "notifications") {
      fetchNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const markAllRead = async () => {
    await authFetch("/api/notifications/read-all", { method: "POST" });
    fetchNotifications();
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setFormError("");
    setCreating(true);

    try {
      const response = await authFetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not create user");
      }

      setNewUsername("");
      setNewPassword("");
      setNewRole("Viewer");
      fetchUsers();
      fetchLogs();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      const response = await authFetch(`/api/auth/users/${userId}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not delete user");
      }

      fetchUsers();
      fetchLogs();
    } catch (error) {
      console.error("Delete user error:", error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const timeAgo = (dateString) => {
    if (!dateString) return "";
    const diffMs = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const NAV_ITEMS = [
    { id: "general", label: "General", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "aiConfiguration", label: "AI Configuration", icon: Brain },
    { id: "dataProcessing", label: "Data Processing", icon: Database },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <p className="page-label">SYSTEM ADMINISTRATION</p>
          <h1>Settings</h1>
          <p className="page-description">
            Configure platform preferences, AI behavior, security and data
            processing settings.
          </p>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-navigation">
          <div className="settings-nav-title">SETTINGS</div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeTab === item.id ? "settings-nav-item active" : "settings-nav-item"}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="settings-content">
          {activeTab === "general" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon"><User size={18} /></div>
                <div>
                  <h3>Signed In As</h3>
                  <p>Your current session</p>
                </div>
              </div>

              <div className="settings-form-grid">
                <div className="settings-field">
                  <label>Username</label>
                  <input type="text" value={user?.username || ""} readOnly />
                </div>

                <div className="settings-field">
                  <label>Role</label>
                  <input type="text" value={user?.role || ""} readOnly />
                </div>

                <div className="settings-field">
                  <label>Interface Language</label>
                  <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
                    <option value="en">English</option>
                    <option value="hi">हिंदी (Hindi)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "aiConfiguration" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon"><Brain size={18} /></div>
                <div>
                  <h3>AI Configuration</h3>
                  <p>Current AI-assisted analysis behavior</p>
                </div>
              </div>

              <div className="settings-option">
                <div>
                  <strong>Source-grounded responses</strong>
                  <span>AI Assistant answers are generated only from text found in your uploaded documents.</span>
                </div>
                <div className="toggle active"><div></div></div>
              </div>

              <div className="settings-option">
                <div>
                  <strong>Chat history</strong>
                  <span>Your AI Assistant conversations are saved and restored automatically.</span>
                </div>
                <div className="toggle active"><div></div></div>
              </div>

              <div className="settings-option">
                <div>
                  <strong>Formal response drafting</strong>
                  <span>Admin and Editor roles can generate source-cited drafts for official inquiries.</span>
                </div>
                <div className="toggle active"><div></div></div>
              </div>
            </div>
          )}

          {activeTab === "dataProcessing" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon"><Database size={18} /></div>
                <div>
                  <h3>Data Processing</h3>
                  <p>Document processing and validation</p>
                </div>
              </div>

              <div className="processing-grid">
                <div className="processing-item">
                  <span>OCR Engine</span>
                  <strong>Ready</strong>
                  <CheckCircle2 size={15} />
                </div>

                <div className="processing-item">
                  <span>Document Parser</span>
                  <strong>Ready</strong>
                  <CheckCircle2 size={15} />
                </div>

                <div className="processing-item">
                  <span>Fact Extraction</span>
                  <strong>Ready</strong>
                  <CheckCircle2 size={15} />
                </div>

                <div className="processing-item">
                  <span>Mining Record Detection</span>
                  <strong>Ready</strong>
                  <CheckCircle2 size={15} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-icon"><Shield size={18} /></div>
                  <div>
                    <h3>Security & Access</h3>
                    <p>Platform security configuration</p>
                  </div>
                </div>

                <div className="security-list">
                  <div>
                    <span>Authentication</span>
                    <strong>JWT session (active)</strong>
                  </div>

                  <div>
                    <span>Password Storage</span>
                    <strong>Hashed & salted (PBKDF2)</strong>
                  </div>

                  <div>
                    <span>Audit Logging</span>
                    <strong>Enabled</strong>
                  </div>

                  <div>
                    <span>Role Based Access</span>
                    <strong>Admin / Editor / Viewer</strong>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <>
                  <div className="settings-card">
                    <div className="settings-card-header">
                      <div className="settings-card-icon"><UserPlus size={18} /></div>
                      <div>
                        <h3>User Management</h3>
                        <p>Create and manage platform accounts</p>
                      </div>
                    </div>

                    <form className="settings-form-grid" onSubmit={handleCreateUser}>
                      <div className="settings-field">
                        <label>Username</label>
                        <input type="text" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} required />
                      </div>

                      <div className="settings-field">
                        <label>Password</label>
                        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                      </div>

                      <div className="settings-field">
                        <label>Role</label>
                        <select value={newRole} onChange={(event) => setNewRole(event.target.value)}>
                          <option>Admin</option>
                          <option>Editor</option>
                          <option>Viewer</option>
                        </select>
                      </div>

                      <div className="settings-field">
                        <label>&nbsp;</label>
                        <button type="submit" className="generate-button" disabled={creating}>
                          {creating ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
                          {creating ? "Creating..." : "Add User"}
                        </button>
                      </div>
                    </form>

                    {formError && <div className="dashboard-error">{formError}</div>}

                    <div className="table-container">
                      {loadingUsers ? (
                        <p>Loading...</p>
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>USERNAME</th>
                              <th>ROLE</th>
                              <th>CREATED</th>
                              <th></th>
                            </tr>
                          </thead>

                          <tbody>
                            {users.map((account) => (
                              <tr key={account.id}>
                                <td>{account.username}</td>
                                <td>{account.role}</td>
                                <td>{formatDate(account.created_at)}</td>
                                <td>
                                  {account.id !== user?.id && (
                                    <button className="more-button" onClick={() => handleDeleteUser(account.id)} aria-label="Delete user">
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  <div className="settings-card">
                    <div className="settings-card-header">
                      <div className="settings-card-icon"><Shield size={18} /></div>
                      <div>
                        <h3>Audit Log</h3>
                        <p>Recent account and data actions</p>
                      </div>
                    </div>

                    <div className="table-container">
                      {loadingLogs ? (
                        <p>Loading audit log...</p>
                      ) : logs.length === 0 ? (
                        <p>No activity recorded yet.</p>
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>USER</th>
                              <th>ACTION</th>
                              <th>DETAILS</th>
                              <th>WHEN</th>
                            </tr>
                          </thead>

                          <tbody>
                            {logs.map((log) => (
                              <tr key={log.id}>
                                <td>{log.username}</td>
                                <td>{log.action}</td>
                                <td>{log.details || "-"}</td>
                                <td>{formatDate(log.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "notifications" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon"><Bell size={18} /></div>
                <div>
                  <h3>Notifications</h3>
                  <p>{unreadCount} unread notification(s)</p>
                </div>
              </div>

              {unreadCount > 0 && (
                <button className="secondary-button" onClick={markAllRead} style={{ marginBottom: 16 }}>
                  Mark all as read
                </button>
              )}

              <div className="table-container">
                {loadingNotifications ? (
                  <p>Loading...</p>
                ) : notifications.length === 0 ? (
                  <p>No notifications yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>MESSAGE</th>
                        <th>STATUS</th>
                        <th>WHEN</th>
                      </tr>
                    </thead>

                    <tbody>
                      {notifications.map((n) => (
                        <tr key={n.id}>
                          <td>{n.message}</td>
                          <td>{n.is_read ? "Read" : "Unread"}</td>
                          <td>{timeAgo(n.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Settings;