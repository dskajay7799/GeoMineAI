import json
import logging
import re
import shutil
import uuid
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    Depends,
    BackgroundTasks,
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from docx import Document as WordDocument

from backend.database import Base, engine, get_db, SessionLocal
from backend.models import (
    Document,
    DocumentPage,
    ExtractedFact,
    Report,
    User,
    AuditLog,
    AIDraft,
    Notification,
    ProcessingStage,
    Borehole,
    MiningRecord,
    ChatMessage,
    ExternalDataSnapshot,
)
from backend.processors.document_processor import process_document
from backend.extractors.source_extractor import extract_document_facts
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_roles,
    ROLES,
)
from backend.ai_engine import (
    generate_answer,
    draft_formal_response,
    generate_insight,
    extract_mining_records_from_text,
    is_configured as is_ai_configured,
)
from backend.external_data import (
    fetch_coal_ministry_data,
    fetch_annual_reports_index,
    fetch_annual_report_chapters,
    download_pdf_bytes,
)

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("geomine_ai")

# ============================================================
# DATABASE
# ============================================================

Base.metadata.create_all(bind=engine)


def _seed_default_admin():
    db = SessionLocal()
    try:
        existing_user = db.query(User).first()
        if existing_user:
            return

        default_admin = User(
            username="admin",
            password_hash=hash_password("admin123"),
            role="Admin",
        )
        db.add(default_admin)
        db.commit()

        logger.info(
            "Default admin account created (username: admin, password: admin123). "
            "Please change this after first login."
        )
    finally:
        db.close()


_seed_default_admin()

# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="GeoMine AI API",
    description="AI-Powered Geological, Mining and Reporting Intelligence Platform",
    version="1.0.0",
)

# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# FILE STORAGE
# ============================================================

UPLOAD_DIR = Path("backend/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

REPORTS_DIR = Path("backend/reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

DRAFTS_DIR = Path("backend/drafts")
DRAFTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".csv", ".png", ".jpg", ".jpeg", ".tif", ".tiff",
}

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

REPORT_TYPES = [
    "Annual Production Report",
    "Monthly Production Report",
    "Geological Assessment Report",
    "Mining Performance Report",
    "Coal Quality Report",
    "Custom Report",
]

CATEGORY_KEYWORDS = {
    "Geological": [
        "geological", "geology", "strata", "seam", "reserve", "reserves",
        "exploration", "borehole", "drilling", "stratigraphy",
    ],
    "Mining": [
        "mining", "excavation", "opencast", "underground", "extraction",
        "blasting", "bench", "pit",
    ],
    "Production": [
        "production", "dispatch", "output", "tonnage", "target", "achievement",
    ],
    "Quality": [
        "quality", "ash content", "calorific", "moisture", "grade", "gcv",
    ],
    "Historical": [
        "historical", "archive", "annual report", "previous year", "past record",
    ],
}

SPREADSHEET_EXTENSIONS = {".xlsx", ".xls", ".csv"}

MINE_NAME_HINTS = ["mine", "colliery", "project", "block"]
PRODUCTION_HINTS = ["production", "output", "tonnage", "coal produced"]
OVERBURDEN_HINTS = ["overburden", "ob removal", "ob_removal", "stripping"]

# ============================================================
# GENERAL HELPERS
# ============================================================

def log_action(db: Session, user: Optional[User], action: str, details: Optional[str] = None):
    entry = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "system",
        action=action,
        details=details,
    )
    db.add(entry)
    db.commit()


def notify(db: Session, message: str, link: Optional[str] = None):
    entry = Notification(message=message, link=link)
    db.add(entry)
    db.commit()


def _categorize_document(text: str) -> str:
    if not text:
        return "Uncategorized"

    text_lower = text.lower()
    scores = {}

    for category, keywords in CATEGORY_KEYWORDS.items():
        scores[category] = sum(text_lower.count(keyword) for keyword in keywords)

    best_category = max(scores, key=scores.get)

    if scores[best_category] == 0:
        return "Uncategorized"

    return best_category


def _safe_float(value):
    if value is None:
        return None
    try:
        text_value = str(value).replace(",", "").strip()
        if text_value == "" or text_value.lower() == "nan":
            return None
        return float(text_value)
    except (TypeError, ValueError):
        return None


def _is_probably_numeric_series(series: pd.Series) -> bool:
    non_null = series.dropna()
    if len(non_null) == 0:
        return False
    numeric_count = pd.to_numeric(non_null, errors="coerce").notna().sum()
    return (numeric_count / len(non_null)) >= 0.6


def _is_probably_year_series(series: pd.Series, column_name: str) -> bool:
    name_lower = str(column_name).lower()
    if "year" in name_lower or "date" in name_lower:
        return True
    sample = series.dropna().astype(str).head(20)
    year_pattern = re.compile(r"^(19|20)\d{2}([-/]\d{2,4})?$")
    matches = sum(1 for value in sample if year_pattern.match(value.strip()))
    return len(sample) > 0 and (matches / len(sample)) >= 0.5


def _find_column(columns, hints):
    for column in columns:
        lower = str(column).lower()
        if any(hint in lower for hint in hints):
            return column
    return None


def _extract_unit_from_column_name(column_name) -> Optional[str]:
    match = re.search(r"\(([^)]+)\)", str(column_name))
    return match.group(1).strip() if match else None


def _read_document_dataframe(document: Document) -> Optional[pd.DataFrame]:
    file_path = UPLOAD_DIR / document.stored_name

    if not file_path.exists():
        return None

    extension = Path(document.stored_name).suffix.lower()

    try:
        if extension in [".xlsx", ".xls"]:
            return pd.read_excel(file_path, sheet_name=0)
        if extension == ".csv":
            return pd.read_csv(file_path)
    except Exception:
        logger.exception("Failed to read spreadsheet for auto-analysis")
        return None

    return None


def _extract_mining_records_from_spreadsheet(dataframe: pd.DataFrame):
    columns = list(dataframe.columns)
    mine_column = _find_column(columns, MINE_NAME_HINTS)

    if not mine_column:
        return []

    production_column = _find_column(columns, PRODUCTION_HINTS)
    overburden_column = _find_column(columns, OVERBURDEN_HINTS)

    year_column = None
    for column in columns:
        if column == mine_column:
            continue
        if _is_probably_year_series(dataframe[column], column):
            year_column = column
            break

    production_unit = _extract_unit_from_column_name(production_column) if production_column else None
    overburden_unit = _extract_unit_from_column_name(overburden_column) if overburden_column else None

    records = []

    for _, row in dataframe.iterrows():
        mine_name = str(row.get(mine_column, "")).strip()

        if not mine_name or mine_name.lower() == "nan":
            continue

        production_value = _safe_float(row.get(production_column)) if production_column else None
        overburden_value = _safe_float(row.get(overburden_column)) if overburden_column else None

        year_value = None
        if year_column is not None:
            raw_year = row.get(year_column)
            if raw_year is not None and str(raw_year).strip().lower() != "nan":
                year_value = str(raw_year).strip()

        records.append({
            "mine_name": mine_name,
            "reporting_year": year_value,
            "production": production_value,
            "production_unit": production_unit,
            "overburden": overburden_value,
            "overburden_unit": overburden_unit,
        })

    return records


def _detect_conflicts(db: Session):
    rows = (
        db.query(MiningRecord, Document.original_name)
        .join(Document, MiningRecord.document_id == Document.id)
        .filter(MiningRecord.reporting_year.isnot(None))
        .filter(MiningRecord.production.isnot(None))
        .all()
    )

    groups = {}
    for record, doc_name in rows:
        key = (record.mine_name, record.reporting_year)
        groups.setdefault(key, []).append((record, doc_name))

    conflicts = []

    for (mine_name, reporting_year), group in groups.items():
        if len(group) < 2:
            continue

        distinct_values = {round(r.production, 3) for r, _ in group}

        if len(distinct_values) > 1:
            conflicts.append({
                "mine_name": mine_name,
                "reporting_year": reporting_year,
                "field": "coal_production",
                "values": [
                    {
                        "document_id": r.document_id,
                        "document_name": name,
                        "value": r.production,
                        "unit": r.production_unit or "",
                    }
                    for r, name in group
                ],
            })

    return conflicts

# ============================================================
# ROOT / HEALTH
# ============================================================

@app.get("/")
def root():
    return {"message": "GeoMine AI Backend is running", "status": "success"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "GeoMine AI API"}

# ============================================================
# AUTH
# ============================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str


def _user_to_dict(user: User):
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@app.post("/api/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been disabled")

    token = create_access_token(user)
    log_action(db, user, "Login")

    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_dict(user),
    }


@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"status": "success", "user": _user_to_dict(current_user)}


@app.get("/api/auth/users")
def list_users(
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.asc()).all()
    return {"status": "success", "users": [_user_to_dict(user) for user in users]}


@app.post("/api/auth/users")
def create_user(
    request: UserCreateRequest,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
):
    if request.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {ROLES}")

    existing = db.query(User).filter(User.username == request.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    new_user = User(
        username=request.username,
        password_hash=hash_password(request.password),
        role=request.role,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_action(db, current_user, "Created user", f"Created '{new_user.username}' ({new_user.role})")

    return {"status": "success", "user": _user_to_dict(new_user)}


@app.delete("/api/auth/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(target_user)
    db.commit()

    log_action(db, current_user, "Deleted user", f"Deleted '{target_user.username}'")

    return {"status": "success", "message": "User deleted"}


@app.get("/api/audit-logs")
def get_audit_logs(
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
        .all()
    )

    return {
        "status": "success",
        "logs": [
            {
                "id": log.id,
                "username": log.username,
                "action": log.action,
                "details": log.details,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }

# ============================================================
# NOTIFICATIONS
# ============================================================

@app.get("/api/notifications")
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications = (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )

    unread_count = (
        db.query(Notification)
        .filter(Notification.is_read == False)  # noqa: E712
        .count()
    )

    return {
        "status": "success",
        "unread_count": unread_count,
        "notifications": [
            {
                "id": n.id,
                "message": n.message,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications
        ],
    }


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()

    return {"status": "success"}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(Notification.is_read == False).update(  # noqa: E712
        {"is_read": True}
    )
    db.commit()

    return {"status": "success"}

# ============================================================
# GLOBAL SEARCH
# ============================================================

@app.get("/api/search")
def global_search(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    term = f"%{q.strip()}%"
    results = []

    documents = (
        db.query(Document)
        .filter(or_(Document.original_name.ilike(term), Document.extracted_text.ilike(term)))
        .limit(5)
        .all()
    )

    for document in documents:
        results.append({
            "type": "document",
            "id": document.id,
            "title": document.original_name,
            "subtitle": f"{document.category} · {document.processing_status}",
        })

    reports = (
        db.query(Report)
        .filter(or_(Report.display_name.ilike(term), Report.report_type.ilike(term)))
        .limit(5)
        .all()
    )

    for report in reports:
        results.append({
            "type": "report",
            "id": report.id,
            "title": report.display_name,
            "subtitle": report.report_type,
        })

    drafts = (
        db.query(AIDraft)
        .filter(AIDraft.inquiry.ilike(term))
        .limit(5)
        .all()
    )

    for draft in drafts:
        results.append({
            "type": "draft",
            "id": draft.id,
            "title": draft.inquiry[:80],
            "subtitle": "AI Response Draft",
        })

    mines = (
        db.query(MiningRecord.mine_name)
        .filter(MiningRecord.mine_name.ilike(term))
        .distinct()
        .limit(5)
        .all()
    )

    for (mine_name,) in mines:
        results.append({
            "type": "document",
            "id": 0,
            "title": mine_name,
            "subtitle": "Mine",
        })

    return {"status": "success", "results": results}

# ============================================================
# DASHBOARD
# ============================================================

@app.get("/api/dashboard")
def dashboard_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_documents = db.query(Document).count()

    processed_documents = (
        db.query(Document)
        .filter(Document.processing_status == "Processed")
        .count()
    )

    processing_documents = (
        db.query(Document)
        .filter(Document.processing_status == "Processing")
        .count()
    )

    review_documents = (
        db.query(Document)
        .filter(Document.processing_status == "Needs Review")
        .count()
    )

    total_reports = db.query(Report).count()

    approved_facts = (
        db.query(ExtractedFact)
        .filter(ExtractedFact.validation_status == "Approved")
        .count()
    )

    rejected_facts = (
        db.query(ExtractedFact)
        .filter(ExtractedFact.validation_status == "Rejected")
        .count()
    )

    reviewed_facts = approved_facts + rejected_facts

    validation_accuracy = (
        round((approved_facts / reviewed_facts) * 100, 1)
        if reviewed_facts else None
    )

    automation_rate = (
        round((processed_documents / total_documents) * 100, 1)
        if total_documents else 0
    )

    production_records = db.query(MiningRecord).count()

    return {
        "documents_processed": total_documents,
        "production_records": production_records,
        "reports_generated": total_reports,
        "validation_accuracy": validation_accuracy,
        "automation_rate": automation_rate,
        "processed_documents": processed_documents,
        "processing_documents": processing_documents,
        "review_documents": review_documents,
    }

# ============================================================
# BACKGROUND DOCUMENT PROCESSING
# ============================================================

def log_stage(db: Session, document_id: int, stage: str, status: str = "Completed"):
    db.add(ProcessingStage(document_id=document_id, stage=stage, status=status))
    db.commit()


def process_document_background(document_id: int, stored_name: str) -> None:
    db = SessionLocal()
    document = None

    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            logger.warning("Document id %s not found for processing", document_id)
            return

        log_stage(db, document_id, "Upload Received")

        file_path = UPLOAD_DIR / stored_name

        if not file_path.exists():
            document.processing_status = "Needs Review"
            db.commit()
            log_stage(db, document_id, "File Check", "Failed")
            notify(db, f"'{document.original_name}' needs review — file missing on disk.")
            logger.error("File missing on disk: %s", file_path)
            return

        document.processing_status = "Processing"
        db.commit()

        log_stage(db, document_id, "OCR / Text Extraction", "In Progress")
        result = process_document(file_path)
        log_stage(db, document_id, "OCR / Text Extraction", "Completed")

        extracted_text = result.get("text", "")
        document.extracted_text = extracted_text

        ocr_used = result.get("ocr_used", False)
        document.ocr_used = str(ocr_used)

        pages = result.get("pages", [])
        extraction_method = result.get("extraction_method", "UNKNOWN")

        db.query(DocumentPage).filter(DocumentPage.document_id == document.id).delete()
        db.query(ExtractedFact).filter(ExtractedFact.document_id == document.id).delete()
        db.query(MiningRecord).filter(MiningRecord.document_id == document.id).delete()
        db.commit()

        for page in pages:
            db.add(
                DocumentPage(
                    document_id=document.id,
                    page_number=page.get("page", 1),
                    text=page.get("text", ""),
                    extraction_method=extraction_method,
                    confidence=0.90,
                )
            )
        db.commit()

        log_stage(db, document_id, "Structured Fact Extraction", "In Progress")

        facts = extract_document_facts(
            pages,
            extraction_method=extraction_method,
            confidence=0.90,
        )

        for fact in facts:
            db.add(
                ExtractedFact(
                    document_id=document.id,
                    field_name=fact.get("field_name"),
                    value=fact.get("value"),
                    unit=fact.get("unit"),
                    source_page=fact.get("source_page"),
                    extraction_method=fact.get("extraction_method"),
                    confidence=fact.get("confidence"),
                    validation_status=fact.get("validation_status", "Pending"),
                )
            )

        for fact in facts:
            field_name = fact.get("field_name")
            value = fact.get("value")
            unit = fact.get("unit")

            if field_name == "mine_name":
                document.mine_name = value
            elif field_name == "reporting_year":
                document.reporting_year = value
            elif field_name == "coal_production":
                document.coal_production = value
                document.coal_production_unit = unit
            elif field_name == "overburden_removal":
                document.overburden_removal = value
                document.overburden_removal_unit = unit

        log_stage(db, document_id, "Structured Fact Extraction", "Completed")

        log_stage(db, document_id, "Categorization", "In Progress")
        if extracted_text.strip():
            document.category = _categorize_document(extracted_text)
        log_stage(db, document_id, "Categorization", "Completed")

        # --------------------------------------------------------
        # LIVE MINING RECORDS — this is what powers Dashboard,
        # Mines, Insights and Analytics. Supports many mines per
        # file (spreadsheets), single-mine PDFs/DOCX with clear
        # "Mine Name:" style text, and now general narrative
        # PDFs/DOCX via AI extraction as a fallback.
        # --------------------------------------------------------

        log_stage(db, document_id, "Mining Record Extraction", "In Progress")

        extension = Path(document.stored_name).suffix.lower()

        if extension in SPREADSHEET_EXTENSIONS:
            dataframe = _read_document_dataframe(document)
            if dataframe is not None and not dataframe.empty:
                row_records = _extract_mining_records_from_spreadsheet(dataframe)
                for record in row_records:
                    db.add(MiningRecord(
                        document_id=document.id,
                        mine_name=record["mine_name"],
                        reporting_year=record["reporting_year"],
                        production=record["production"],
                        production_unit=record["production_unit"],
                        overburden=record["overburden"],
                        overburden_unit=record["overburden_unit"],
                        category=document.category,
                    ))
                if row_records:
                    document.mine_name = row_records[0]["mine_name"]

        else:
            ai_records = []

            if extracted_text.strip():
                try:
                    ai_records = extract_mining_records_from_text(extracted_text)
                except Exception:
                    logger.exception("AI mining record extraction failed for document_id=%s", document_id)
                    ai_records = []

            if ai_records:
                for record in ai_records:
                    db.add(MiningRecord(
                        document_id=document.id,
                        mine_name=record["mine_name"],
                        reporting_year=record["reporting_year"],
                        production=record["production"],
                        production_unit="MT" if record["production"] is not None else None,
                        overburden=record["overburden"],
                        overburden_unit="Mm3" if record["overburden"] is not None else None,
                        category=document.category,
                    ))
                if not document.mine_name:
                    document.mine_name = ai_records[0]["mine_name"]

            elif document.mine_name:
                db.add(MiningRecord(
                    document_id=document.id,
                    mine_name=document.mine_name,
                    reporting_year=document.reporting_year,
                    production=_safe_float(document.coal_production),
                    production_unit=document.coal_production_unit,
                    overburden=_safe_float(document.overburden_removal),
                    overburden_unit=document.overburden_removal_unit,
                    category=document.category,
                ))

        log_stage(db, document_id, "Mining Record Extraction", "Completed")

        document.processing_status = (
            "Needs Review" if result.get("document_type") == "UNSUPPORTED" else "Processed"
        )

        db.commit()
        db.refresh(document)

        if document.processing_status == "Processed":
            log_stage(db, document_id, "Verification Ready", "Completed")
            notify(db, f"'{document.original_name}' has been processed successfully.", link="/documents")
        else:
            log_stage(db, document_id, "Verification Ready", "Needs Review")
            notify(db, f"'{document.original_name}' needs review.", link="/documents")

        logger.info("Document processed successfully: %s", document.original_name)

    except Exception:
        logger.exception("Document processing error for document_id=%s", document_id)
        if document:
            try:
                document.processing_status = "Needs Review"
                db.commit()
                log_stage(db, document_id, "Processing Error", "Failed")
                notify(db, f"'{document.original_name}' needs review — processing error.", link="/documents")
            except Exception:
                db.rollback()

    finally:
        db.close()

# ============================================================
# UPLOAD DOCUMENT
# ============================================================

@app.post("/api/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    original_name = Path(file.filename).name
    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, "
                "XLSX, CSV, PNG, JPG, JPEG, TIF and TIFF."
            ),
        )

    unique_name = f"{uuid.uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / unique_name

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as error:
        logger.exception("Failed to save uploaded file")
        raise HTTPException(status_code=500, detail=f"Could not save file: {error}")
    finally:
        file.file.close()

    if file_path.stat().st_size > MAX_FILE_SIZE_BYTES:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="File exceeds maximum allowed size of 50MB")

    document = Document(
        original_name=original_name,
        stored_name=unique_name,
        file_type=extension.replace(".", "").upper(),
        file_size=file_path.stat().st_size,
        category="Uncategorized",
        processing_status="Uploaded",
    )

    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except Exception as error:
        db.rollback()
        if file_path.exists():
            file_path.unlink()
        logger.exception("Failed to save document metadata")
        raise HTTPException(
            status_code=500,
            detail=f"Could not save document metadata: {error}",
        )

    log_action(db, current_user, "Uploaded document", document.original_name)

    background_tasks.add_task(
        process_document_background,
        document.id,
        document.stored_name,
    )

    return {
        "status": "success",
        "message": "Document uploaded successfully",
        "document": {
            "id": document.id,
            "original_name": document.original_name,
            "stored_name": document.stored_name,
            "file_type": document.file_type,
            "file_size": document.file_size,
            "category": document.category,
            "processing_status": "Processing",
        },
    }

# ============================================================
# GET ALL DOCUMENTS (with optional content search)
# ============================================================

@app.get("/api/documents")
def get_documents(
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Document)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Document.original_name.ilike(term),
                Document.extracted_text.ilike(term),
            )
        )

    documents = query.order_by(Document.created_at.desc()).all()

    return {
        "status": "success",
        "count": len(documents),
        "documents": [
            {
                "id": document.id,
                "original_name": document.original_name,
                "stored_name": document.stored_name,
                "file_type": document.file_type,
                "file_size": document.file_size,
                "category": document.category,
                "processing_status": document.processing_status,
                "ocr_used": document.ocr_used,
                "mine_name": document.mine_name,
                "reporting_year": document.reporting_year,
                "coal_production": document.coal_production,
                "coal_production_unit": document.coal_production_unit,
                "overburden_removal": document.overburden_removal,
                "overburden_removal_unit": document.overburden_removal_unit,
                "created_at": document.created_at.isoformat() if document.created_at else None,
            }
            for document in documents
        ],
    }

# ============================================================
# DELETE DOCUMENT
# ============================================================

@app.delete("/api/documents/{document_id}")
def delete_document(
    document_id: int,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = UPLOAD_DIR / document.stored_name
    if file_path.exists():
        file_path.unlink()

    document_name = document.original_name

    db.delete(document)
    db.commit()

    log_action(db, current_user, "Deleted document", document_name)

    return {"status": "success", "message": "Document deleted"}

# ============================================================
# GET DOCUMENT PAGES
# ============================================================

@app.get("/api/documents/{document_id}/pages")
def get_document_pages(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    pages = (
        db.query(DocumentPage)
        .filter(DocumentPage.document_id == document_id)
        .order_by(DocumentPage.page_number.asc())
        .all()
    )

    return {
        "status": "success",
        "document_id": document_id,
        "pages": [
            {
                "page_number": page.page_number,
                "text": page.text,
                "extraction_method": page.extraction_method,
                "confidence": page.confidence,
            }
            for page in pages
        ],
    }

# ============================================================
# PROCESSING PIPELINE (per document)
# ============================================================

@app.get("/api/documents/{document_id}/pipeline")
def get_document_pipeline(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    stages = (
        db.query(ProcessingStage)
        .filter(ProcessingStage.document_id == document_id)
        .order_by(ProcessingStage.created_at.asc())
        .all()
    )

    return {
        "status": "success",
        "stages": [
            {
                "id": s.id,
                "stage": s.stage,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in stages
        ],
    }

# ============================================================
# GET DOCUMENT'S LIVE MINING RECORDS
# ============================================================

@app.get("/api/documents/{document_id}/mining-records")
def get_document_mining_records(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    records = (
        db.query(MiningRecord)
        .filter(MiningRecord.document_id == document_id)
        .order_by(MiningRecord.mine_name.asc())
        .all()
    )

    return {
        "status": "success",
        "count": len(records),
        "records": [
            {
                "id": r.id,
                "mine_name": r.mine_name,
                "reporting_year": r.reporting_year,
                "production": r.production,
                "production_unit": r.production_unit,
                "overburden": r.overburden,
                "overburden_unit": r.overburden_unit,
            }
            for r in records
        ],
    }

# ============================================================
# GET / UPDATE EXTRACTED FACTS
# ============================================================

@app.get("/api/documents/{document_id}/facts")
def get_document_facts(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    facts = (
        db.query(ExtractedFact)
        .filter(ExtractedFact.document_id == document_id)
        .order_by(ExtractedFact.source_page.asc())
        .all()
    )

    return {
        "status": "success",
        "document_id": document_id,
        "facts": [
            {
                "id": fact.id,
                "field_name": fact.field_name,
                "value": fact.value,
                "unit": fact.unit,
                "source_page": fact.source_page,
                "extraction_method": fact.extraction_method,
                "confidence": fact.confidence,
                "validation_status": fact.validation_status,
            }
            for fact in facts
        ],
    }


class FactUpdateRequest(BaseModel):
    value: Optional[str] = None
    validation_status: Optional[str] = None


@app.patch("/api/documents/{document_id}/facts/{fact_id}")
def update_document_fact(
    document_id: int,
    fact_id: int,
    request: FactUpdateRequest,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    fact = (
        db.query(ExtractedFact)
        .filter(ExtractedFact.id == fact_id, ExtractedFact.document_id == document_id)
        .first()
    )

    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    if request.validation_status is not None:
        if request.validation_status not in ["Pending", "Approved", "Rejected"]:
            raise HTTPException(status_code=400, detail="Invalid validation status")
        fact.validation_status = request.validation_status

    if request.value is not None:
        fact.value = request.value

    db.commit()
    db.refresh(fact)

    log_action(
        db, current_user, "Updated extracted fact",
        f"Doc #{document_id}, field '{fact.field_name}' -> status={fact.validation_status}",
    )

    return {
        "status": "success",
        "fact": {
            "id": fact.id,
            "field_name": fact.field_name,
            "value": fact.value,
            "unit": fact.unit,
            "source_page": fact.source_page,
            "extraction_method": fact.extraction_method,
            "confidence": fact.confidence,
            "validation_status": fact.validation_status,
        },
    }

# ============================================================
# STRUCTURED DOCUMENT DATA
# ============================================================

@app.get("/api/documents/{document_id}/structured")
def get_structured_document_data(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "status": "success",
        "document": {
            "id": document.id,
            "original_name": document.original_name,
            "mine_name": document.mine_name,
            "reporting_year": document.reporting_year,
            "coal_production": document.coal_production,
            "coal_production_unit": document.coal_production_unit,
            "overburden_removal": document.overburden_removal,
            "overburden_removal_unit": document.overburden_removal_unit,
            "processing_status": document.processing_status,
        },
    }

# ============================================================
# AI ASSISTANT (GROQ-POWERED, GROUNDED IN DOCUMENTS)
# ============================================================

class AIQueryRequest(BaseModel):
    question: str


ANALYSIS_KEYWORDS = {
    "summarize", "summarise", "summary", "analyze", "analyse", "analysis",
    "overview", "compare", "comparison", "trend", "trends", "insight",
    "insights", "report", "overall", "all documents", "everything",
}


def _split_into_snippets(text: str, chunk_size: int = 1000):
    text = text.strip()
    if not text:
        return []
    return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]


def _score_snippet(snippet: str, keywords: list[str]) -> int:
    snippet_lower = snippet.lower()
    return sum(snippet_lower.count(keyword) for keyword in keywords)


def _is_broad_analysis_question(question: str) -> bool:
    question_lower = question.lower()
    return any(keyword in question_lower for keyword in ANALYSIS_KEYWORDS)


def _retrieve_keyword_context(db: Session, question: str, top_n: int = 6):
    keywords = [
        word for word in re.findall(r"[a-zA-Z0-9]+", question.lower())
        if len(word) > 2
    ]

    if not keywords:
        return []

    documents = (
        db.query(Document)
        .filter(Document.extracted_text.isnot(None))
        .filter(Document.extracted_text != "")
        .all()
    )

    scored_matches = []

    for document in documents:
        for snippet in _split_into_snippets(document.extracted_text):
            score = _score_snippet(snippet, keywords)
            if score > 0:
                scored_matches.append({
                    "score": score,
                    "snippet": snippet.strip(),
                    "document_id": document.id,
                    "document_name": document.original_name,
                })

    scored_matches.sort(key=lambda match: match["score"], reverse=True)
    return scored_matches[:top_n]


def _retrieve_broad_context(db: Session, max_documents: int = 8, chars_per_doc: int = 2500):
    documents = (
        db.query(Document)
        .filter(Document.processing_status == "Processed")
        .filter(Document.extracted_text.isnot(None))
        .filter(Document.extracted_text != "")
        .order_by(Document.created_at.desc())
        .limit(max_documents)
        .all()
    )

    context = []

    for document in documents:
        text = document.extracted_text.strip()
        snippet = text[:chars_per_doc]

        context.append({
            "score": 1,
            "snippet": snippet,
            "document_id": document.id,
            "document_name": document.original_name,
        })

    return context


def _build_structured_summary(db: Session, mine_name: Optional[str] = None, period: Optional[str] = None) -> str:
    query = db.query(MiningRecord, Document.original_name).join(
        Document, MiningRecord.document_id == Document.id
    )

    if mine_name and mine_name != "All Mines":
        query = query.filter(MiningRecord.mine_name == mine_name)

    if period:
        query = query.filter(MiningRecord.reporting_year == period)

    rows = query.order_by(MiningRecord.created_at.desc()).limit(60).all()

    lines = []

    for record, doc_name in rows:
        parts = [f"Document: {doc_name}", f"Mine: {record.mine_name}"]

        if record.reporting_year:
            parts.append(f"Reporting Year: {record.reporting_year}")
        if record.production is not None:
            unit = record.production_unit or ""
            parts.append(f"Coal Production: {record.production} {unit}".strip())
        if record.overburden is not None:
            unit = record.overburden_unit or ""
            parts.append(f"Overburden Removal: {record.overburden} {unit}".strip())

        lines.append(" | ".join(parts))

    return "\n".join(lines)


@app.post("/api/ai/query")
def ai_query(
    request: AIQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    broad_mode = _is_broad_analysis_question(question)

    if broad_mode:
        context_snippets = _retrieve_broad_context(db)
        if not context_snippets:
            context_snippets = _retrieve_keyword_context(db, question)
    else:
        context_snippets = _retrieve_keyword_context(db, question)
        if not context_snippets:
            context_snippets = _retrieve_broad_context(db, max_documents=5, chars_per_doc=1200)

    structured_summary = _build_structured_summary(db)

    if not is_ai_configured():
        if not context_snippets:
            answer = (
                "I couldn't find anything related to that in the uploaded "
                "documents. Try uploading a relevant document or rephrasing "
                "your question."
            )
        else:
            answer = "\n\n".join(
                f"From \"{match['document_name']}\": {match['snippet']}"
                for match in context_snippets
            )

        return {
            "status": "success",
            "answer": answer,
            "sources": [
                {"document_id": m["document_id"], "document_name": m["document_name"]}
                for m in context_snippets
            ],
        }

    try:
        answer = generate_answer(question, context_snippets, structured_summary)
    except Exception as error:
        import traceback
        print("=" * 60)
        print("AI ERROR:", repr(error))
        traceback.print_exc()
        print("=" * 60)
        raise HTTPException(
            status_code=502,
            detail=f"The AI service is temporarily unavailable: {error}",
        )

    log_action(db, current_user, "AI query", question[:200])

    source_list = [
        {"document_id": m["document_id"], "document_name": m["document_name"]}
        for m in context_snippets
    ]

    db.add(ChatMessage(user_id=current_user.id, role="user", content=question, mode="ask"))
    db.add(ChatMessage(
        user_id=current_user.id, role="assistant", content=answer, mode="ask",
        sources=json.dumps(source_list),
    ))
    db.commit()

    return {
        "status": "success",
        "answer": answer,
        "sources": source_list,
    }

# ============================================================
# AI FORMAL RESPONSE DRAFTING (parliamentary / admin inquiries)
# ============================================================

class DraftRequest(BaseModel):
    inquiry: str
    mine_name: Optional[str] = None
    period: Optional[str] = None


def _build_draft_docx(inquiry: str, content: str, file_path: Path):
    word_doc = WordDocument()
    word_doc.add_heading("Official Response Draft", level=1)

    word_doc.add_paragraph("Inquiry:")
    word_doc.add_paragraph(inquiry)

    word_doc.add_paragraph("")
    word_doc.add_paragraph("Response:")

    for paragraph in content.split("\n"):
        if paragraph.strip():
            word_doc.add_paragraph(paragraph.strip())

    word_doc.save(file_path)


@app.post("/api/ai/draft-response")
def draft_response(
    request: DraftRequest,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    inquiry = request.inquiry.strip()

    if not inquiry:
        raise HTTPException(status_code=400, detail="Inquiry cannot be empty")

    if not is_ai_configured():
        raise HTTPException(
            status_code=503,
            detail="AI drafting is not available because no AI provider is configured.",
        )

    context_snippets = _retrieve_broad_context(db)
    structured_summary = _build_structured_summary(db, request.mine_name, request.period)

    try:
        content = draft_formal_response(inquiry, context_snippets, structured_summary)
    except Exception as error:
        import traceback
        print("=" * 60)
        print("AI DRAFT ERROR:", repr(error))
        traceback.print_exc()
        print("=" * 60)
        raise HTTPException(
            status_code=502,
            detail=f"The AI service is temporarily unavailable: {error}",
        )

    stored_name = f"{uuid.uuid4().hex}.docx"
    file_path = DRAFTS_DIR / stored_name
    display_name = f"Response_Draft_{uuid.uuid4().hex[:8]}.docx"

    try:
        _build_draft_docx(inquiry, content, file_path)
    except Exception as error:
        logger.exception("Failed to build draft docx")
        raise HTTPException(status_code=500, detail=f"Could not generate draft file: {error}")

    draft = AIDraft(
        inquiry=inquiry,
        content=content,
        stored_name=stored_name,
        display_name=display_name,
    )

    db.add(draft)
    db.commit()
    db.refresh(draft)

    log_action(db, current_user, "Drafted formal response", inquiry[:200])
    notify(db, f"Response draft ready: {draft.display_name}", link="/ai-assistant")

    db.add(ChatMessage(user_id=current_user.id, role="user", content=inquiry, mode="draft"))
    db.add(ChatMessage(
        user_id=current_user.id, role="assistant", content=content, mode="draft",
    ))
    db.commit()

    return {
        "status": "success",
        "draft": {
            "id": draft.id,
            "inquiry": draft.inquiry,
            "content": draft.content,
            "display_name": draft.display_name,
            "created_at": draft.created_at.isoformat() if draft.created_at else None,
        },
    }


@app.get("/api/ai/drafts")
def get_drafts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    drafts = db.query(AIDraft).order_by(AIDraft.created_at.desc()).limit(30).all()

    return {
        "status": "success",
        "drafts": [
            {
                "id": draft.id,
                "inquiry": draft.inquiry,
                "display_name": draft.display_name,
                "created_at": draft.created_at.isoformat() if draft.created_at else None,
            }
            for draft in drafts
        ],
    }


@app.get("/api/ai/drafts/{draft_id}/download")
def download_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = db.query(AIDraft).filter(AIDraft.id == draft_id).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    file_path = DRAFTS_DIR / draft.stored_name

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Draft file is missing on disk")

    return FileResponse(
        path=file_path,
        filename=draft.display_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

# ============================================================
# CHAT HISTORY (AI Assistant)
# ============================================================

@app.get("/api/ai/history")
def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .limit(200)
        .all()
    )

    return {
        "status": "success",
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "mode": m.mode,
                "sources": json.loads(m.sources) if m.sources else [],
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


@app.delete("/api/ai/history")
def clear_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(ChatMessage).filter(ChatMessage.user_id == current_user.id).delete()
    db.commit()

    return {"status": "success", "message": "Chat history cleared"}

# ============================================================
# REPORTS
# ============================================================

class ReportGenerateRequest(BaseModel):
    report_type: str
    period: Optional[str] = None
    mine_name: Optional[str] = None


def _build_report_file(report_type, period, mine_name, matched_documents, file_path):
    word_doc = WordDocument()

    word_doc.add_heading(report_type, level=1)
    word_doc.add_paragraph(f"Reporting Period: {period or 'All'}")
    word_doc.add_paragraph(f"Mine / Area: {mine_name or 'All Mines'}")

    table = word_doc.add_table(rows=1, cols=5)
    table.style = "Light Grid Accent 1"

    header_cells = table.rows[0].cells
    header_cells[0].text = "Document"
    header_cells[1].text = "Mine"
    header_cells[2].text = "Reporting Year"
    header_cells[3].text = "Coal Production"
    header_cells[4].text = "Overburden Removal"

    for document in matched_documents:
        row_cells = table.add_row().cells
        row_cells[0].text = document.original_name
        row_cells[1].text = document.mine_name or "-"
        row_cells[2].text = document.reporting_year or "-"

        production = (
            f"{document.coal_production} {document.coal_production_unit or ''}".strip()
            if document.coal_production else "-"
        )
        row_cells[3].text = production

        overburden = (
            f"{document.overburden_removal} {document.overburden_removal_unit or ''}".strip()
            if document.overburden_removal else "-"
        )
        row_cells[4].text = overburden

    if not matched_documents:
        word_doc.add_paragraph(
            "No processed documents matched the selected filters."
        )

    word_doc.save(file_path)


@app.get("/api/reports/filters")
def get_report_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mine_rows = db.query(MiningRecord.mine_name).distinct().all()
    period_rows = (
        db.query(MiningRecord.reporting_year)
        .filter(MiningRecord.reporting_year.isnot(None))
        .distinct()
        .all()
    )

    return {
        "status": "success",
        "report_types": REPORT_TYPES,
        "mines": [row[0] for row in mine_rows if row[0]],
        "periods": [row[0] for row in period_rows if row[0]],
    }


@app.get("/api/reports/preview")
def preview_report(
    report_type: str,
    period: Optional[str] = None,
    mine_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(MiningRecord)

    if mine_name and mine_name != "All Mines":
        query = query.filter(MiningRecord.mine_name == mine_name)

    if period:
        query = query.filter(MiningRecord.reporting_year == period)

    matched_records = query.all()
    matched_document_ids = {r.document_id for r in matched_records}

    validation_score = None

    if matched_document_ids:
        facts = (
            db.query(ExtractedFact)
            .filter(ExtractedFact.document_id.in_(matched_document_ids))
            .all()
        )

        if facts:
            validation_score = round(
                sum(fact.confidence or 0 for fact in facts) / len(facts) * 100,
                1,
            )

    documents = (
        db.query(Document).filter(Document.id.in_(matched_document_ids)).all()
        if matched_document_ids else []
    )

    return {
        "status": "success",
        "matched_document_count": len(documents),
        "validation_score": validation_score,
        "documents": [document.original_name for document in documents[:10]],
    }


@app.post("/api/reports/generate")
def generate_report(
    request: ReportGenerateRequest,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    if request.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid report type")

    query = db.query(MiningRecord)

    if request.mine_name and request.mine_name != "All Mines":
        query = query.filter(MiningRecord.mine_name == request.mine_name)

    if request.period:
        query = query.filter(MiningRecord.reporting_year == request.period)

    matched_records = query.all()
    matched_document_ids = {r.document_id for r in matched_records}
    matched_documents = (
        db.query(Document).filter(Document.id.in_(matched_document_ids)).all()
        if matched_document_ids else []
    )

    stored_name = f"{uuid.uuid4().hex}.docx"
    file_path = REPORTS_DIR / stored_name

    try:
        _build_report_file(
            request.report_type,
            request.period,
            request.mine_name,
            matched_documents,
            file_path,
        )
    except Exception as error:
        logger.exception("Failed to build report file")
        raise HTTPException(status_code=500, detail=f"Could not generate report: {error}")

    display_name = f"{request.report_type.replace(' ', '_')}_{uuid.uuid4().hex[:8]}.docx"

    report = Report(
        report_type=request.report_type,
        period=request.period,
        mine_name=request.mine_name,
        status="Ready" if matched_documents else "Needs Review",
        stored_name=stored_name,
        display_name=display_name,
        document_count=len(matched_documents),
    )

    try:
        db.add(report)
        db.commit()
        db.refresh(report)
    except Exception as error:
        db.rollback()
        if file_path.exists():
            file_path.unlink()
        logger.exception("Failed to save report metadata")
        raise HTTPException(status_code=500, detail=f"Could not save report: {error}")

    log_action(db, current_user, "Generated report", report.display_name)
    notify(db, f"Report generated: {report.display_name}", link="/reports")

    return {
        "status": "success",
        "message": "Report generated successfully",
        "report": {
            "id": report.id,
            "report_type": report.report_type,
            "period": report.period,
            "mine_name": report.mine_name,
            "status": report.status,
            "display_name": report.display_name,
            "document_count": report.document_count,
            "created_at": report.created_at.isoformat() if report.created_at else None,
        },
    }


@app.get("/api/reports")
def get_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reports = db.query(Report).order_by(Report.created_at.desc()).all()

    return {
        "status": "success",
        "count": len(reports),
        "reports": [
            {
                "id": report.id,
                "report_type": report.report_type,
                "period": report.period,
                "mine_name": report.mine_name,
                "status": report.status,
                "display_name": report.display_name,
                "document_count": report.document_count,
                "created_at": report.created_at.isoformat() if report.created_at else None,
            }
            for report in reports
        ],
    }


@app.get("/api/reports/{report_id}/download")
def download_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = db.query(Report).filter(Report.id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    file_path = REPORTS_DIR / report.stored_name

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report file is missing on disk")

    return FileResponse(
        path=file_path,
        filename=report.display_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

# ============================================================
# ANALYTICS
# ============================================================

@app.get("/api/analytics/summary")
def analytics_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = db.query(MiningRecord).filter(MiningRecord.production.isnot(None)).all()

    production_by_year = {}
    production_by_mine = {}
    total_production = 0.0

    for record in records:
        total_production += record.production

        if record.reporting_year:
            production_by_year[record.reporting_year] = (
                production_by_year.get(record.reporting_year, 0.0) + record.production
            )

        production_by_mine[record.mine_name] = (
            production_by_mine.get(record.mine_name, 0.0) + record.production
        )

    production_by_year_list = [
        {"year": year, "production": round(value, 2)}
        for year, value in sorted(production_by_year.items())
    ]

    production_by_mine_list = [
        {"mine": mine, "production": round(value, 2)}
        for mine, value in sorted(
            production_by_mine.items(), key=lambda item: item[1], reverse=True
        )
    ][:15]

    growth_percent = None

    if len(production_by_year_list) >= 2:
        first_value = production_by_year_list[0]["production"]
        last_value = production_by_year_list[-1]["production"]

        if first_value > 0:
            growth_percent = round(((last_value - first_value) / first_value) * 100, 1)

    total_documents = db.query(Document).count()
    processed_documents = (
        db.query(Document).filter(Document.processing_status == "Processed").count()
    )

    processing_success_rate = (
        round((processed_documents / total_documents) * 100, 1)
        if total_documents else 0
    )

    data_records = db.query(ExtractedFact).count()

    facts = db.query(ExtractedFact).all()

    validation_rate = (
        round(sum(fact.confidence or 0 for fact in facts) / len(facts) * 100, 1)
        if facts else None
    )

    return {
        "status": "success",
        "production_by_year": production_by_year_list,
        "production_by_mine": production_by_mine_list,
        "total_production": round(total_production, 2),
        "growth_percent": growth_percent,
        "data_records": data_records,
        "validation_rate": validation_rate,
        "processing_success_rate": processing_success_rate,
        "document_count": total_documents,
    }

# ============================================================
# WORD CLOUD / TOPIC ANALYSIS
# ============================================================

STOPWORDS = {
    "the", "and", "for", "are", "was", "were", "this", "that", "with",
    "from", "have", "has", "had", "not", "but", "you", "your", "all",
    "can", "will", "would", "could", "should", "there", "their", "they",
    "them", "then", "than", "these", "those", "which", "what", "when",
    "where", "who", "whom", "why", "how", "into", "over", "under",
    "about", "after", "before", "during", "between", "each", "such",
    "some", "any", "more", "most", "other", "only", "own", "same",
    "also", "been", "being", "does", "did", "doing", "here", "its",
    "our", "out", "per", "may", "must", "shall", "upon", "within",
    "page", "report", "year", "years", "total", "date", "based",
}


def _tokenize(text: str):
    return re.findall(r"[a-zA-Z]{4,}", text.lower())


def _keyword_size(rank: int, total: int):
    fraction = rank / max(total, 1)
    if fraction <= 0.15:
        return "largest"
    if fraction <= 0.35:
        return "large"
    if fraction <= 0.65:
        return "medium"
    return "small"


@app.get("/api/wordcloud/analyze")
def analyze_word_cloud(
    category: Optional[str] = None,
    period: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Document)
        .filter(Document.processing_status == "Processed")
        .filter(Document.extracted_text.isnot(None))
        .filter(Document.extracted_text != "")
    )

    if category and category != "All Documents":
        query = query.filter(Document.category == category)

    if period:
        query = query.filter(Document.reporting_year == period)

    matched_documents = query.all()

    word_counts = {}

    for document in matched_documents:
        for word in _tokenize(document.extracted_text):
            if word in STOPWORDS:
                continue
            word_counts[word] = word_counts.get(word, 0) + 1

    sorted_words = sorted(word_counts.items(), key=lambda item: item[1], reverse=True)

    top_keywords_raw = sorted_words[:20]

    keywords = [
        {
            "word": word,
            "count": count,
            "size": _keyword_size(index, len(top_keywords_raw)),
        }
        for index, (word, count) in enumerate(top_keywords_raw)
    ]

    top_topics_raw = sorted_words[:8]
    max_count = top_topics_raw[0][1] if top_topics_raw else 0

    topics = [
        {
            "name": word,
            "count": count,
            "percentage": round((count / max_count) * 100) if max_count else 0,
        }
        for word, count in top_topics_raw
    ]

    keywords_identified = len(word_counts)
    topics_detected = len([word for word, count in sorted_words if count >= 3])

    return {
        "status": "success",
        "documents_analyzed": len(matched_documents),
        "keywords_identified": keywords_identified,
        "topics_detected": topics_detected,
        "keywords": keywords,
        "topics": topics,
    }


@app.get("/api/wordcloud/filters")
def get_wordcloud_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    category_rows = db.query(Document.category).distinct().all()
    period_rows = (
        db.query(MiningRecord.reporting_year)
        .filter(MiningRecord.reporting_year.isnot(None))
        .distinct()
        .all()
    )

    return {
        "status": "success",
        "categories": [row[0] for row in category_rows if row[0]],
        "periods": [row[0] for row in period_rows if row[0]],
    }

# ============================================================
# INSIGHTS: DATA CONFLICT DETECTOR + DATA QUALITY DASHBOARD
# ============================================================

@app.get("/api/insights/conflicts")
def get_conflicts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conflicts = _detect_conflicts(db)

    return {
        "status": "success",
        "count": len(conflicts),
        "conflicts": conflicts,
    }


@app.get("/api/insights/quality")
def get_data_quality(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    processed_documents = (
        db.query(Document)
        .filter(Document.processing_status == "Processed")
        .all()
    )

    total_processed = len(processed_documents)

    name_counts = {}
    for document in processed_documents:
        name_counts[document.original_name] = name_counts.get(document.original_name, 0) + 1

    missing_metadata_count = 0
    low_extraction_count = 0
    duplicate_count = 0
    flagged_documents = 0

    document_ids_with_records = {
        r[0] for r in db.query(MiningRecord.document_id).distinct().all()
    }

    for document in processed_documents:
        has_issue = False

        if document.id not in document_ids_with_records:
            missing_metadata_count += 1
            has_issue = True

        text_length = len(document.extracted_text or "")
        if text_length < 200:
            low_extraction_count += 1
            has_issue = True

        if name_counts.get(document.original_name, 0) > 1:
            duplicate_count += 1
            has_issue = True

        if has_issue:
            flagged_documents += 1

    conflicts = _detect_conflicts(db)
    conflicts_count = len(conflicts)

    quality_score = (
        round(((total_processed - flagged_documents) / total_processed) * 100, 1)
        if total_processed else None
    )

    return {
        "status": "success",
        "total_processed": total_processed,
        "quality_score": quality_score,
        "missing_metadata_count": missing_metadata_count,
        "low_extraction_count": low_extraction_count,
        "duplicate_count": duplicate_count,
        "conflicts_count": conflicts_count,
    }

# ============================================================
# MINE PROFILES (live, from MiningRecord — supports many mines
# per uploaded file)
# ============================================================

@app.get("/api/mines")
def get_mines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = db.query(MiningRecord).all()

    mines = {}

    for record in records:
        entry = mines.setdefault(record.mine_name, {
            "mine_name": record.mine_name,
            "document_ids": set(),
            "total_production": 0.0,
            "years": set(),
            "latest_updated": None,
        })

        entry["document_ids"].add(record.document_id)

        if record.production is not None:
            entry["total_production"] += record.production

        if record.reporting_year:
            entry["years"].add(record.reporting_year)

        if not entry["latest_updated"] or record.created_at > entry["latest_updated"]:
            entry["latest_updated"] = record.created_at

    mine_list = [
        {
            "mine_name": entry["mine_name"],
            "document_count": len(entry["document_ids"]),
            "total_production": round(entry["total_production"], 2),
            "years": sorted(entry["years"]),
            "latest_updated": entry["latest_updated"].isoformat() if entry["latest_updated"] else None,
        }
        for entry in mines.values()
    ]

    mine_list.sort(key=lambda m: m["total_production"], reverse=True)

    return {"status": "success", "count": len(mine_list), "mines": mine_list}


@app.get("/api/mines/{mine_name}/profile")
def get_mine_profile(
    mine_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = (
        db.query(MiningRecord)
        .filter(MiningRecord.mine_name == mine_name)
        .all()
    )

    if not records:
        raise HTTPException(status_code=404, detail="No records found for this mine")

    document_ids = {r.document_id for r in records}
    documents = db.query(Document).filter(Document.id.in_(document_ids)).all()

    total_production = sum(r.production for r in records if r.production is not None)
    total_overburden = sum(r.overburden for r in records if r.overburden is not None)
    years = sorted({r.reporting_year for r in records if r.reporting_year})

    categories = {}
    for document in documents:
        categories[document.category] = categories.get(document.category, 0) + 1

    mine_conflicts = [
        conflict for conflict in _detect_conflicts(db)
        if conflict["mine_name"] == mine_name
    ]

    missing_metadata = sum(1 for r in records if not r.reporting_year)

    doc_by_id = {d.id: d for d in documents}

    return {
        "status": "success",
        "mine_name": mine_name,
        "document_count": len(documents),
        "total_production": round(total_production, 2),
        "total_overburden": round(total_overburden, 2),
        "years": years,
        "categories": categories,
        "conflicts_count": len(mine_conflicts),
        "conflicts": mine_conflicts,
        "missing_metadata_count": missing_metadata,
        "documents": [
            {
                "id": r.id,
                "original_name": doc_by_id[r.document_id].original_name if r.document_id in doc_by_id else "Unknown",
                "category": doc_by_id[r.document_id].category if r.document_id in doc_by_id else "Uncategorized",
                "reporting_year": r.reporting_year,
                "coal_production": r.production,
                "coal_production_unit": r.production_unit,
                "overburden_removal": r.overburden,
                "overburden_removal_unit": r.overburden_unit,
                "processing_status": doc_by_id[r.document_id].processing_status if r.document_id in doc_by_id else "-",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }

# ============================================================
# BOREHOLES (user-entered geological layout points per mine)
# ============================================================

class BoreholeCreateRequest(BaseModel):
    label: str
    x: float
    y: float
    depth: Optional[str] = None
    notes: Optional[str] = None


@app.get("/api/mines/{mine_name}/boreholes")
def get_boreholes(
    mine_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    boreholes = (
        db.query(Borehole)
        .filter(Borehole.mine_name == mine_name)
        .order_by(Borehole.created_at.asc())
        .all()
    )

    return {
        "status": "success",
        "boreholes": [
            {
                "id": b.id,
                "label": b.label,
                "x": b.x,
                "y": b.y,
                "depth": b.depth,
                "notes": b.notes,
                "created_by": b.created_by,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in boreholes
        ],
    }


@app.post("/api/mines/{mine_name}/boreholes")
def create_borehole(
    mine_name: str,
    request: BoreholeCreateRequest,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    if not request.label.strip():
        raise HTTPException(status_code=400, detail="Label is required")

    if not (0 <= request.x <= 500) or not (0 <= request.y <= 300):
        raise HTTPException(status_code=400, detail="Coordinates must be within the 500x300 layout grid")

    borehole = Borehole(
        mine_name=mine_name,
        label=request.label.strip(),
        x=request.x,
        y=request.y,
        depth=request.depth,
        notes=request.notes,
        created_by=current_user.username,
    )

    db.add(borehole)
    db.commit()
    db.refresh(borehole)

    log_action(db, current_user, "Added borehole point", f"{mine_name}: {borehole.label}")

    return {
        "status": "success",
        "borehole": {
            "id": borehole.id,
            "label": borehole.label,
            "x": borehole.x,
            "y": borehole.y,
            "depth": borehole.depth,
            "notes": borehole.notes,
            "created_by": borehole.created_by,
            "created_at": borehole.created_at.isoformat() if borehole.created_at else None,
        },
    }


@app.delete("/api/boreholes/{borehole_id}")
def delete_borehole(
    borehole_id: int,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    borehole = db.query(Borehole).filter(Borehole.id == borehole_id).first()

    if not borehole:
        raise HTTPException(status_code=404, detail="Borehole not found")

    db.delete(borehole)
    db.commit()

    log_action(db, current_user, "Deleted borehole point", f"{borehole.mine_name}: {borehole.label}")

    return {"status": "success", "message": "Borehole deleted"}

# ============================================================
# AUTO DATA ANALYSIS (per-file charts, reads real columns)
# ============================================================

@app.get("/api/documents/{document_id}/auto-analysis")
def get_document_auto_analysis(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if str(document.file_type or "").upper().strip() not in ["XLSX", "XLS", "CSV"]:
        raise HTTPException(
            status_code=400,
            detail="Auto-analysis is only available for Excel and CSV files.",
        )

    dataframe = _read_document_dataframe(document)

    if dataframe is None or dataframe.empty:
        raise HTTPException(status_code=422, detail="Could not read data from this file.")

    dataframe = dataframe.dropna(axis=1, how="all")
    dataframe.columns = [str(c).strip() for c in dataframe.columns]

    numeric_columns = []
    categorical_columns = []
    year_column = None

    for column in dataframe.columns:
        series = dataframe[column]

        if _is_probably_year_series(series, column) and year_column is None:
            year_column = column
            continue

        if _is_probably_numeric_series(series):
            numeric_columns.append(column)
        else:
            unique_count = series.nunique(dropna=True)
            if 1 < unique_count <= 40:
                categorical_columns.append(column)

    for column in numeric_columns:
        dataframe[column] = pd.to_numeric(dataframe[column], errors="coerce")

    bar_charts = []
    pie_charts = []
    line_chart = None
    summary = []

    for column in numeric_columns[:6]:
        series = dataframe[column].dropna()
        if series.empty:
            continue
        summary.append({
            "column": column,
            "min": round(float(series.min()), 2),
            "max": round(float(series.max()), 2),
            "avg": round(float(series.mean()), 2),
            "sum": round(float(series.sum()), 2),
        })

    if categorical_columns and numeric_columns:
        primary_category = categorical_columns[0]

        for numeric_column in numeric_columns[:3]:
            grouped = (
                dataframe.groupby(primary_category)[numeric_column]
                .sum()
                .sort_values(ascending=False)
                .head(15)
            )

            if grouped.empty:
                continue

            bar_charts.append({
                "title": f"{numeric_column} by {primary_category}",
                "category_column": primary_category,
                "value_column": numeric_column,
                "data": [
                    {"name": str(name), "value": round(float(value), 2)}
                    for name, value in grouped.items()
                ],
            })

    for column in categorical_columns[:2]:
        unique_count = dataframe[column].nunique(dropna=True)

        if not (2 <= unique_count <= 12):
            continue

        if numeric_columns:
            grouped = (
                dataframe.groupby(column)[numeric_columns[0]]
                .sum()
                .sort_values(ascending=False)
            )
            pie_data = [
                {"name": str(name), "value": round(float(value), 2)}
                for name, value in grouped.items()
            ]
            pie_title = f"{numeric_columns[0]} share by {column}"
        else:
            counts = dataframe[column].value_counts()
            pie_data = [
                {"name": str(name), "value": int(value)}
                for name, value in counts.items()
            ]
            pie_title = f"Distribution of {column}"

        pie_charts.append({"title": pie_title, "column": column, "data": pie_data})

    if year_column and numeric_columns:
        grouped = dataframe.groupby(year_column)[numeric_columns[:3]].sum().reset_index()
        grouped = grouped.sort_values(by=year_column)

        line_chart = {
            "title": f"Trend over {year_column}",
            "x_column": year_column,
            "data": [
                {
                    "x": str(row[year_column]),
                    **{col: round(float(row[col]), 2) for col in numeric_columns[:3]},
                }
                for _, row in grouped.iterrows()
            ],
            "series": numeric_columns[:3],
        }

    return {
        "status": "success",
        "document_id": document.id,
        "document_name": document.original_name,
        "row_count": len(dataframe),
        "columns": list(dataframe.columns),
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "year_column": year_column,
        "summary": summary,
        "bar_charts": bar_charts,
        "pie_charts": pie_charts,
        "line_chart": line_chart,
    }

# ============================================================
# AI-GENERATED INSIGHTS (real narrative analysis from live data)
# ============================================================

class InsightRequest(BaseModel):
    topic: str
    mine_name: Optional[str] = None


def _build_quality_data_summary(db: Session) -> str:
    processed_documents = (
        db.query(Document).filter(Document.processing_status == "Processed").all()
    )

    document_ids_with_records = {
        r[0] for r in db.query(MiningRecord.document_id).distinct().all()
    }

    missing_metadata = sum(1 for d in processed_documents if d.id not in document_ids_with_records)
    low_extraction = sum(1 for d in processed_documents if len(d.extracted_text or "") < 200)

    conflicts = _detect_conflicts(db)

    total_records = db.query(MiningRecord).count()
    total_mines = db.query(MiningRecord.mine_name).distinct().count()

    lines = [
        f"Total processed documents: {len(processed_documents)}",
        f"Total mining records extracted: {total_records}",
        f"Distinct mines tracked: {total_mines}",
        f"Documents with missing mine/year metadata: {missing_metadata}",
        f"Documents with very weak text extraction: {low_extraction}",
        f"Detected data conflicts (same mine+year, different figures): {len(conflicts)}",
    ]

    for conflict in conflicts[:5]:
        values_text = "; ".join(
            f"{v['document_name']}: {v['value']} {v['unit']}" for v in conflict["values"]
        )
        lines.append(
            f"Conflict — {conflict['mine_name']} ({conflict['reporting_year']}), "
            f"{conflict['field']}: {values_text}"
        )

    return "\n".join(lines)


def _build_analytics_data_summary(db: Session) -> str:
    records = db.query(MiningRecord).filter(MiningRecord.production.isnot(None)).all()

    production_by_year = {}
    production_by_mine = {}

    for record in records:
        if record.reporting_year:
            production_by_year[record.reporting_year] = (
                production_by_year.get(record.reporting_year, 0.0) + record.production
            )
        production_by_mine[record.mine_name] = (
            production_by_mine.get(record.mine_name, 0.0) + record.production
        )

    lines = ["Total coal production by reporting year:"]
    for year, value in sorted(production_by_year.items()):
        lines.append(f"  {year}: {round(value, 2)}")

    lines.append("")
    lines.append("Total coal production by mine (top 10):")
    top_mines = sorted(production_by_mine.items(), key=lambda x: x[1], reverse=True)[:10]
    for mine, value in top_mines:
        lines.append(f"  {mine}: {round(value, 2)}")

    return "\n".join(lines)


@app.post("/api/ai/insight")
def get_ai_insight(
    request: InsightRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_ai_configured():
        raise HTTPException(
            status_code=503,
            detail="AI insights are not available because no AI provider is configured.",
        )

    if request.topic == "mine_profile":
        if not request.mine_name:
            raise HTTPException(status_code=400, detail="mine_name is required for this topic")
        data_summary = _build_structured_summary(db, mine_name=request.mine_name)
        topic_label = f"Profile analysis for mine: {request.mine_name}"

    elif request.topic == "data_quality":
        data_summary = _build_quality_data_summary(db)
        topic_label = "Data quality and conflict overview across all mining documents"

    elif request.topic == "analytics":
        data_summary = _build_analytics_data_summary(db)
        topic_label = "Production analytics across all mines and years"

    else:
        raise HTTPException(status_code=400, detail="Unknown topic")

    try:
        insight_text = generate_insight(topic_label, data_summary)
    except Exception as error:
        import traceback
        print("=" * 60)
        print("AI INSIGHT ERROR:", repr(error))
        traceback.print_exc()
        print("=" * 60)
        raise HTTPException(
            status_code=502,
            detail=f"The AI service is temporarily unavailable: {error}",
        )

    return {"status": "success", "insight": insight_text}

# ============================================================
# LIVE EXTERNAL DATA (Ministry of Coal — Production & Supplies)
# ============================================================

@app.post("/api/external-data/coal-ministry/refresh")
def refresh_coal_ministry_data(
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    try:
        data = fetch_coal_ministry_data()
    except Exception as error:
        logger.exception("Failed to fetch Ministry of Coal data")
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch live data from the source site: {error}",
        )

    saved = []

    for table in data["tables"]:
        snapshot = ExternalDataSnapshot(
            source_name=data["source_name"],
            source_url=data["source_url"],
            table_label=table["table_label"],
            columns_json=json.dumps(table["columns"]),
            rows_json=json.dumps(table["rows"]),
        )
        db.add(snapshot)
        saved.append(snapshot)

    db.commit()

    log_action(db, current_user, "Refreshed live external data", data["source_name"])
    notify(db, f"Live data refreshed from {data['source_name']}", link="/national-statistics")

    return {
        "status": "success",
        "message": "Live data refreshed successfully",
        "fetched_at": data["fetched_at"],
    }


@app.get("/api/external-data/coal-ministry/latest")
def get_latest_coal_ministry_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    labels = (
        db.query(ExternalDataSnapshot.table_label)
        .distinct()
        .all()
    )

    tables = []

    for (label,) in labels:
        latest = (
            db.query(ExternalDataSnapshot)
            .filter(ExternalDataSnapshot.table_label == label)
            .order_by(ExternalDataSnapshot.fetched_at.desc())
            .first()
        )

        if latest:
            tables.append({
                "table_label": latest.table_label,
                "columns": json.loads(latest.columns_json),
                "rows": json.loads(latest.rows_json),
                "fetched_at": latest.fetched_at.isoformat() if latest.fetched_at else None,
                "source_name": latest.source_name,
                "source_url": latest.source_url,
            })

    return {"status": "success", "tables": tables}

# ============================================================
# LIVE EXTERNAL DATA ANALYSIS (charts + dashboard highlights)
# ============================================================

def _parse_numeric(value: str):
    if value is None:
        return None
    cleaned = str(value).replace(",", "").replace("*", "").strip()
    if cleaned in ("", "-", "nan", "None"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _get_latest_table(db: Session, label_keyword: str):
    snapshot = (
        db.query(ExternalDataSnapshot)
        .filter(ExternalDataSnapshot.table_label.ilike(f"%{label_keyword}%"))
        .order_by(ExternalDataSnapshot.fetched_at.desc())
        .first()
    )
    if not snapshot:
        return None

    return {
        "columns": json.loads(snapshot.columns_json),
        "rows": json.loads(snapshot.rows_json),
        "fetched_at": snapshot.fetched_at,
    }


@app.get("/api/external-data/coal-ministry/analysis")
def analyze_coal_ministry_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    production_table = _get_latest_table(db, "Production & Offtake")
    import_table = _get_latest_table(db, "Import by Year")

    production_bar = []
    production_pie = []
    import_trend = []
    highlights = []
    fetched_at = None

    if production_table:
        fetched_at = production_table["fetched_at"]
        columns = [c.lower() for c in production_table["columns"]]

        target_indices = [i for i, c in enumerate(columns) if "target" in c]
        ach_indices = [i for i, c in enumerate(columns) if "ach" in c]
        growth_indices = [i for i, c in enumerate(columns) if "growth" in c]

        prod_ach_idx = ach_indices[0] if len(ach_indices) > 0 else None
        offtake_ach_idx = ach_indices[1] if len(ach_indices) > 1 else None
        prod_growth_idx = growth_indices[0] if len(growth_indices) > 0 else None

        total_production = None
        total_growth = None
        cil_production = None

        for row in production_table["rows"]:
            if not row or not row[0].strip():
                continue

            label = row[0].strip()

            if not any(char.isalpha() for char in label) or "source" in label.lower():
                continue

            production_achieved = _parse_numeric(row[prod_ach_idx]) if prod_ach_idx is not None and prod_ach_idx < len(row) else None
            offtake_achieved = _parse_numeric(row[offtake_ach_idx]) if offtake_ach_idx is not None and offtake_ach_idx < len(row) else None
            growth = _parse_numeric(row[prod_growth_idx]) if prod_growth_idx is not None and prod_growth_idx < len(row) else None

            if production_achieved is None and offtake_achieved is None:
                continue

            production_bar.append({
                "name": label,
                "production_achieved": production_achieved,
                "offtake_achieved": offtake_achieved,
            })

            if label.lower() != "total" and production_achieved is not None:
                production_pie.append({"name": label, "value": production_achieved})

            if label.lower() == "total":
                total_production = production_achieved
                total_growth = growth

            if label.lower() == "cil":
                cil_production = production_achieved

        if total_production is not None:
            highlights.append({
                "label": "All-India Coal Production (Achieved)",
                "value": total_production,
                "unit": "MT",
            })

        if total_growth is not None:
            highlights.append({
                "label": "Production Growth vs Last Year",
                "value": total_growth,
                "unit": "%",
            })

        if cil_production is not None:
            highlights.append({
                "label": "CIL Production (Achieved)",
                "value": cil_production,
                "unit": "MT",
            })

    if import_table:
        if fetched_at is None:
            fetched_at = import_table["fetched_at"]

        columns = import_table["columns"]
        year_columns = [
            (index, col) for index, col in enumerate(columns)
            if index > 0 and any(char.isdigit() for char in col)
        ]

        wanted_rows = ["coking coal", "non-coking coal", "total coal import"]
        row_by_label = {}

        for row in import_table["rows"]:
            if not row or not row[0].strip():
                continue
            label = row[0].strip()
            if label.lower() in wanted_rows:
                row_by_label[label.lower()] = row

        for col_index, year_label in year_columns:
            entry = {"year": year_label.replace("*", "").strip()}
            has_value = False

            for wanted_label in wanted_rows:
                row = row_by_label.get(wanted_label)
                if row and col_index < len(row):
                    value = _parse_numeric(row[col_index])
                    if value is not None:
                        has_value = True
                    display_label = wanted_label.title()
                    entry[display_label] = value

            if has_value:
                import_trend.append(entry)

        latest_total_import_row = row_by_label.get("total coal import")
        if latest_total_import_row and year_columns:
            last_col_index, last_year_label = year_columns[-1]
            if last_col_index < len(latest_total_import_row):
                latest_import_value = _parse_numeric(latest_total_import_row[last_col_index])
                if latest_import_value is not None:
                    highlights.append({
                        "label": f"Total Coal Import ({last_year_label.replace('*', '').strip()})",
                        "value": latest_import_value,
                        "unit": "MT",
                    })

    return {
        "status": "success",
        "has_data": bool(production_table or import_table),
        "production_bar": production_bar,
        "production_pie": production_pie,
        "import_trend": import_trend,
        "highlights": highlights,
        "fetched_at": fetched_at.isoformat() if fetched_at else None,
    }

# ============================================================
# ANNUAL REPORTS ARCHIVE (Ministry of Coal) — browse + one-click
# import a chapter PDF directly into Document Intelligence
# ============================================================

@app.get("/api/external-data/annual-reports")
def get_annual_reports_index(
    current_user: User = Depends(get_current_user),
):
    try:
        reports = fetch_annual_reports_index()
    except Exception as error:
        logger.exception("Failed to fetch annual reports index")
        raise HTTPException(status_code=502, detail=f"Could not fetch report list: {error}")

    return {"status": "success", "reports": reports}


@app.get("/api/external-data/annual-reports/chapters")
def get_annual_report_chapters(
    page_url: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    if "coal.gov.in" not in page_url:
        raise HTTPException(status_code=400, detail="Invalid source URL")

    try:
        chapters = fetch_annual_report_chapters(page_url)
    except Exception as error:
        logger.exception("Failed to fetch annual report chapters")
        raise HTTPException(status_code=502, detail=f"Could not fetch chapter list: {error}")

    return {"status": "success", "chapters": chapters}


class ImportReportRequest(BaseModel):
    title: str
    pdf_url: str


@app.post("/api/external-data/annual-reports/import")
def import_annual_report_chapter(
    request: ImportReportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles("Admin", "Editor")),
    db: Session = Depends(get_db),
):
    if not request.pdf_url.lower().endswith(".pdf") or "coal.gov.in" not in request.pdf_url:
        raise HTTPException(status_code=400, detail="Invalid PDF source URL")

    try:
        pdf_bytes = download_pdf_bytes(request.pdf_url, MAX_FILE_SIZE_BYTES)
    except Exception as error:
        logger.exception("Failed to download report PDF")
        raise HTTPException(status_code=502, detail=f"Could not download the report: {error}")

    unique_name = f"{uuid.uuid4().hex}.pdf"
    file_path = UPLOAD_DIR / unique_name

    with file_path.open("wb") as buffer:
        buffer.write(pdf_bytes)

    original_name = f"{request.title.strip()[:150]}.pdf"

    document = Document(
        original_name=original_name,
        stored_name=unique_name,
        file_type="PDF",
        file_size=file_path.stat().st_size,
        category="Uncategorized",
        processing_status="Uploaded",
    )

    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except Exception as error:
        db.rollback()
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Could not save document metadata: {error}")

    log_action(db, current_user, "Imported Ministry of Coal report", original_name)
    notify(db, f"Imported '{original_name}' from Ministry of Coal — processing now.", link="/documents")

    background_tasks.add_task(
        process_document_background,
        document.id,
        document.stored_name,
    )

    return {
        "status": "success",
        "message": "Report imported and queued for processing",
        "document": {
            "id": document.id,
            "original_name": document.original_name,
            "processing_status": "Processing",
        },
    }