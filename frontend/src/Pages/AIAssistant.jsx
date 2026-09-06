import { useEffect, useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  FileText,
  BarChart3,
  Search,
  Loader2,
  FileSignature,
  Download,
  BookOpen,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const SUGGESTIONS = [
  {
    icon: FileText,
    title: "Production Summary",
    text: "Summarize the latest coal production reports.",
  },
  {
    icon: BarChart3,
    title: "Production Analysis",
    text: "Compare production trends across the last 5 years.",
  },
  {
    icon: Search,
    title: "Find Information",
    text: "Find geological information related to a selected mine.",
  },
];

function AIAssistant() {
  const { authFetch, user } = useAuth();
  const canDraft = user?.role === "Admin" || user?.role === "Editor";

  const [mode, setMode] = useState("ask");
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    authFetch("/api/ai/history")
      .then((response) => response.json())
      .then((data) => {
        const loaded = (data.messages || []).map((m) => ({
          role: m.role,
          text: m.content,
          sources: m.sources,
        }));
        setMessages(loaded);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error("Failed to load chat history:", err);
        setLoadingHistory(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearHistory = async () => {
    try {
      await authFetch("/api/ai/history", { method: "DELETE" });
      setMessages([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInputValue("");
    setSending(true);

    try {
      const response = await authFetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "AI Assistant is not available right now.");
      }

      const data = await response.json();

      const uniqueSources = Array.from(
        new Map((data.sources || []).map((s) => [s.document_id, s])).values()
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer || "No response received.",
          sources: uniqueSources,
        },
      ]);
    } catch (err) {
      console.error("AI Assistant error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const sendDraftRequest = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInputValue("");
    setSending(true);

    try {
      const response = await authFetch("/api/ai/draft-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not draft a response.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.draft.content,
          draftId: data.draft.id,
          displayName: data.draft.display_name,
        },
      ]);
    } catch (err) {
      console.error("Draft error:", err);
      setError(err.message || "Something went wrong drafting the response.");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (mode === "draft") {
      sendDraftRequest(inputValue);
    } else {
      sendMessage(inputValue);
    }
  };

  const downloadDraft = async (draftId, displayName) => {
    try {
      const response = await authFetch(`/api/ai/drafts/${draftId}/download`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = displayName || "response_draft.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Draft download error:", error);
    }
  };

  return (
    <div className="ai-page">
      <div className="page-header">
        <div>
          <p className="page-label">ARTIFICIAL INTELLIGENCE</p>
          <h1>AI Assistant</h1>
          <p className="page-description">
            Ask questions and retrieve insights from organizational
            geological, mining and production documents.
          </p>
        </div>

        <div className="ai-status">
          <span></span>
          AI System Ready
        </div>
      </div>

      <div className="ai-mode-toggle">
        {canDraft && (
          <>
            <button
              className={mode === "ask" ? "mode-button active" : "mode-button"}
              onClick={() => setMode("ask")}
            >
              <Bot size={15} /> Ask Questions
            </button>
            <button
              className={mode === "draft" ? "mode-button active" : "mode-button"}
              onClick={() => setMode("draft")}
            >
              <FileSignature size={15} /> Draft Formal Response
            </button>
          </>
        )}

        {messages.length > 0 && (
          <button className="mode-button" onClick={clearHistory} style={{ marginLeft: "auto" }}>
            <Trash2 size={15} /> Clear Chat
          </button>
        )}
      </div>

      <div className="ai-workspace">
        <div className="ai-chat-card">
          <div className="ai-chat-header">
            <div className="ai-identity">
              <div className="ai-avatar">
                <Bot size={22} />
              </div>

              <div>
                <h3>GeoMine Intelligence</h3>
                <span>
                  {mode === "draft"
                    ? "Formal Response Drafting Mode"
                    : "Document-grounded AI Assistant"}
                </span>
              </div>
            </div>

            <div className="ai-badge">
              <Sparkles size={14} />
              AI
            </div>
          </div>

          <div className="chat-area">
            {loadingHistory ? (
              <div className="documents-loading">
                <Loader2 size={22} className="spin" />
                <span>Loading conversation...</span>
              </div>
            ) : messages.length === 0 ? (
              <>
                <div className="welcome-message">
                  <div className="large-ai-icon">
                    <Bot size={32} />
                  </div>

                  <h2>{mode === "draft" ? "Describe the inquiry" : "How can I help you?"}</h2>

                  <p>
                    {mode === "draft"
                      ? "Paste or describe the parliamentary or administrative inquiry, and I'll draft a formal, source-cited response you can review and download."
                      : "Ask questions about geological data, mining operations, production figures, reports and historical records."}
                  </p>
                </div>

                {mode === "ask" && (
                  <div className="suggestion-grid">
                    {SUGGESTIONS.map((suggestion) => {
                      const Icon = suggestion.icon;

                      return (
                        <button
                          className="suggestion-card"
                          key={suggestion.title}
                          onClick={() => sendMessage(suggestion.text)}
                        >
                          <div className="suggestion-icon">
                            <Icon size={18} />
                          </div>

                          <div>
                            <strong>{suggestion.title}</strong>
                            <span>{suggestion.text}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="chat-messages">
                {messages.map((message, index) => (
                  <div key={index} className={`chat-message ${message.role}`}>
                    <div>{message.text}</div>

                    {message.sources && message.sources.length > 0 && (
                      <div className="evidence-panel">
                        <div className="evidence-panel-header">
                          <BookOpen size={13} /> Evidence
                        </div>
                        <div className="evidence-chip-list">
                          {message.sources.map((source) => (
                            <span className="evidence-chip" key={source.document_id}>
                              {source.document_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.draftId && (
                      <>
                        <div className="verification-badge">
                          AI-compiled from available documents &mdash; pending officer review
                        </div>
                        <button
                          className="draft-download-button"
                          onClick={() => downloadDraft(message.draftId, message.displayName)}
                        >
                          <Download size={14} /> Download as Word
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {sending && (
                  <div className="chat-message assistant">
                    <Loader2 size={16} className="spin" /> {mode === "draft" ? "Drafting..." : "Thinking..."}
                  </div>
                )}
              </div>
            )}

            {error && <div className="ai-error">{error}</div>}
          </div>

          <form className="chat-input-section" onSubmit={handleSubmit}>
            <div className="chat-input">
              <input
                type="text"
                placeholder={
                  mode === "draft"
                    ? "Describe the inquiry to respond to..."
                    : "Ask GeoMine AI a question..."
                }
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                disabled={sending}
              />

              <button type="submit" className="send-button" disabled={sending || !inputValue.trim()}>
                <Send size={18} />
              </button>
            </div>

            <p className="ai-disclaimer">
              AI-generated responses should be verified against
              authoritative organizational records.
            </p>
          </form>
        </div>

        <div className="ai-side-panel">
          <div className="ai-info-card">
            <div className="info-card-icon">
              <Sparkles size={19} />
            </div>

            <h3>AI Capabilities</h3>

            <div className="capability">
              <span className="capability-dot"></span>
              Document question answering
            </div>

            <div className="capability">
              <span className="capability-dot"></span>
              Multi-document summarization
            </div>

            <div className="capability">
              <span className="capability-dot"></span>
              Evidence-backed answers
            </div>

            {canDraft && (
              <div className="capability">
                <span className="capability-dot"></span>
                Formal inquiry response drafting
              </div>
            )}

            <div className="capability">
              <span className="capability-dot"></span>
              Persistent conversation history
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIAssistant;