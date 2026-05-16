from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from check_apes_env import build_report, resolve_repo_path

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

PRESET_BOUNDS = {
    "head": {"x": 20, "y": 4, "w": 24, "h": 18},
    "torso": {"x": 20, "y": 22, "w": 24, "h": 18},
    "front_arm": {"x": 12, "y": 22, "w": 12, "h": 24},
    "back_arm": {"x": 40, "y": 22, "w": 12, "h": 24},
    "front_leg": {"x": 20, "y": 38, "w": 12, "h": 22},
    "back_leg": {"x": 32, "y": 38, "w": 12, "h": 22},
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def normalize_path(path: Path) -> str:
    return str(path).replace("\\", "/")


def report_path(path: Path) -> str:
    root = repo_root().resolve()
    resolved = path.resolve()
    try:
        return normalize_path(resolved.relative_to(root))
    except ValueError:
        return normalize_path(resolved)


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


def write_preflight(output_dir: Path, report: dict[str, Any]) -> None:
    (output_dir / "preflight.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def write_mask(mask_path: Path, rect: tuple[int, int, int, int]) -> None:
    mask = Image.new("L", (64, 64), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(rect, fill=255)
    mask.save(mask_path)


def write_placeholder_part(part_path: Path, source_frame_path: Path, rect: tuple[int, int, int, int]) -> None:
    with Image.open(source_frame_path) as source:
        image = source.convert("RGBA")
    left, top, right, bottom = rect
    part = Image.new("RGBA", image.size, (0, 0, 0, 0))
    cropped = image.crop((left, top, right, bottom))
    part.paste(cropped, (left, top))
    part.save(part_path)


def generate_placeholder_masks(job: dict[str, Any], output_dir: Path) -> list[dict[str, Any]]:
    masks_dir = output_dir / "masks"
    parts_dir = output_dir / "parts"
    masks_dir.mkdir(parents=True, exist_ok=True)
    parts_dir.mkdir(parents=True, exist_ok=True)
    requested_labels = job.get("output_labels") or list(SEMANTIC_MASKS)
    masks: list[dict[str, Any]] = []
    source_frame_path = None
    if job.get("input_frames"):
        source_frame_path = resolve_repo_path(job["input_frames"][0]["path"], repo_root())

    for label in requested_labels:
        rect = SEMANTIC_MASKS.get(label)
        if rect is None:
            continue
        mask_path = masks_dir / f"{label}_mask.png"
        part_path = parts_dir / f"{label}.png"
        write_mask(mask_path, rect)
        if source_frame_path is not None and source_frame_path.exists():
            write_placeholder_part(part_path, source_frame_path, rect)
        masks.append(
            {
                "label": label,
                "path": report_path(mask_path),
                "image_path": report_path(part_path),
                "confidence": 0.42,
                "reviewed": False,
                "source": "apes_bridge_placeholder",
            }
        )

    return masks


def sort_input_frames(job: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        job.get("input_frames", []),
        key=lambda frame: (frame.get("animation", ""), frame.get("direction", ""), int(frame.get("frame_index", 0))),
    )


def prepare_runtime_dataset(job: dict[str, Any], runtime_dir: Path) -> Path:
    frames = sort_input_frames(job)
    if len(frames) < 2:
        raise RuntimeError("APES needs at least 2 input frames to compute correspondence.")

    test_root = runtime_dir / "test"
    char_name = job["job_id"]
    char_dir = test_root / char_name
    if char_dir.exists():
        shutil.rmtree(char_dir)
    char_dir.mkdir(parents=True, exist_ok=True)

    root = repo_root()
    for index, frame in enumerate(frames):
        frame_path = resolve_repo_path(frame["path"], root)
        if not frame_path.exists():
            raise FileNotFoundError(f"Missing APES input frame: {normalize_path(frame_path)}")

        with Image.open(frame_path) as source:
            image = source.convert("RGBA")
            image.convert("RGB").save(char_dir / f"{char_name}_{index}.png")

            alpha = image.getchannel("A")
            mask = alpha.point(lambda value: 255 if value > 0 else 0, mode="L")
            mask.save(char_dir / f"{char_name}_{index}_mask.png")

    return test_root


def run_vendor_inference(job: dict[str, Any], runtime_dir: Path, test_root: Path) -> tuple[list[str], Path]:
    root = repo_root()
    vendor_root = root / "vendor" / "APES"
    raw_output_dir = runtime_dir / "raw_output"
    raw_output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-u",
        "inference/inference_os.py",
        f"--init_weight_path={normalize_path(root / 'checkpoints' / 'train_cluster' / 'model_best.pth.tar')}",
        f"--test_folder={normalize_path(test_root)}",
        f"--output_folder={normalize_path(raw_output_dir)}",
    ]
    result = subprocess.run(
        command,
        cwd=vendor_root,
        capture_output=True,
        text=True,
        check=False,
    )

    logs = [f"Running: {' '.join(command)}"]
    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    if stdout:
        logs.extend(line for line in stdout.splitlines() if line.strip())
    if stderr:
        logs.extend(line for line in stderr.splitlines() if line.strip())
    if result.returncode != 0:
        raise RuntimeError("\n".join(logs) or f"APES inference failed with exit code {result.returncode}.")

    return logs, raw_output_dir / job["job_id"]


def image_bounds(mask: Image.Image) -> dict[str, int] | None:
    box = mask.getbbox()
    if box is None:
        return None
    left, top, right, bottom = box
    return {"x": left, "y": top, "w": right - left, "h": bottom - top}


def rect_iou(left: dict[str, int], right: dict[str, int]) -> float:
    left_x2 = left["x"] + left["w"]
    left_y2 = left["y"] + left["h"]
    right_x2 = right["x"] + right["w"]
    right_y2 = right["y"] + right["h"]
    inter_x1 = max(left["x"], right["x"])
    inter_y1 = max(left["y"], right["y"])
    inter_x2 = min(left_x2, right_x2)
    inter_y2 = min(left_y2, right_y2)
    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h
    union = left["w"] * left["h"] + right["w"] * right["h"] - intersection
    return intersection / union if union else 0.0


def center_distance_score(left: dict[str, int], right: dict[str, int]) -> float:
    left_center = (left["x"] + left["w"] / 2, left["y"] + left["h"] / 2)
    right_center = (right["x"] + right["w"] / 2, right["y"] + right["h"] / 2)
    distance = math.dist(left_center, right_center)
    return max(0.0, 1.0 - (distance / 64.0))


def score_label(candidate_bounds: dict[str, int], label: str) -> float:
    preset = PRESET_BOUNDS.get(label)
    if preset is None:
        return 0.0
    return rect_iou(candidate_bounds, preset) * 0.7 + center_distance_score(candidate_bounds, preset) * 0.3


def assign_masks(job: dict[str, Any], selection_dir: Path) -> tuple[list[dict[str, Any]], list[str]]:
    mask_candidates: list[dict[str, Any]] = []
    warnings: list[str] = []
    for mask_path in sorted(selection_dir.glob("part_*_mask.png")):
        with Image.open(mask_path) as source:
            mask = source.convert("L")
            bounds = image_bounds(mask)
        if bounds is None:
            continue
        image_path = selection_dir / mask_path.name.replace("_mask.png", "_img.png")
        mask_candidates.append(
            {
                "mask_path": mask_path,
                "image_path": image_path,
                "bounds": bounds,
            }
        )

    assigned: list[dict[str, Any]] = []
    remaining = list(mask_candidates)
    for label in job.get("output_labels", []):
        if not remaining:
            warnings.append(f"APES did not produce enough part masks to assign {label}.")
            continue
        ranked = sorted(remaining, key=lambda candidate: score_label(candidate["bounds"], label), reverse=True)
        best = ranked[0]
        remaining.remove(best)
        confidence = round(score_label(best["bounds"], label), 4)
        item_warnings: list[str] = []
        if confidence < 0.2:
            item_warnings.append(f"Weak APES semantic match for {label}; review manually.")
        assigned.append(
            {
                "label": label,
                "mask_path": best["mask_path"],
                "image_path": best["image_path"],
                "bounds": best["bounds"],
                "confidence": confidence,
                "warnings": item_warnings,
            }
        )

    return assigned, warnings


def build_report_from_vendor_output(job: dict[str, Any], output_dir: Path, vendor_output_dir: Path) -> dict[str, Any]:
    selection_dir = vendor_output_dir / "selection_by_deform"
    if not selection_dir.exists():
        raise RuntimeError(f"APES output is missing selection_by_deform: {normalize_path(selection_dir)}")

    assigned_masks, warnings = assign_masks(job, selection_dir)
    masks_dir = output_dir / "masks"
    parts_dir = output_dir / "parts"
    masks_dir.mkdir(parents=True, exist_ok=True)
    parts_dir.mkdir(parents=True, exist_ok=True)

    report_masks: list[dict[str, Any]] = []
    for item in assigned_masks:
        label = item["label"]
        target_mask = masks_dir / f"{label}_mask.png"
        shutil.copy2(item["mask_path"], target_mask)

        target_part = parts_dir / f"{label}.png"
        if item["image_path"].exists():
            shutil.copy2(item["image_path"], target_part)

        report_masks.append(
            {
                "label": label,
                "path": report_path(target_mask),
                "image_path": report_path(target_part),
                "bounds": item["bounds"],
                "confidence": item["confidence"],
                "reviewed": False,
                "warnings": item["warnings"],
            }
        )

    return {
        "job_id": job["job_id"],
        "status": "complete",
        "masks": report_masks,
        "semantic_mapping": {label: label for label in job.get("output_labels", [])},
        "warnings": [
            "APES masks were generated from the vendored inference_os.py runtime.",
            "Review each imported APES mask in the Art Workstation before final export.",
            *warnings,
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the APES extraction bridge for one job config.")
    parser.add_argument("job", type=Path, help="Path to a job JSON file produced by the creator app.")
    parser.add_argument("--output", type=Path, default=None, help="Output folder for masks and apes_report.json.")
    parser.add_argument(
        "--allow-placeholder",
        action="store_true",
        help="Generate deterministic placeholder masks instead of failing when the real APES runtime is unavailable.",
    )
    args = parser.parse_args()

    job = read_job(args.job)
    output_dir = args.output or Path("data") / "apes" / "output" / job["job_id"]
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir = output_dir / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    test_folder = Path(job["test_folder"]) if job.get("test_folder") else None
    preflight = build_report(test_folder)
    write_preflight(output_dir, preflight)
    logs = [
        f"Loaded APES job {job['job_id']}.",
        f"Input frame references: {len(job.get('input_frames', []))}.",
    ]
    if not args.allow_placeholder:
        try:
            test_folder = prepare_runtime_dataset(job, runtime_dir)
            preflight = build_report(test_folder)
            write_preflight(output_dir, preflight)
            logs.append(f"Prepared runtime APES dataset at {normalize_path(test_folder)}.")
        except Exception as exc:
            logs.append("Could not prepare runtime APES dataset.")
            write_status(output_dir, "failed", logs, failure_details=str(exc))
            raise SystemExit(str(exc))

        logs.append("Running APES preflight checks.")
        if not preflight["ready"]:
            logs.append("APES runtime is not ready on this machine.")
            failure_details = " ".join(preflight["findings"])
            write_status(output_dir, "failed", logs, failure_details=failure_details)
            raise SystemExit(failure_details)

        write_status(output_dir, "running", logs)
        try:
            vendor_logs, vendor_output_dir = run_vendor_inference(job, runtime_dir, test_folder)
            logs.extend(vendor_logs)
            report = build_report_from_vendor_output(job, output_dir, vendor_output_dir)
        except Exception as exc:
            logs.append("APES bridge execution failed.")
            write_status(output_dir, "failed", logs, failure_details=str(exc))
            raise SystemExit(str(exc))

        report_path = output_dir / "apes_report.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        logs.append(f"Wrote APES report: {normalize_path(report_path)}")
        write_status(output_dir, "complete", logs)
        print(f"Wrote APES report: {report_path}")
        return

    logs.append("Running placeholder APES bridge by explicit request.")
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
            "Placeholder APES bridge masks were generated by explicit opt-in. The real APES runtime expects a CUDA-capable home PC.",
            "All masks require manual review before production export.",
        ],
    }

    report_path = output_dir / "apes_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    write_status(output_dir, "complete", logs)
    print(f"Wrote APES report: {report_path}")


if __name__ == "__main__":
    main()
