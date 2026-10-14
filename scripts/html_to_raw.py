#!/usr/bin/env python3
"""Convert Google Sheets HTML exports to curriculum_raw.json format."""
import html
import json
import re
from pathlib import Path

HTML_FILES = {
    'תוכנית היבחנות חובה מב"ר, חנ"מ': Path(
        r"c:\Users\matan\Downloads\תוכנית היבחנות חובה מב_ר, חנ_מ.html"
    ),
    "תוכנית היבחנות גמיש מתמטיקה אנגלית ומגמות": Path(
        r"c:\Users\matan\Downloads\תוכנית היבחנות גמיש מתמטיקה אנגלית ומגמות.html"
    ),
    "תוכנית היבחנות חובה רגילה": Path(
        r"c:\Users\matan\Downloads\תוכנית היבחנות חובה רגילה.html"
    ),
    "תוכנית היבחנות חובה בית מדרש": Path(
        r"c:\Users\matan\Downloads\תוכנית היבחנות חובה בית מדרש.html"
    ),
}

TD_RE = re.compile(
    r"<td([^>]*)>(.*?)</td>",
    re.DOTALL | re.IGNORECASE,
)
ATTR_RE = re.compile(r'(\w+)="([^"]*)"')
TAG_RE = re.compile(r"<[^>]+>")


def parse_attrs(tag_attrs: str) -> dict[str, str]:
    return {m.group(1): m.group(2) for m in ATTR_RE.finditer(tag_attrs)}


def cell_text(raw: str) -> str:
    text = TAG_RE.sub("", raw)
    text = html.unescape(text)
    return text.strip()


def parse_html_table(path: Path) -> list[list[str]]:
    content = path.read_text(encoding="utf-8")
    tbody_match = re.search(r"<tbody>(.*?)</tbody>", content, re.DOTALL | re.IGNORECASE)
    if not tbody_match:
        raise ValueError(f"No tbody in {path}")

    tbody = tbody_match.group(1)
    tr_blocks = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody, re.DOTALL | re.IGNORECASE)

    rows_out: list[list[str]] = []
    rowspan_carry: dict[int, tuple[str, int]] = {}
    max_cols = 13

    for tr_html in tr_blocks:
        cells = []
        for m in TD_RE.finditer(tr_html):
            attrs = parse_attrs(m.group(1))
            text = cell_text(m.group(2))
            rowspan = int(attrs.get("rowspan", "1"))
            colspan = int(attrs.get("colspan", "1"))
            cells.append({"text": text, "rowspan": rowspan, "colspan": colspan})

        if not cells:
            continue

        row: list[str] = []
        col = 0
        cell_idx = 0

        while col < max_cols:
            if col in rowspan_carry:
                val, remaining = rowspan_carry[col]
                row.append(val)
                if remaining <= 1:
                    del rowspan_carry[col]
                else:
                    rowspan_carry[col] = (val, remaining - 1)
                col += 1
                continue

            if cell_idx >= len(cells):
                row.append("")
                col += 1
                continue

            cell = cells[cell_idx]
            cell_idx += 1
            text = cell["text"]
            rowspan = cell["rowspan"]
            colspan = cell["colspan"]

            row.append(text)
            if rowspan > 1:
                rowspan_carry[col] = (text, rowspan - 1)

            for extra in range(colspan - 1):
                col += 1
                row.append("")
                if rowspan > 1:
                    rowspan_carry[col] = (text, rowspan - 1)

            col += 1

        while len(row) < max_cols:
            row.append("")

        if any(c.strip() for c in row[:12]):
            rows_out.append(row[:max_cols])

    return rows_out


GRADE_COMPONENTS = {"ציון פנימי", "ציון בחינה", "ציון הגשה", "יחידות מבוקרות"}
HEADER_MARKERS = {"מספר יחידות", "מספר שאלון", "משקל", "שם הארוע"}


def is_header_row(row: list[str]) -> bool:
    joined = " ".join(row[:6])
    return "מספר שאלון" in joined or "מספר יחידות" in joined


def is_units(val: str) -> bool:
    if not val:
        return False
    s = val.strip().replace(".0", "")
    return s.isdigit() and 0 <= int(s) <= 10


def is_questionnaire(val: str) -> bool:
    if not val:
        return False
    s = val.strip().replace(".0", "")
    return s.isdigit() and len(s) >= 4


def parse_percent(val: str) -> float | None:
    if not val:
        return None
    s = val.strip().replace("%", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def is_subitem_row(score_component: str, score_weight: float | None, exam_type: str) -> bool:
    if score_weight is None or score_weight >= 99.9:
        return False
    if exam_type == "יחידה מבוקרת":
        return True
    if not score_component or score_component in GRADE_COMPONENTS:
        return False
    if re.search(r"[\u0590-\u05FF]", score_component):
        return True
    if re.search(r"[A-Za-z]", score_component):
        return True
    return False


def normalize_rows(rows: list[list[str]]) -> list[list[str]]:
    """Convert HTML rowspan-heavy rows into Excel-like sparse rows."""
    normalized: list[list[str]] = []
    prev_questionnaire = ""
    prev_group = ""

    for row in rows:
        row = list(row)
        if is_header_row(row):
            normalized.append(row)
            prev_questionnaire = ""
            continue

        score_component = row[6].strip() if len(row) > 6 else ""
        score_weight = parse_percent(row[5]) if len(row) > 5 else None
        questionnaire = row[2].strip() if len(row) > 2 else ""
        exam_type = row[7].strip() if len(row) > 7 else ""

        is_component_row = (
            score_component in GRADE_COMPONENTS
            and score_weight is not None
            and score_weight < 99.9
        )
        is_subitem = is_subitem_row(score_component, score_weight, exam_type)
        same_block = questionnaire and questionnaire == prev_questionnaire

        if (is_component_row or is_subitem) and same_block:
            row[2] = ""
            row[3] = ""
            row[4] = ""

        group = f"{questionnaire}|{row[3]}|{row[4]}"
        if (is_subitem or is_component_row) and group == prev_group:
            row[3] = ""
            row[4] = ""

        if is_questionnaire(questionnaire) and not (
            (is_component_row or is_subitem) and same_block
        ):
            prev_questionnaire = questionnaire

        if row[3] or row[4] or questionnaire:
            prev_group = f"{questionnaire}|{row[3]}|{row[4]}"

        normalized.append(row)

    return normalized


def main():
    output: dict[str, list[list[str]]] = {}
    for sheet_name, path in HTML_FILES.items():
        if not path.exists():
            raise FileNotFoundError(path)
        rows = normalize_rows(parse_html_table(path))
        output[sheet_name] = rows
        print(f"{sheet_name}: {len(rows)} rows")

    out_path = Path(__file__).parent.parent / "data" / "curriculum_raw.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
