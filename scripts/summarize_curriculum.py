#!/usr/bin/env python3
import json
from pathlib import Path

path = Path(__file__).parent.parent / "data" / "curriculum_parsed.json"
with open(path, encoding="utf-8") as f:
    data = json.load(f)

for p in data["paths"]:
    print(f"=== {p['key']} ({p['label']}) ===")
    for s in p["subjects"]:
        ob_count = len(s["obligations"])
        sub_count = sum(len(o.get("subItems", [])) for o in s["obligations"])
        total_weight = sum(o["weightPercent"] for o in s["obligations"])
        print(
            f"  {s['name']} ({s['units']}): {ob_count} obligations, "
            f"{sub_count} subItems, total weight {total_weight}%"
        )
        if not s["obligations"]:
            print("    *** NO OBLIGATIONS ***")
