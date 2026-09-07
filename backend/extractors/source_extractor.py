import re
from typing import Optional


# ============================================================
# NUMBER CLEANING
# ============================================================

def clean_number(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None

    value = value.replace(",", "").strip()

    try:
        return float(value)
    except ValueError:
        return None


# ============================================================
# UNIT NORMALIZATION
# ============================================================

def normalize_unit(unit: Optional[str]) -> Optional[str]:
    if not unit:
        return None

    normalized = unit.lower().strip()

    if normalized in ["mt", "mtpa", "million tonne", "million tonnes"]:
        return "MT"

    if normalized in [
        "mm3", "mm³",
        "million cubic metre", "million cubic metres",
        "million cubic meter", "million cubic meters",
    ]:
        return "Mm3"

    return unit.strip()


# ============================================================
# FIELD PATTERNS
# ============================================================

MINE_NAME_PATTERNS = [
    r"mine\s*name\s*[:\-]\s*([^\n,|;\t]+)",
    r"name\s*of\s*mine\s*[:\-]\s*([^\n,|;\t]+)",
    r"mine\s*[:\-]\s*([^\n,|;\t]+)",
]

def _build_fact(field_name, value, unit, page_number, extraction_method, confidence):
    cleaned_value = str(value).strip() if value is not None else None
    if cleaned_value and len(cleaned_value) > 200:
        cleaned_value = cleaned_value[:200].strip()
    return {
        "field_name": field_name,
        "value": cleaned_value,
        "unit": unit,
        "source_page": page_number,
        "extraction_method": extraction_method,
        "confidence": confidence,
        "validation_status": "Pending",
    }

REPORTING_YEAR_PATTERNS = [
    r"financial\s+year\s*[:\-]?\s*(20\d{2}[-/]\d{2,4})",
    r"reporting\s+year\s*[:\-]?\s*(20\d{2}[-/]\d{2,4})",
    r"FY\s*(20\d{2}[-/]\d{2,4})",
    r"\b(20\d{2}[-/]\d{2})\b",
]

COAL_PRODUCTION_PATTERNS = [
    r"(?:coal\s+)?production\s*[:\-]?\s*"
    r"([\d,]+(?:\.\d+)?)\s*"
    r"(MT|MTPA|million\s+tonnes?|million\s+tonne)",

    r"produced\s*"
    r"([\d,]+(?:\.\d+)?)\s*"
    r"(MT|MTPA|million\s+tonnes?|million\s+tonne)",
]

OVERBURDEN_PATTERNS = [
    r"(?:OB|overburden)\s+removal\s*[:\-]?\s*"
    r"([\d,]+(?:\.\d+)?)\s*"
    r"(Mm3|Mm³|million\s+cubic\s+metres?|million\s+cubic\s+meters?)",

    r"overburden\s*[:\-]?\s*"
    r"([\d,]+(?:\.\d+)?)\s*"
    r"(Mm3|Mm³|million\s+cubic\s+metres?|million\s+cubic\s+meters?)",
]


def _build_fact(field_name, value, unit, page_number, extraction_method, confidence):
    return {
        "field_name": field_name,
        "value": value,
        "unit": unit,
        "source_page": page_number,
        "extraction_method": extraction_method,
        "confidence": confidence,
        "validation_status": "Pending",
    }


# ============================================================
# EXTRACT FACTS FROM ONE PAGE
# ============================================================

def extract_page_facts(page_text, page_number, extraction_method, confidence):
    facts = []

    if not page_text:
        return facts

    # --------------------------------------------------------
    # MINE NAME
    # --------------------------------------------------------
    for pattern in MINE_NAME_PATTERNS:
        match = re.search(pattern, page_text, re.IGNORECASE)
        if match:
            facts.append(
                _build_fact(
                    "mine_name",
                    match.group(1).strip(),
                    None,
                    page_number,
                    extraction_method,
                    confidence,
                )
            )
            break

    # --------------------------------------------------------
    # REPORTING YEAR
    # --------------------------------------------------------
    for pattern in REPORTING_YEAR_PATTERNS:
        match = re.search(pattern, page_text, re.IGNORECASE)
        if match:
            year = match.group(1).replace("/", "-")
            facts.append(
                _build_fact(
                    "reporting_year",
                    year,
                    None,
                    page_number,
                    extraction_method,
                    confidence,
                )
            )
            break

    # --------------------------------------------------------
    # COAL PRODUCTION
    # --------------------------------------------------------
    for pattern in COAL_PRODUCTION_PATTERNS:
        match = re.search(pattern, page_text, re.IGNORECASE)
        if match:
            value = clean_number(match.group(1))
            unit = normalize_unit(match.group(2))
            facts.append(
                _build_fact(
                    "coal_production",
                    str(value),
                    unit,
                    page_number,
                    extraction_method,
                    confidence,
                )
            )
            break

    # --------------------------------------------------------
    # OVERBURDEN REMOVAL
    # --------------------------------------------------------
    for pattern in OVERBURDEN_PATTERNS:
        match = re.search(pattern, page_text, re.IGNORECASE)
        if match:
            value = clean_number(match.group(1))
            unit = normalize_unit(match.group(2))
            facts.append(
                _build_fact(
                    "overburden_removal",
                    str(value),
                    unit,
                    page_number,
                    extraction_method,
                    confidence,
                )
            )
            break

    return facts


# ============================================================
# EXTRACT FACTS FROM COMPLETE DOCUMENT
# ============================================================

def extract_document_facts(pages, extraction_method="PDF_TEXT", confidence=0.90):
    all_facts = []

    for page in pages:
        page_number = page.get("page", 1)
        page_text = page.get("text", "")

        page_facts = extract_page_facts(
            page_text, page_number, extraction_method, confidence
        )

        all_facts.extend(page_facts)

    return all_facts