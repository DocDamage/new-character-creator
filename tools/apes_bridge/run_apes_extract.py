from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Pillow is required. Run: python -m pip install -r tools/apes_bridge/requirements.txt") from exc


SEMANTIC_MASKS = {
    "head": (20, 4, 44, 22),
    "torso": (20, 22, 44, 40),
    "front_arm": (12, 22, 24, 46),
    "back_arm": (40, 22, 52, 46),
    "front_leg": (20, 38, 32, 60),
    "back_leg": (32, 38, 44, 60),
}


def read_job(job_path: Path) -> dict[str, Any]:
    with job_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_status(output_dir: Path, status: str, logs: list[str], failure_details: str | None = None) -> None:
    payload: dict[str, Any] = {
        "status": status,
        "logs": logs,
    }
    if failure_details:
        payload["failure_details"] = failure_details
    (output_dir / "status.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_mask(mask_path: Path, rect: tuple[int, int, int, int]) -> None:
    mask = Image.new("L", (64, 64), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(rect, fill=255)
    mask.save(mask_path)


def generate_placeholder_masks(job: dict[str, Any], output_dir: Path) -> list[dict[str, Any]]:
    masks_dir = output_dir / "masks"
    masks_dir.mkdir(parents=True, exist_ok=True)
    requested_labels = job.get("output_labels") or list(SEMANTIC_MASKS)
    masks: list[dict[str, Any]] = []

    for label in requested_labels:
        rect = SEMANTIC_MASKS.get(label)
        if rect is None:
            continue
        mask_path = masks_dir / f"{label}_mask.png"
        write_mask(mask_path, rect)
        masks.append(
            {
                "label": label,
                "path": str(mask_path).replace("\\", "/"),
                "confidence": 0.42,
                "reviewed": False,
                "source": "apes_bridge_placeholder",
            }
        )

    return masks


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the APES extraction bridge for one job config.")
    parser.add_argument("job", type=Path, help="Path to a job JSON file produced by the creator app.")
    parser.add_argument("--output", type=Path, default=None, help="Output folder for masks and apes_report.json.")
    args = parser.parse_args()

    job = read_job(args.job)
    output_dir = args.output or Path("data") / "apes" / "output" / job["job_id"]
    output_dir.mkdir(parents=True, exist_ok=True)
    logs = [
        f"Loaded APES job {job['job_id']}.",
        f"Input frame references: {len(job.get('input_frames', []))}.",
        "Running placeholder APES bridge.",
    ]
    write_status(output_dir, "running", logs)
    masks = generate_placeholder_masks(job, output_dir)
    logs.append(f"Generated {len(masks)} mask output(s).")

    report = {
        "job_id": job["job_id"],
        "status": "complete",
        "masks": masks,
        "semantic_mapping": {
            "head": "head",
            "torso": "torso",
            "left_arm": "front_arm",
            "right_arm": "back_arm",
            "left_leg": "front_leg",
            "right_leg": "back_leg",
        },
        "warnings": [
            "Placeholder APES bridge masks were generated. Replace generate_placeholder_masks with the real APES runtime.",
            "All masks require manual review before production export.",
        ],
    }

    report_path = output_dir / "apes_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    write_status(output_dir, "complete", logs)
    print(f"Wrote APES report: {report_path}")


if __name__ == "__main__":
    main()
