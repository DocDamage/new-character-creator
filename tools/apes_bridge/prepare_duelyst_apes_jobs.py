from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


APES_LABELS = ["head", "torso", "front_arm", "back_arm", "front_leg", "back_leg"]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def normalize(path: Path) -> str:
    return str(path).replace("\\", "/")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def role_matches(labels: dict[str, Any], role_filter: str) -> bool:
    role = labels.get("training_role")
    if not isinstance(role, str):
        return False
    if role_filter == "apes":
        return role.startswith("apes_")
    return role == role_filter


def build_job(character: dict[str, Any], index: int) -> dict[str, Any]:
    character_id = character["character_id"]
    frame_path = character["representative_frame"]
    labels = character.get("labels") if isinstance(character.get("labels"), dict) else {}
    job_id = f"apes_{character_id}_{index + 1:03d}"
    frame = {
        "animation": "idle",
        "direction": "south",
        "frame_index": 0,
        "path": frame_path,
    }
    duplicate_frame = {
        **frame,
        "frame_index": 1,
    }
    return {
        "job_id": job_id,
        "character_id": character_id,
        "animations": ["idle"],
        "directions": ["south"],
        "frame_range": [0, 1],
        "output_labels": APES_LABELS,
        "status": "prepared",
        "created_at": None,
        "input_frames": [frame, duplicate_frame],
        "output_root": f"data/apes/output/{job_id}",
        "source": {
            "kind": "duelyst_private_staged_crop",
            "display_name": character.get("display_name", character_id),
            "labels": labels,
            "representative_frame": frame_path,
        },
        "logs": [
            "Prepared from private Duelyst staged crop.",
            "Duplicated the staged source frame so the APES bridge has the minimum two-frame runtime input.",
            "Review output masks carefully before promotion or training.",
        ],
    }


def select_characters(manifest: dict[str, Any], role_filter: str, body_class: str, limit: int | None) -> list[dict[str, Any]]:
    characters = manifest.get("staged_manifest", {}).get("characters", [])
    selected: list[dict[str, Any]] = []
    for character in characters:
        labels = character.get("labels") if isinstance(character.get("labels"), dict) else {}
        if role_filter != "all" and not role_matches(labels, role_filter):
            continue
        if body_class != "all" and labels.get("body_class") != body_class:
            continue
        if not character.get("character_id") or not character.get("representative_frame"):
            continue
        selected.append(character)
        if limit is not None and len(selected) >= limit:
            break
    return selected


def run_job(job_path: Path, output_dir: Path, allow_placeholder: bool) -> dict[str, Any]:
    command = [
        sys.executable,
        str(repo_root() / "tools" / "apes_bridge" / "run_apes_extract.py"),
        str(job_path),
        "--output",
        str(output_dir),
    ]
    if allow_placeholder:
        command.append("--allow-placeholder")
    result = subprocess.run(command, cwd=repo_root(), capture_output=True, text=True, check=False)
    return {
        "job": normalize(job_path),
        "output": normalize(output_dir),
        "status": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare local APES jobs from the private Duelyst staged manifest.")
    parser.add_argument("--duelyst-manifest", type=Path, default=Path("public") / "data" / "manifests" / "duelyst.private.json")
    parser.add_argument("--output", type=Path, default=Path("data") / "apes" / "input")
    parser.add_argument("--role", default="apes", help="Use 'apes' for all apes_* roles, 'all', or an exact training_role.")
    parser.add_argument("--body-class", default="all", help="Use all, humanoid, unknown, creature, mech, or structure.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--run", action="store_true", help="Run each prepared job immediately through run_apes_extract.py.")
    parser.add_argument("--allow-placeholder", action="store_true", help="Pass --allow-placeholder when --run is used.")
    args = parser.parse_args()

    root = repo_root()
    manifest_path = (root / args.duelyst_manifest).resolve() if not args.duelyst_manifest.is_absolute() else args.duelyst_manifest.resolve()
    output_root = (root / args.output).resolve() if not args.output.is_absolute() else args.output.resolve()
    manifest = read_json(manifest_path)
    selected = select_characters(manifest, args.role, args.body_class, args.limit)

    jobs: list[dict[str, Any]] = []
    run_results: list[dict[str, Any]] = []
    for index, character in enumerate(selected):
        job = build_job(character, index)
        job_dir = output_root / job["job_id"]
        job_path = job_dir / "job.json"
        write_json(job_path, job)
        jobs.append(
            {
                "job_id": job["job_id"],
                "character_id": job["character_id"],
                "job_path": normalize(job_path),
                "output_root": job["output_root"],
                "training_role": job["source"]["labels"].get("training_role"),
                "body_class": job["source"]["labels"].get("body_class"),
            }
        )
        if args.run:
            run_results.append(run_job(job_path, root / job["output_root"], args.allow_placeholder))

    batch_manifest = {
        "format": "pixel_creator_duelyst_apes_job_batch",
        "source_manifest": normalize(manifest_path),
        "input_root": normalize(output_root),
        "job_count": len(jobs),
        "filters": {
            "role": args.role,
            "body_class": args.body_class,
            "limit": args.limit,
        },
        "jobs": jobs,
        "run_results": run_results,
        "warnings": [
            "Duelyst jobs duplicate a single staged crop to satisfy the APES bridge two-frame minimum.",
            "Treat generated masks as review candidates, not ground-truth labels.",
        ],
    }
    batch_path = output_root / "duelyst_job_batch.json"
    write_json(batch_path, batch_manifest)
    print(f"Wrote {len(jobs)} Duelyst APES job(s): {normalize(batch_path)}")
    if args.run:
        failures = [item for item in run_results if item["status"] != 0]
        if failures:
            raise SystemExit(f"{len(failures)} Duelyst APES job(s) failed. See {normalize(batch_path)}")


if __name__ == "__main__":
    main()
