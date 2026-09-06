import json
from datetime import datetime, timezone
from io import StringIO
from typing import Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup

COAL_MINISTRY_URL = "https://www.coal.gov.in/major-statistics/production-and-supplies"
ANNUAL_REPORTS_INDEX_URL = "https://www.coal.gov.in/public-information/reports/annual-reports"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}


def _get_soup(html_content: str) -> BeautifulSoup:
    """Helper to safely parse HTML using lxml if available, falling back to html.parser."""
    try:
        return BeautifulSoup(html_content, "lxml")
    except Exception:
        return BeautifulSoup(html_content, "html.parser")


def _table_to_json(dataframe: pd.DataFrame) -> dict:
    dataframe = dataframe.astype(str)

    # Flatten multi-level headers into a single readable label per column
    if isinstance(dataframe.columns, pd.MultiIndex):
        columns = [
            " / ".join(
                str(level) for level in col if str(level) != "" and "Unnamed" not in str(level)
            ).strip()
            for col in dataframe.columns
        ]
    else:
        columns = [str(c) for c in dataframe.columns]

    rows = []
    for _, row in dataframe.iterrows():
        rows.append([
            "" if str(cell).strip().lower() in ("nan", "none") else str(cell).strip()
            for cell in row.tolist()
        ])

    return {"columns": columns, "rows": rows}


def _find_table_with_keyword(tables: list, keyword: str) -> Optional[pd.DataFrame]:
    for table in tables:
        try:
            text_blob = table.astype(str).to_string().lower()
        except Exception:
            continue
        if keyword.lower() in text_blob:
            return table
    return None


def fetch_coal_ministry_data() -> dict:
    """
    Fetches the Ministry of Coal 'Production and Supplies' page and
    extracts key data tables: company-wise production/offtake and coal import figures.
    """
    response = requests.get(COAL_MINISTRY_URL, headers=_HEADERS, timeout=25)
    response.raise_for_status()

    try:
        tables = pd.read_html(StringIO(response.text))
    except ValueError:
        tables = []

    # Filter out navigation/layout tables
    tables = [t for t in tables if t.shape[0] >= 2 and t.shape[1] >= 2]

    production_table = _find_table_with_keyword(tables, "SCCL")
    import_table = _find_table_with_keyword(tables, "Coking Coal")

    results = []

    if production_table is not None:
        results.append({
            "table_label": "Coal Production & Offtake by Company (MT)",
            **_table_to_json(production_table),
        })

    if import_table is not None:
        results.append({
            "table_label": "Coal Import by Year (Million Tonnes)",
            **_table_to_json(import_table),
        })

    if not results:
        raise ValueError("Could not locate the expected data tables on the source page.")

    return {
        "source_name": "Ministry of Coal, Government of India",
        "source_url": COAL_MINISTRY_URL,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "tables": results,
    }


def fetch_annual_reports_index() -> list:
    response = requests.get(ANNUAL_REPORTS_INDEX_URL, headers=_HEADERS, timeout=25)
    response.raise_for_status()

    soup = _get_soup(response.text)

    reports = []
    seen = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        text = anchor.get_text(strip=True)

        if "/annual-reports/annual-report-" in href and text:
            full_url = href if href.startswith("http") else f"https://www.coal.gov.in{href}"
            if full_url not in seen:
                seen.add(full_url)
                reports.append({"label": text, "url": full_url})

    return reports


def fetch_annual_report_chapters(page_url: str) -> list:
    response = requests.get(page_url, headers=_HEADERS, timeout=25)
    response.raise_for_status()

    soup = _get_soup(response.text)

    chapters = []
    seen = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]

        if not href.lower().endswith(".pdf"):
            continue

        full_url = href if href.startswith("http") else f"https://www.coal.gov.in{href}"

        if full_url in seen:
            continue
        seen.add(full_url)

        title = None
        row = anchor.find_parent("tr")
        if row:
            cells = row.find_all("td")
            if cells:
                title = cells[0].get_text(strip=True)

        if not title:
            title = anchor.get_text(strip=True) or full_url.rsplit("/", 1)[-1]

        chapters.append({"title": title, "pdf_url": full_url})

    return chapters


def download_pdf_bytes(url: str, max_bytes: int) -> bytes:
    response = requests.get(url, headers=_HEADERS, timeout=30, stream=True)
    response.raise_for_status()

    content = bytearray()
    for chunk in response.iter_content(chunk_size=8192):
        content.extend(chunk)
        if len(content) > max_bytes:
            raise ValueError(f"File exceeds maximum allowed size of {max_bytes} bytes.")

    return bytes(content)