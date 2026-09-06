import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  Search,
  FileText,
  FileSpreadsheet,
  Image,
  File,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Loader2,
  Eye,
  Check,
  XCircle,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import MineImageCarousel from "../components/MineImageCarousel";
import { SkeletonTableRows } from "../components/Skeleton";

const ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
];

function Documents() {
  const { authFetch, user } = useAuth();
  const canEdit = user?.role === "Admin" || user?.role === "Editor";

  const fileInputRef = useRef(null);
  const notificationTimerRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [notification, setNotification] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [selectedIds, setSelectedIds] = useState([]);

  const [selectedDocument, setSelectedDocument] = useState(null);
  const [modalTab, setModalTab] = useState("facts");
  const [facts, setFacts] = useState([]);
  const [pagesText, setPagesText] = useState("");
  const [pipeline, setPipeline] = useState([]);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [editingFactId, setEditingFactId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const showNotification = (title, message, type = "success") => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }

    setNotification({ title, message, type });

    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);

  const fetchDocuments = async (search = "", { silent = false } = {}) => {
    if (!silent) {
      setLoadingDocuments(true);
    }

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.append("search", search.trim());
      }

      const queryString = params.toString();
      const url = queryString
        ? `/api/documents?${queryString}`
        : "/api/documents";

      const response = await authFetch(url);

      if (!response.ok) {
        let errorMessage = "Failed to load documents.";

        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Ignore JSON parsing errors
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Document loading error:", error);

      if (!silent) {
        showNotification(
          "Could not load documents",
          error.message || "Please try again.",
          "error"
        );
      }
    } finally {
      if (!silent) {
        setLoadingDocuments(false);
      }
    }
  };

  // IMPORTANT:
  // Load documents when the Documents page is first opened.
  useEffect(() => {
    fetchDocuments();

    // We intentionally do not include fetchDocuments in the dependency array
    // because it is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasProcessingDocuments = documents.some(
    (document) =>
      document.processing_status === "Processing" ||
      document.processing_status === "Uploaded"
  );

  // Poll only while documents are processing.
  useEffect(() => {
    if (!hasProcessingDocuments) return;

    const interval = setInterval(() => {
      fetchDocuments(searchTerm, { silent: true });
    }, 3000);

    return () => clearInterval(interval);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProcessingDocuments, searchTerm]);

  const openFilePicker = () => {
    if (!uploading && canEdit) {
      fileInputRef.current?.click();
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDisplayFileType = (fileType) => {
    const type = fileType?.toUpperCase() || "";

    if (type === "XLS" || type === "XLSX" || type === "CSV") {
      return "Excel";
    }

    return type;
  };

  const getFileIcon = (type) => {
    const normalizedType = type?.toUpperCase();

    if (
      ["XLS", "XLSX", "CSV", "EXCEL"].includes(normalizedType)
    ) {
      return <FileSpreadsheet size={20} />;
    }

    if (
      ["PNG", "JPG", "JPEG", "TIF", "TIFF", "IMAGE"].includes(
        normalizedType
      )
    ) {
      return <Image size={20} />;
    }

    if (
      ["PDF", "DOC", "DOCX"].includes(normalizedType)
    ) {
      return <FileText size={20} />;
    }

    return <File size={20} />;
  };

  const getStatusIcon = (status) => {
    if (status === "Processed") {
      return <CheckCircle size={15} />;
    }

    if (status === "Processing" || status === "Uploaded") {
      return <Clock size={15} />;
    }

    return <AlertCircle size={15} />;
  };

  const isAllowedFile = (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    return ALLOWED_EXTENSIONS.includes(extension);
  };

  const uploadSingleFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await authFetch("/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.detail || `${file.name} could not be uploaded.`
      );
    }

    return data;
  };

  const uploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0 || !canEdit) {
      return;
    }

    const files = Array.from(fileList);
    const validFiles = files.filter(isAllowedFile);
    const invalidCount = files.length - validFiles.length;

    if (validFiles.length === 0) {
      showNotification(
        "Unsupported file type",
        "None of the selected files are supported formats.",
        "error"
      );
      return;
    }

    setUploading(true);
    setNotification(null);

    let successCount = 0;
    let failCount = 0;
    const failedFiles = [];

    for (let i = 0; i < validFiles.length; i++) {
      setUploadProgress(
        `Uploading ${i + 1} of ${validFiles.length}...`
      );

      try {
        await uploadSingleFile(validFiles[i]);
        successCount++;
      } catch (error) {
        console.error("Upload error:", error);

        failCount++;

        failedFiles.push(
          `${validFiles[i].name}: ${
            error.message || "Upload failed"
          }`
        );
      }
    }

    setUploading(false);
    setUploadProgress("");

    const parts = [];

    if (successCount) {
      parts.push(`${successCount} uploaded successfully`);
    }

    if (failCount) {
      parts.push(`${failCount} failed`);
    }

    if (invalidCount) {
      parts.push(
        `${invalidCount} skipped (unsupported type)`
      );
    }

    const displayedErrors = failedFiles.slice(0, 3);

    const messageParts = [
      parts.join(", "),
      ...displayedErrors,
    ].filter(Boolean);

    if (failedFiles.length > 3) {
      messageParts.push(
        `and ${failedFiles.length - 3} more error(s)`
      );
    }

    showNotification(
      failCount
        ? "Upload completed with errors"
        : "Upload complete",
      messageParts.join(" • ") || "No files processed.",
      failCount ? "error" : "success"
    );

    await fetchDocuments(searchTerm);
  };

  const handleFileChange = (event) => {
    uploadFiles(event.target.files);
    event.target.value = "";
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleDrop = (event) => {
    event.preventDefault();

    if (uploading || !canEdit) {
      return;
    }

    uploadFiles(event.dataTransfer.files);
  };

  const filteredDocuments = documents.filter((document) => {
    const matchesCategory =
      categoryFilter === "All Categories" ||
      document.category === categoryFilter;

    const matchesStatus =
      statusFilter === "All Status" ||
      document.processing_status === statusFilter;

    return matchesCategory && matchesStatus;
  });

  const totalDocuments = documents.length;

  const processedDocuments = documents.filter(
    (d) => d.processing_status === "Processed"
  ).length;

  const processingDocuments = documents.filter(
    (d) =>
      d.processing_status === "Processing" ||
      d.processing_status === "Uploaded"
  ).length;

  const reviewDocuments = documents.filter(
    (d) => d.processing_status === "Needs Review"
  ).length;

  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const allVisibleSelected =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((document) =>
      selectedIds.includes(document.id)
    );

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) =>
        prev.filter(
          (id) =>
            !filteredDocuments.some(
              (document) => document.id === id
            )
        )
      );
    } else {
      setSelectedIds((prev) => [
        ...new Set([
          ...prev,
          ...filteredDocuments.map((document) => document.id),
        ]),
      ]);
    }
  };

   const deleteSelected = async () => {
    if (selectedIds.length === 0) return;

    let deletedCount = 0;
    let failedCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await authFetch(`/api/documents/${id}`, { method: "DELETE" });
        if (response.ok) {
          deletedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error("Delete error:", error);
        failedCount++;
      }
    }

    if (deletedCount > 0) {
      showNotification("Deleted", `${deletedCount} document(s) removed.`);
    }
    if (failedCount > 0) {
      showNotification("Error", `Failed to delete ${failedCount} document(s).`);
    }

    setSelectedIds([]);
    fetchDocuments(searchTerm);
  };

  const openFactsModal = async (document) => {
    setSelectedDocument(document);
    setModalTab("facts");
    setLoadingFacts(true);
    setFacts([]);
    setPagesText("");
    setPipeline([]);

    try {
      const [
        factsResponse,
        pagesResponse,
        pipelineResponse,
      ] = await Promise.all([
        authFetch(
          `/api/documents/${document.id}/facts`
        ),
        authFetch(
          `/api/documents/${document.id}/pages`
        ),
        authFetch(
          `/api/documents/${document.id}/pipeline`
        ),
      ]);

      if (
        !factsResponse.ok ||
        !pagesResponse.ok ||
        !pipelineResponse.ok
      ) {
        throw new Error(
          "Failed to load document details."
        );
      }

      const factsData = await factsResponse.json();
      const pagesData = await pagesResponse.json();
      const pipelineData = await pipelineResponse.json();

      setFacts(factsData.facts || []);

      setPagesText(
        (pagesData.pages || [])
          .map((p) => p.text)
          .join("\n\n---\n\n")
      );

      setPipeline(pipelineData.stages || []);
    } catch (error) {
      console.error(
        "Failed to load document details:",
        error
      );

      showNotification(
        "Could not load document details",
        error.message || "Please try again.",
        "error"
      );
    } finally {
      setLoadingFacts(false);
    }
  };

  const closeFactsModal = () => {
    setSelectedDocument(null);
    setFacts([]);
    setPagesText("");
    setPipeline([]);
    setEditingFactId(null);
    setEditValue("");
  };

  const updateFact = async (factId, payload) => {
    if (!selectedDocument) {
      return;
    }

    try {
      const response = await authFetch(
        `/api/documents/${selectedDocument.id}/facts/${factId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Could not update fact"
        );
      }

      setFacts((prev) =>
        prev.map((f) =>
          f.id === factId ? data.fact : f
        )
      );

      setEditingFactId(null);
    } catch (error) {
      console.error("Update fact error:", error);

      showNotification(
        "Could not update fact",
        error.message || "Please try again.",
        "error"
      );
    }
  };

  return (
    <div
      className="documents-page"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <MineImageCarousel />

      {notification && (
        <div className={`notification ${notification.type}`}>
          <div className="notification-icon">
            {notification.type === "success" ? (
              <CheckCircle size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
          </div>

          <div className="notification-content">
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>

          <button
            className="notification-close"
            onClick={() => setNotification(null)}
            aria-label="Close notification"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <div className="page-header">
        <div>
          <p className="page-label">
            DOCUMENT INTELLIGENCE
          </p>

          <h1>Document Management</h1>

          <p className="page-description">
            Upload, organize and process geological,
            mining and administrative documents.
          </p>
        </div>

        {canEdit && (
          <button
            className="generate-button"
            onClick={openFilePicker}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Upload size={17} />
            )}

            {uploading
              ? uploadProgress || "Uploading..."
              : "Upload Documents"}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.tif,.tiff"
          onChange={handleFileChange}
        />
      </div>

      {canEdit ? (
        <div
          className="document-upload-zone"
          onClick={openFilePicker}
        >
          <div className="upload-zone-icon">
            <Upload size={24} />
          </div>

          <div>
            <strong>
              Drop one or more documents here, or click
              to upload
            </strong>

            <p>
              PDF, DOCX, XLSX, CSV and image files &mdash;
              multiple files supported
            </p>
          </div>
        </div>
      ) : (
        <div className="upload-info">
          <File size={18} />

          <div>
            <strong>View-only access</strong>

            <p>
              Your account role does not have permission
              to upload documents.
            </p>
          </div>
        </div>
      )}

      <div className="document-stats">
        <div className="document-stat">
          <span>Total Documents</span>
          <strong>
            {totalDocuments.toLocaleString()}
          </strong>
        </div>

        <div className="document-stat">
          <span>Processed</span>
          <strong>
            {processedDocuments.toLocaleString()}
          </strong>
        </div>

        <div className="document-stat">
          <span>Processing</span>
          <strong>
            {processingDocuments.toLocaleString()}
          </strong>
        </div>

        <div className="document-stat">
          <span>Needs Review</span>
          <strong>
            {reviewDocuments.toLocaleString()}
          </strong>
        </div>
      </div>

      <div className="document-toolbar">
        <div className="document-search">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search by filename or document content..."
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
          />
        </div>

        <div className="document-filters">
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value)
            }
          >
            <option>All Categories</option>
            <option>Geological</option>
            <option>Mining</option>
            <option>Production</option>
            <option>Historical</option>
            <option>Quality</option>
            <option>Uncategorized</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option>All Status</option>
            <option>Uploaded</option>
            <option>Processing</option>
            <option>Processed</option>
            <option>Needs Review</option>
          </select>
        </div>
      </div>

      {canEdit && selectedIds.length > 0 && (
        <div className="bulk-action-bar">
          <span>{selectedIds.length} selected</span>

          <button
            className="bulk-delete-button"
            onClick={deleteSelected}
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>
      )}

      <div className="documents-card">
        <div className="documents-card-header">
          <div>
            <h3>Documents</h3>

            <p>
              Documents stored in the GeoMine AI
              repository
            </p>
          </div>

          <button
            className="view-button"
            onClick={() => fetchDocuments(searchTerm)}
            disabled={loadingDocuments}
          >
            {loadingDocuments ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                {canEdit && (
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}

                <th>DOCUMENT</th>
                <th>CATEGORY</th>
                <th>SIZE</th>
                <th>STATUS</th>
                <th>DATE</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {loadingDocuments ? (
                <SkeletonTableRows
                  rows={6}
                  columns={canEdit ? 7 : 6}
                />
              ) : filteredDocuments.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 7 : 6}
                    className="empty-documents"
                  >
                    <FileText size={28} />

                    <strong>
                      No documents found
                    </strong>

                    <span>
                      Upload a document to get started.
                    </span>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((document) => {
                  const processingStatus =
                    document.processing_status ||
                    "Uploaded";

                  return (
                    <tr key={document.id}>
                      {canEdit && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(
                              document.id
                            )}
                            onChange={() =>
                              toggleSelected(
                                document.id
                              )
                            }
                          />
                        </td>
                      )}

                      <td>
                        <div className="document-name">
                          <div className="file-icon">
                            {getFileIcon(
                              document.file_type
                            )}
                          </div>

                          <div>
                            <strong>
                              {document.original_name}
                            </strong>

                            <span>
                              {getDisplayFileType(
                                document.file_type
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="category-badge">
                          {document.category ||
                            "Uncategorized"}
                        </span>
                      </td>

                      <td>
                        {formatFileSize(
                          document.file_size
                        )}
                      </td>

                      <td>
                        <span
                          className={`status-badge ${processingStatus
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {getStatusIcon(
                            processingStatus
                          )}

                          {processingStatus}
                        </span>
                      </td>

                      <td>
                        {formatDate(
                          document.created_at
                        )}
                      </td>

                      <td>
                        <button
                          className="more-button"
                          aria-label="View document details"
                          onClick={() =>
                            openFactsModal(document)
                          }
                          disabled={
                            processingStatus !==
                            "Processed"
                          }
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDocument && (
        <div
          className="modal-overlay"
          onClick={closeFactsModal}
        >
          <div
            className="modal-card"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  {selectedDocument.original_name}
                </h3>

                <p>
                  Extracted data, processing history and
                  document preview
                </p>
              </div>

              <button
                className="notification-close"
                onClick={closeFactsModal}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={
                  modalTab === "facts"
                    ? "modal-tab active"
                    : "modal-tab"
                }
                onClick={() => setModalTab("facts")}
              >
                Extracted Facts
              </button>

              <button
                className={
                  modalTab === "preview"
                    ? "modal-tab active"
                    : "modal-tab"
                }
                onClick={() =>
                  setModalTab("preview")
                }
              >
                Text Preview
              </button>

              <button
                className={
                  modalTab === "pipeline"
                    ? "modal-tab active"
                    : "modal-tab"
                }
                onClick={() =>
                  setModalTab("pipeline")
                }
              >
                Processing Pipeline
              </button>
            </div>

            <div className="modal-body">
              {loadingFacts ? (
                <div className="documents-loading">
                  <Loader2
                    size={22}
                    className="spin"
                  />

                  <span>
                    Loading document details...
                  </span>
                </div>
              ) : modalTab === "facts" ? (
                facts.length === 0 ? (
                  <p className="chart-empty">
                    No structured facts were extracted
                    from this document.
                  </p>
                ) : (
                  facts.map((fact) => {
                    const validationStatus =
                      fact.validation_status ||
                      "Pending";

                    return (
                      <div
                        className="fact-row"
                        key={fact.id}
                      >
                        <div className="fact-info">
                          <strong>
                            {fact.field_name}
                          </strong>

                          <span>
                            Page{" "}
                            {fact.source_page || "-"}{" "}
                            &middot;{" "}
                            {fact.extraction_method ||
                              "-"}
                          </span>
                        </div>

                        <div className="fact-value">
                          {editingFactId ===
                          fact.id ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(event) =>
                                setEditValue(
                                  event.target.value
                                )
                              }
                              autoFocus
                            />
                          ) : (
                            <span>
                              {fact.value}{" "}
                              {fact.unit || ""}
                            </span>
                          )}
                        </div>

                        <div
                          className={`fact-status fact-status-${validationStatus
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {validationStatus}
                        </div>

                        {canEdit && (
                          <div className="fact-actions">
                            {editingFactId ===
                            fact.id ? (
                              <button
                                className="more-button"
                                onClick={() =>
                                  updateFact(
                                    fact.id,
                                    {
                                      value:
                                        editValue,
                                    }
                                  )
                                }
                                aria-label="Save edit"
                              >
                                <Check size={16} />
                              </button>
                            ) : (
                              <button
                                className="more-button"
                                onClick={() => {
                                  setEditingFactId(
                                    fact.id
                                  );
                                  setEditValue(
                                    fact.value || ""
                                  );
                                }}
                                aria-label="Edit value"
                              >
                                Edit
                              </button>
                            )}

                            <button
                              className="more-button"
                              onClick={() =>
                                updateFact(
                                  fact.id,
                                  {
                                    validation_status:
                                      "Approved",
                                  }
                                )
                              }
                              aria-label="Approve"
                            >
                              <Check
                                size={16}
                                color="#16a34a"
                              />
                            </button>

                            <button
                              className="more-button"
                              onClick={() =>
                                updateFact(
                                  fact.id,
                                  {
                                    validation_status:
                                      "Rejected",
                                  }
                                )
                              }
                              aria-label="Reject"
                            >
                              <XCircle
                                size={16}
                                color="#dc2626"
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              ) : modalTab === "preview" ? (
                <pre className="text-preview">
                  {pagesText ||
                    "No extracted text available."}
                </pre>
              ) : (
                <div className="pipeline-timeline">
                  {pipeline.length === 0 ? (
                    <p className="chart-empty">
                      No pipeline history recorded for
                      this document.
                    </p>
                  ) : (
                    pipeline.map((stage) => {
                      const stageStatus =
                        stage.status || "Pending";

                      return (
                        <div
                          className="pipeline-step"
                          key={stage.id}
                        >
                          <div
                            className={`pipeline-dot pipeline-dot-${stageStatus
                              .toLowerCase()
                              .trim()
                              .replace(/\s+/g, "-")}`}
                          ></div>

                          <div className="pipeline-step-content">
                            <strong>
                              {stage.stage}
                            </strong>

                            <span>
                              {stageStatus}
                            </span>
                          </div>

                          <small>
                            {stage.created_at
                              ? new Date(
                                  stage.created_at
                                ).toLocaleTimeString(
                                  "en-GB",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  }
                                )
                              : ""}
                          </small>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="upload-info">
        <File size={18} />

        <div>
          <strong>Supported documents</strong>

          <p>
            PDF, scanned PDF, DOCX, XLSX, CSV and image
            files. Documents are automatically processed,
            categorized and made searchable after upload.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Documents;