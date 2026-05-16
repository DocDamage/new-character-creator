from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CORE_LABELS = ["head", "torso", "front_arm", "back_arm", "front_leg", "back_leg"]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def relpath(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def ordered_labels(labels: set[str]) -> list[str]:
    known = [label for label in CORE_LABELS if label in labels]
    extra = sorted(label for label in labels if label not in CORE_LABELS)
    return known + extra


def summarize_report(report_path: Path, root: Path, input_root: Path) -> dict[str, Any]:
    report = read_json(report_path) or {}
    job_id = str(report.get("job_id") or report_path.parent.name)
    masks = report.get("masks") if isinstance(report.get("masks"), list) else []
    labels = ordered_labels({str(mask.get("label")) for mask in masks if isinstance(mask, dict) and mask.get("label")})
    confidences = [
        float(mask.get("confidence"))
        for mask in masks
        if isinstance(mask, dict) and isinstance(mask.get("confidence"), (int, float))
    ]
    reviewed_count = sum(1 for mask in masks if isinstance(mask, dict) and mask.get("reviewed") is True)
    report_warnings = report.get("warnings") if isinstance(report.get("warnings"), list) else []
    mask_warning_count = sum(
        len(mask.get("warnings"))
        for mask in masks
        if isinstance(mask, dict) and isinstance(mask.get("warnings"), list)
    )

    job_path = input_root / job_id / "job.json"
    job = read_json(job_path)
    expected_labels = job.get("output_labels") if isinstance(job, dict) and isinstance(job.get("output_labels"), list) else CORE_LABELS
    expected_label_set = {str(label) for label in expected_labels}
    missing_labels = ordered_labels(expected_label_set - set(labels))
    low_confidence_labels = ordered_labels({
        str(mask.get("label"))
        for mask in masks
        if isinstance(mask, dict)
        and isinstance(mask.get("confidence"), (int, float))
        and float(mask.get("confidence")) < 0.65
        and mask.get("label")
    })

    if not masks:
        review_state = "empty"
    elif reviewed_count == len(masks):
        review_state = "reviewed"
    elif reviewed_count == 0:
        review_state = "unreviewed"
    else:
        review_state = "mixed"

    return {
        "job_id": job_id,
        "status": report.get("status") or "unknown",
        "character_id": job.get("character_id") if isinstance(job, dict) else None,
        "output_dir": relpath(report_path.parent, root),
        "report_path": relpath(report_path, root),
        "input_job_path": relpath(job_path, root) if job_path.exists() else None,
        "mask_count": len(masks),
        "labels": labels,
        "missing_labels": missing_labels,
        "low_confidence_labels": low_confidence_labels,
        "average_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "min_confidence": round(min(confidences), 4) if confidences else None,
        "reviewed_count": reviewed_count,
        "review_state": review_state,
        "warning_count": len(report_warnings) + mask_warning_count,
        "warnings": [str(warning) for warning in report_warnings[:8]],
        "needs_review": review_state != "reviewed" or bool(missing_labels) or bool(low_confidence_labels) or bool(report_warnings),
    }


def build_inventory(output_root: Path, input_root: Path) -> dict[str, Any]:
    root = repo_root()
    report_paths = sorted(path for path in output_root.rglob("apes_report.json") if path.is_file())
    reports = [summarize_report(path, root, input_root) for path in report_paths]
    complete = sum(1 for report in reports if report["status"] == "complete")
    empty = sum(1 for report in reports if report["mask_count"] == 0)
    needs_review = sum(1 for report in reports if report["needs_review"])
    label_counts: dict[str, int] = {}
    for report in reports:
        for label in report["labels"]:
            label_counts[label] = label_counts.get(label, 0) + 1

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "output_root": relpath(output_root, root),
        "input_root": relpath(input_root, root),
        "report_count": len(reports),
        "summary": {
            "complete_reports": complete,
            "empty_reports": empty,
            "needs_review": needs_review,
            "reviewed_reports": sum(1 for report in reports if report["review_state"] == "reviewed"),
            "label_counts": {label: label_counts.get(label, 0) for label in ordered_labels(set(label_counts))},
        },
        "reports": reports,
    }


def main() -> int:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Summarize APES bridge output reports for review.")
    parser.add_argument("--output-root", default=str(root / "data" / "apes" / "output"))
    parser.add_argument("--input-root", default=str(root / "data" / "apes" / "input"))
    parser.add_argument("--inventory-path", default=str(root / "data" / "apes" / "output" / "apes_output_inventory.json"))
    parser.add_argument("--json", action="store_true", help="Print the inventory JSON to stdout.")
    args = parser.parse_args()

    output_root = Path(args.output_root).resolve()
    input_root = Path(args.input_root).resolve()
    inventory_path = Path(args.inventory_path).resolve()
    inventory = build_inventory(output_root, input_root)

    inventory_path.parent.mkdir(parents=True, exist_ok=True)
    inventory_path.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(inventory, indent=2))
    else:
        print(
            f"Wrote {relpath(inventory_path, root)} with {inventory['report_count']} report(s), "
            f"{inventory['summary']['needs_review']} needing review."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
