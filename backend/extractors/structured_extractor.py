import re


# ============================================================
# NUMBER NORMALIZATION
# ============================================================

def clean_number(value):
    """
    Convert extracted numeric text into a float.
    """

    if value is None:
        return None

    value = value.replace(",", "")
    value = value.strip()

    try:
        return float(value)
    except ValueError:
        return None


# ============================================================
# MINE NAME EXTRACTION
# ============================================================

def extract_mine_name(text):
    """
    Try to identify a mine name from the document text.
    """

    patterns = [
        r"mine\s*name\s*[:\-]\s*([^\n,]+)",
        r"name\s*of\s*mine\s*[:\-]\s*([^\n,]+)",
        r"mine\s*[:\-]\s*([^\n,]+)"
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            return match.group(1).strip()

    return None


# ============================================================
# REPORTING YEAR
# ============================================================

def extract_reporting_year(text):
    """
    Find a financial/reporting year such as 2025-26.
    """

    patterns = [
        r"FY\s*(\d{4}[-/]\d{2,4})",
        r"financial\s+year\s*[:\-]?\s*(\d{4}[-/]\d{2,4})",
        r"reporting\s+year\s*[:\-]?\s*(\d{4}[-/]\d{2,4})",
        r"\b(20\d{2}[-/]\d{2})\b"
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            year = match.group(1)

            return year.replace("/", "-")

    return None


# ============================================================
# COAL PRODUCTION
# ============================================================

def extract_coal_production(text):
    """
    Extract coal production quantity and unit.
    """

    patterns = [

        r"(?:coal\s+)?production\s*[:\-]?\s*"
        r"([\d,]+(?:\.\d+)?)\s*"
        r"(MT|MTPA|million\s+tonnes|million\s+tonnes?)",

        r"produced\s*([\d,]+(?:\.\d+)?)\s*"
        r"(MT|MTPA|million\s+tonnes|million\s+tonnes?)"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            value = clean_number(
                match.group(1)
            )

            unit = match.group(2)

            return {
                "value": value,
                "unit": normalize_unit(unit)
            }

    return {
        "value": None,
        "unit": None
    }


# ============================================================
# OVERBURDEN REMOVAL
# ============================================================

def extract_ob_removal(text):
    """
    Extract overburden removal quantity and unit.
    """

    patterns = [

        r"(?:OB|overburden)\s+removal\s*[:\-]?\s*"
        r"([\d,]+(?:\.\d+)?)\s*"
        r"(Mm3|Mm³|million\s+cubic\s+metres?|million\s+cubic\s+meters?)",

        r"overburden\s*[:\-]?\s*"
        r"([\d,]+(?:\.\d+)?)\s*"
        r"(Mm3|Mm³|million\s+cubic\s+metres?|million\s+cubic\s+meters?)"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            value = clean_number(
                match.group(1)
            )

            unit = match.group(2)

            return {
                "value": value,
                "unit": normalize_unit(unit)
            }

    return {
        "value": None,
        "unit": None
    }


# ============================================================
# UNIT NORMALIZATION
# ============================================================

def normalize_unit(unit):
    """
    Convert different representations into
    standardized units.
    """

    normalized = unit.lower().strip()

    if normalized in [
        "mt",
        "mtpa",
        "million tonnes",
        "million tonne"
    ]:
        return "MT"

    if normalized in [
        "mm3",
        "mm³",
        "million cubic metres",
        "million cubic meters",
        "million cubic metre"
    ]:
        return "Mm3"

    return unit


# ============================================================
# STRUCTURED EXTRACTION
# ============================================================

def extract_structured_data(text):
    """
    Extract important structured mining information
    from document text.
    """

    mine_name = extract_mine_name(
        text
    )

    reporting_year = extract_reporting_year(
        text
    )

    coal_production = extract_coal_production(
        text
    )

    ob_removal = extract_ob_removal(
        text
    )


    return {

        "mine_name": mine_name,

        "reporting_year": reporting_year,

        "coal_production": coal_production,

        "overburden_removal": ob_removal

    }