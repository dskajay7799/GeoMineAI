import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User as UserIcon, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="logo-icon">G</div>
        <h2>GeoMine AI</h2>
        <p>Sign in to continue</p>

        <div className="settings-field">
          <label>Username</label>
          <div className="input-with-icon">
            <UserIcon size={17} />
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
        </div>

        <div className="settings-field">
          <label>Password</label>
          <div className="input-with-icon">
            <Lock size={17} />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
        </div>

        {error && <div className="dashboard-error">{error}</div>}

        <button type="submit" className="generate-button" disabled={submitting}>
          {submitting && <Loader2 size={16} className="spin" />}
          {submitting ? "Signing in..." : "Sign In"}
        </button>

        <p className="ai-disclaimer">
          Default admin login: <strong>admin</strong> / <strong>admin123</strong> — change this after first login.
        </p>
      </form>
    </div>
  );
}

export default Login;