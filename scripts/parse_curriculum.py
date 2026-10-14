#!/usr/bin/env python3
"""Parse curriculum raw JSON into structured JSON for seeding."""
import json
import re
from pathlib import Path

SHEET_TO_PATH = {
    'תוכנית היבחנות חובה מב"ר, חנ"מ': "meubar_hinuch",
    "תוכנית היבחנות גמיש מתמטיקה אנג": "flexible",
    "תוכנית היבחנות גמיש מתמטיקה אנגלית ומגמות": "flexible",
    "תוכנית היבחנות חובה רגילה": "regular",
    "תוכנית היבחנות חובה בית מדרש": "beit_midrash",
}

PATH_LABELS = {
    "meubar_hinuch": 'מב"ר / חנ"מ',
    "flexible": "גמיש (מתמטיקה, אנגלית, מגמות)",
    "regular": "רגילה",
    "beit_midrash": "בית מדרש",
}

GRADE_COMPONENTS = {"ציון פנימי", "ציון בחינה", "ציון הגשה", "יחידות מבוקרות"}
SUB_ITEM_TYPES = {"סיפור", "שיר", "מבחן", "דוח"}


def clean(val):
    if val is None or val == "":
        return None
    s = str(val).strip()
    if s.endswith(".0") and s[:-2].replace(".", "").isdigit():
        s = s[:-2]
    return s if s else None


def parse_percent(val):
    if val is None:
        return None
    s = str(val).strip().replace("%", "")
    if not s:
        return None
    if s.startswith("="):
        expr = s[1:]
        if re.match(r"^[\d.\s*/()+-]+$", expr):
            try:
                f = float(eval(expr))  # noqa: S307
                if f <= 1:
                    return round(f * 100, 2)
                return round(f, 2)
            except (SyntaxError, TypeError, ZeroDivisionError):
                return None
    try:
        f = float(s)
        if f <= 1:
            return round(f * 100, 2)
        return round(f, 2)
    except ValueError:
        return None


def is_units_number(val):
    if not val:
        return False
    s = str(val).strip().replace(".0", "")
    return s.isdigit() and 0 <= int(s) <= 10


def is_header_row(row):
    joined = " ".join(str(c or "") for c in row[:6])
    return "מספר שאלון" in joined or "מספר יחידות" in joined


def is_subject_header(row):
    first = clean(row[0]) if row else None
    if not first:
        return False
    if first in ("מספר יחידות", "מספר שאלון"):
        return False
    if is_header_row(row):
        return True
    if len(row) > 1 and clean(row[1]) == "מספר יחידות":
        return True
    return False


def is_questionnaire(val):
    if not val:
        return False
    s = str(val).strip()
    if "." in s and not s.endswith(".0"):
        return False
    s = s.replace(".0", "")
    return s.isdigit() and len(s) >= 4


def is_grade_component(name):
    return name in GRADE_COMPONENTS


def is_literature_unit_row(exam_type, study_material, score_weight):
    return exam_type == "יחידה מבוקרת" and study_material and score_weight is not None


def is_sub_item_component(name):
    if not name:
        return False
    if name in SUB_ITEM_TYPES:
        return True
    # English story titles etc.
    if not is_grade_component(name) and re.search(r"[A-Za-z]", name):
        return True
    return False


def is_task_label(name):
    if not name or is_grade_component(name) or is_sub_item_component(name):
        return False
    return bool(re.search(r"[\u0590-\u05FF]", name))


def is_summary_row(row):
    """Skip footer summary tables (e.g. music breakdown)."""
    joined = " ".join(str(c or "") for c in row[:6])
    if "ציון סופי" in joined:
        return True
    vals = [parse_percent(c) for c in row[1:6]]
    if vals.count(100.0) >= 1 and sum(1 for v in vals if v is not None) >= 3:
        first = clean(row[1])
        if first and parse_percent(first) in (15.0, 25.0, 30.0):
            return True
    return False


def start_subject(name, units=None):
    return {"name": name, "units": units, "obligations": []}


def new_obligation(questionnaire, weight, event_name, exam_type, study_material, exam_event, grade_year):
    return {
        "questionnaireNumber": questionnaire,
        "weightPercent": weight or 0,
        "eventName": event_name,
        "examType": exam_type or "פנימי",
        "studyMaterial": study_material,
        "examEvent": exam_event,
        "gradeYear": grade_year,
        "components": [],
        "subItems": [],
    }


def finalize_obligation(ob):
    if not ob["components"] and not ob["subItems"]:
        if ob["examType"] == "פנימי":
            ob["components"] = [{"name": "ציון פנימי", "weightPercent": 100.0}]
        elif ob["examType"] == "חיצוני":
            ob["components"] = [
                {"name": "ציון בחינה", "weightPercent": 70.0},
                {"name": "ציון בחינה", "weightPercent": 30.0},
            ]
    return ob


def add_component(ob, name, weight):
    if name and weight is not None:
        ob["components"].append({"name": name, "weightPercent": weight})


def add_sub_item(ob, name, weight):
    if name and weight is not None:
        ob["subItems"].append({"name": name, "weightPercent": weight})


def parse_sheet(rows):
    subjects = []
    current_subject = None
    current_obligation = None

    i = 0
    while i < len(rows):
        row = rows[i]

        if is_summary_row(row):
            i += 1
            continue

        if is_header_row(row):
            i += 1
            continue

        first = clean(row[0]) if row else None
        second = clean(row[1]) if len(row) > 1 else None

        if first and second and is_units_number(second):
            new_units = int(float(second))
            if (
                current_subject is None
                or current_subject["name"] != first
                or current_subject["units"] != new_units
            ):
                current_subject = start_subject(first, new_units)
                subjects.append(current_subject)
                current_obligation = None

        if is_subject_header(row):
            name = first
            units = None
            if second and is_units_number(second):
                units = int(float(second))
            current_subject = start_subject(name, units)
            subjects.append(current_subject)
            current_obligation = None
            i += 1
            continue

        if not current_subject:
            i += 1
            continue

        if not first and second and is_units_number(second):
            new_units = int(float(second))
            if current_subject["units"] is None:
                current_subject["units"] = new_units
            elif current_subject["units"] != new_units:
                current_subject = start_subject(current_subject["name"], new_units)
                subjects.append(current_subject)
                current_obligation = None

        questionnaire = clean(row[2]) if len(row) > 2 else None
        weight = parse_percent(row[3]) if len(row) > 3 else None
        event_name = clean(row[4]) if len(row) > 4 else None
        score_weight = parse_percent(row[5]) if len(row) > 5 else None
        score_component = clean(row[6]) if len(row) > 6 else None
        exam_type = clean(row[7]) if len(row) > 7 else None
        study_material = clean(row[8]) if len(row) > 8 else None
        exam_event = clean(row[9]) if len(row) > 9 else None
        grade_year = clean(row[10]) if len(row) > 10 else None

        has_q = is_questionnaire(questionnaire)

        starts_obligation = (
            has_q
            or (weight is not None and event_name)
            or (weight is not None and score_component and score_weight and not event_name)
        )

        if starts_obligation:
            q_num = questionnaire if has_q else None
            current_obligation = new_obligation(
                q_num, weight, event_name, exam_type, study_material, exam_event, grade_year
            )
            current_subject["obligations"].append(current_obligation)

            if is_literature_unit_row(exam_type, study_material, score_weight):
                add_sub_item(current_obligation, study_material, score_weight)
            elif (
                study_material
                and score_weight is not None
                and event_name
                and "בגרות" in event_name
            ):
                add_sub_item(current_obligation, study_material, score_weight)
            elif score_component and score_weight is not None:
                if is_sub_item_component(score_component):
                    add_sub_item(current_obligation, score_component, score_weight)
                elif is_grade_component(score_component):
                    add_component(current_obligation, score_component, score_weight)
                elif is_task_label(score_component):
                    add_sub_item(current_obligation, score_component, score_weight)

            current_obligation = finalize_obligation(current_obligation)

        elif current_obligation:
            if is_literature_unit_row(exam_type, study_material, score_weight):
                add_sub_item(current_obligation, study_material, score_weight)
            elif event_name and score_weight is not None and study_material and weight is None:
                add_sub_item(current_obligation, study_material, score_weight)
            elif event_name and score_weight is not None and study_material and weight is None and exam_type:
                add_sub_item(current_obligation, study_material or event_name, score_weight)
            elif event_name and score_weight and study_material and weight is None:
                add_sub_item(current_obligation, study_material, score_weight)
            elif score_component and score_weight is not None:
                if (
                    study_material
                    and weight is None
                    and not event_name
                    and is_grade_component(score_component)
                    and current_obligation.get("eventName")
                    and "בגרות" in current_obligation["eventName"]
                ):
                    add_sub_item(current_obligation, study_material, score_weight)
                elif is_sub_item_component(score_component):
                    add_sub_item(current_obligation, score_component, score_weight)
                elif is_grade_component(score_component):
                    add_component(current_obligation, score_component, score_weight)
                elif is_task_label(score_component):
                    add_sub_item(current_obligation, score_component, score_weight)
            elif event_name and weight is not None and not has_q:
                add_sub_item(current_obligation, event_name, weight)

        i += 1

    for subject in subjects:
        subject["obligations"] = [finalize_obligation(o) for o in subject["obligations"]]

    return subjects


def main():
    raw_path = Path(__file__).parent.parent / "data" / "curriculum_raw.json"
    with open(raw_path, encoding="utf-8") as f:
        raw_data = json.load(f)

    output = {"paths": []}
    path_order = ["meubar_hinuch", "flexible", "regular", "beit_midrash"]
    seen_keys = set()

    for sheet_name, rows in raw_data.items():
        path_key = SHEET_TO_PATH.get(sheet_name)
        if not path_key or path_key in seen_keys:
            continue
        seen_keys.add(path_key)
        subjects = parse_sheet(rows)
        output["paths"].append({
            "key": path_key,
            "label": PATH_LABELS[path_key],
            "sheetName": sheet_name,
            "subjects": subjects,
        })

    output["paths"].sort(key=lambda p: path_order.index(p["key"]) if p["key"] in path_order else 99)

    out_path = Path(__file__).parent.parent / "data" / "curriculum_parsed.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total_subjects = sum(len(p["subjects"]) for p in output["paths"])
    total_obligations = sum(
        len(s["obligations"]) for p in output["paths"] for s in p["subjects"]
    )
    empty = [
        f'{p["key"]}/{s["name"]} ({s["units"]} יח"ל)'
        for p in output["paths"]
        for s in p["subjects"]
        if not s["obligations"]
    ]
    print(f"Parsed {len(output['paths'])} paths, {total_subjects} subjects, {total_obligations} obligations")
    if empty:
        print("Subjects still without obligations:")
        for e in empty:
            print(f"  - {e}")
    print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
