from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert an APES report into creator ExtractedPart records.")
    parser.add_argument("report", type=Path)
    parser.add_argument("--character", required=True)
    parser.add_argument("--animation", default="idle")
    parser.add_argument("--direction", default="south")
    parser.add_argument("--source-frame", default="")
    args = parser.parse_args()

    report = json.loads(args.report.read_text(encoding="utf-8"))
    parts = []
    for index, mask in enumerate(report.get("masks", [])):
        label = mask["label"]
        parts.append(
            {
                "part_id": f"{args.character}_{label}_apes_{index:03d}",
                "character_id": args.character,
                "label": label,
                "source_animation": args.animation,
                "source_direction": args.direction,
                "source_frame_path": args.source_frame,
                "image_path": "",
                "mask_path": mask["path"],
                "anchor": {"x": 32, "y": 32},
                "bounds": {"x": 0, "y": 0, "w": 64, "h": 64},
                "extraction_method": "apes",
                "compatibility": {
                    "animations": [args.animation],
                    "directions": [args.direction],
                },
                "reviewed": mask.get("reviewed", False),
                "tags": ["apes", "report_import", args.character, f"confidence_{round(mask.get('confidence', 0) * 100)}"],
                "warnings": report.get("warnings", []),
            }
        )

    output_path = args.report.with_name("creator_parts.json")
    output_path.write_text(json.dumps(parts, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote creator parts: {output_path}")


if __name__ == "__main__":
    main()
