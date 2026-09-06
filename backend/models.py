from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    BigInteger,
    Text,
    ForeignKey,
    Float,
    Boolean,
)
from sqlalchemy.orm import relationship

from backend.database import Base


# ============================================================
# DOCUMENT
# ============================================================

class Document(Base):

    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    original_name = Column(String(500), nullable=False)

    stored_name = Column(String(500), nullable=False, unique=True, index=True)

    file_type = Column(String(50), nullable=False)

    file_size = Column(BigInteger, nullable=False)

    category = Column(String(100), nullable=False, default="Uncategorized")

    processing_status = Column(String(50), nullable=False, default="Uploaded")

    extracted_text = Column(Text, nullable=True)

    ocr_used = Column(String(10), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    mine_name = Column(String(255), nullable=True)

    reporting_year = Column(String(20), nullable=True)

    coal_production = Column(String(100), nullable=True)

    coal_production_unit = Column(String(50), nullable=True)

    overburden_removal = Column(String(100), nullable=True)

    overburden_removal_unit = Column(String(50), nullable=True)

    pages = relationship(
        "DocumentPage",
        back_populates="document",
        cascade="all, delete-orphan",
    )

    facts = relationship(
        "ExtractedFact",
        back_populates="document",
        cascade="all, delete-orphan",
    )


# ============================================================
# DOCUMENT PAGE
# ============================================================

class DocumentPage(Base):

    __tablename__ = "document_pages"

    id = Column(Integer, primary_key=True, index=True)

    document_id = Column(
        Integer,
        ForeignKey("documents.id"),
        nullable=False,
        index=True,
    )

    page_number = Column(Integer, nullable=False)

    text = Column(Text, nullable=True)

    extraction_method = Column(String(50), nullable=False)

    confidence = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="pages")


# ============================================================
# EXTRACTED FACT
# ============================================================

class ExtractedFact(Base):

    __tablename__ = "extracted_facts"

    id = Column(Integer, primary_key=True, index=True)

    document_id = Column(
        Integer,
        ForeignKey("documents.id"),
        nullable=False,
        index=True,
    )

    field_name = Column(String(100), nullable=False)

    value = Column(String(500), nullable=True)

    unit = Column(String(100), nullable=True)

    source_page = Column(Integer, nullable=True)

    extraction_method = Column(String(50), nullable=False)

    confidence = Column(Float, nullable=True)

    validation_status = Column(String(50), nullable=False, default="Pending")

    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="facts")


# ============================================================
# REPORT
# ============================================================

class Report(Base):

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)

    report_type = Column(String(200), nullable=False)

    period = Column(String(50), nullable=True)

    mine_name = Column(String(255), nullable=True)

    status = Column(String(50), nullable=False, default="Ready")

    stored_name = Column(String(500), nullable=False, unique=True)

    display_name = Column(String(500), nullable=False)

    document_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================
# USER
# ============================================================

class User(Base):

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String(100), nullable=False, unique=True, index=True)

    password_hash = Column(String(300), nullable=False)

    role = Column(String(50), nullable=False, default="Viewer")

    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================
# AUDIT LOG
# ============================================================

class AuditLog(Base):

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    username = Column(String(100), nullable=False)

    action = Column(String(200), nullable=False)

    details = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    # ============================================================
# AI DRAFT (formal inquiry responses)
# ============================================================

class AIDraft(Base):

    __tablename__ = "ai_drafts"

    id = Column(Integer, primary_key=True, index=True)

    inquiry = Column(Text, nullable=False)

    content = Column(Text, nullable=False)

    stored_name = Column(String(500), nullable=False, unique=True)

    display_name = Column(String(500), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    # ============================================================
# NOTIFICATION
# ============================================================

class Notification(Base):

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)

    message = Column(String(500), nullable=False)

    link = Column(String(200), nullable=True)

    is_read = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    # ============================================================
# PROCESSING STAGE (pipeline visualization, real timestamps)
# ============================================================

class ProcessingStage(Base):

    __tablename__ = "processing_stages"

    id = Column(Integer, primary_key=True, index=True)

    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)

    stage = Column(String(100), nullable=False)

    status = Column(String(50), nullable=False, default="Completed")

    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================
# BOREHOLE (user-entered geological layout points, per mine)
# ============================================================

class Borehole(Base):

    __tablename__ = "boreholes"

    id = Column(Integer, primary_key=True, index=True)

    mine_name = Column(String(255), nullable=False, index=True)

    label = Column(String(100), nullable=False)

    x = Column(Float, nullable=False)

    y = Column(Float, nullable=False)

    depth = Column(String(100), nullable=True)

    notes = Column(String(500), nullable=True)

    created_by = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    # ============================================================
# MINING RECORD (one row per mine, auto-detected from spreadsheets
# or single-value PDF/DOCX extractions — supports many mines per file)
# ============================================================

class MiningRecord(Base):

    __tablename__ = "mining_records"

    id = Column(Integer, primary_key=True, index=True)

    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)

    mine_name = Column(String(255), nullable=False, index=True)

    reporting_year = Column(String(20), nullable=True, index=True)

    production = Column(Float, nullable=True)

    production_unit = Column(String(50), nullable=True)

    overburden = Column(Float, nullable=True)

    overburden_unit = Column(String(50), nullable=True)

    category = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    # ============================================================
# CHAT MESSAGE (AI Assistant history, per user)
# ============================================================

class ChatMessage(Base):

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    role = Column(String(20), nullable=False)

    content = Column(Text, nullable=False)

    mode = Column(String(20), nullable=False, default="ask")

    sources = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    # ============================================================
# EXTERNAL DATA SNAPSHOT (live data pulled from government sources)
# ============================================================

class ExternalDataSnapshot(Base):

    __tablename__ = "external_data_snapshots"

    id = Column(Integer, primary_key=True, index=True)

    source_name = Column(String(200), nullable=False)

    source_url = Column(String(500), nullable=False)

    table_label = Column(String(200), nullable=False)

    columns_json = Column(Text, nullable=False)

    rows_json = Column(Text, nullable=False)

    fetched_at = Column(DateTime, default=datetime.utcnow)