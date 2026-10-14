#!/usr/bin/env python3
import json
from pathlib import Path

path = Path(__file__).parent.parent / "data" / "curriculum_raw.json"
with open(path, encoding="utf-8") as f:
    data = json.load(f)

for sheet, rows in data.items():
    print(f"\n=== {sheet} (first 15 rows) ===")
    for i, row in enumerate(rows[:15]):
        print(f"{i:2}: {row[:11]}")
