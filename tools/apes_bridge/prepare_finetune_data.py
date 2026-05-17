from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def normalize(path: Path) -> str:
    return str(path).replace("\\", "/")


def count_files(root: Path, pattern: str) -> int:
    return len(list(root.glob(pattern))) if root.exists() else 0


def split_health(root: Path, split: str) -> dict[str, Any]:
    folder = root / split
    h5_path = folder / f"okaysamurai_{split}.h5"
    return {
        "split": split,
        "path": normalize(folder),
        "exists": folder.exists(),
        "h5": normalize(h5_path),
        "h5_exists": h5_path.exists(),
        "png_count": count_files(folder, "*.png"),
        "corr_count": count_files(folder, "*_corr.npy"),
        "predcorr_count": count_files(folder, "*_predcorr.npy"),
    }


def creative_flow_health(root: Path, split: str) -> dict[str, Any]:
    folder = root / split
    return {
        "split": split,
        "path": normalize(folder),
        "exists": folder.exists(),
        "pair_count": count_files(folder, "*_corr.npy"),
        "image0_count": count_files(folder, "*_0.png"),
        "image1_count": count_files(folder, "*_1.png"),
        "mask0_count": count_files(folder, "*_0_mask.png"),
        "mask1_count": count_files(folder, "*_1_mask.png"),
    }


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def resolve_frame_path(raw_path: str, root: Path) -> Path:
    if raw_path.startswith("/@fs/"):
        return Path(raw_path.removeprefix("/@fs/"))
    if raw_path.startswith("/"):
        return root / raw_path.removeprefix("/")
    return root / raw_path


def write_alpha_mask(source: Path, target: Path) -> None:
    with Image.open(source) as image:
        alpha = image.convert("RGBA").getchannel("A")
        mask = alpha.point(lambda value: 255 if value > 0 else 0, mode="L")
        mask.save(target)


def prepare_duelyst_sheet_dataset(private_manifest: Path, output_root: Path, root: Path) -> dict[str, Any]:
    manifest = read_json(private_manifest)
    dataset_root = output_root / "duelyst_sheets"
    if dataset_root.exists():
        shutil.rmtree(dataset_root)
    dataset_root.mkdir(parents=True, exist_ok=True)

    if not manifest:
        return {
            "path": normalize(dataset_root),
            "character_count": 0,
            "source_manifest": normalize(private_manifest),
            "warnings": ["Private Duelyst manifest is missing. Run npm run duelyst:private-manifest first."],
        }

    characters = manifest.get("staged_manifest", {}).get("characters", [])
    copied = 0
    warnings: list[str] = []
    for character in characters:
        character_id = character.get("character_id")
        frame_path = character.get("representative_frame")
        if not character_id or not frame_path:
            continue
        source = resolve_frame_path(frame_path, root)
        if not source.exists():
            warnings.append(f"Missing staged Duelyst frame: {normalize(source)}")
            continue
        character_dir = dataset_root / character_id
        character_dir.mkdir(parents=True, exist_ok=True)
        target_image = character_dir / f"{character_id}_0.png"
        target_mask = character_dir / f"{character_id}_0_mask.png"
        target_label = character_dir / "label.json"
        labels = character.get("labels", {})
        shutil.copy2(source, target_image)
        write_alpha_mask(source, target_mask)
        target_label.write_text(
            json.dumps(
                {
                    "character_id": character_id,
                    "display_name": character.get("display_name", character_id),
                    "source_manifest": normalize(private_manifest),
                    "representative_frame": frame_path,
                    "image": normalize(target_image),
                    "alpha_mask": normalize(target_mask),
                    "labels": labels,
                    "body_class": labels.get("body_class"),
                    "detector_class": labels.get("detector_class"),
                    "training_role": labels.get("training_role"),
                    "needs_manual_review": labels.get("needs_manual_review", True),
                    "note": "Local Duelyst detector/metadata label for private-tool filtering.",
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        copied += 1

    return {
        "path": normalize(dataset_root),
        "character_count": copied,
        "source_manifest": normalize(private_manifest),
        "warnings": warnings,
        "purpose": "Inference, pseudo-labeling, APES output generation, and future weak-supervision experiments.",
    }


def build_commands(root: Path, output_root: Path) -> dict[str, list[str]]:
    py = "micromamba run -n apes-gpu-modern python"
    apes = root / "vendor" / "APES"
    def q(path: Path) -> str:
        return f'"{normalize(path)}"'

    return {
        "corrnet_creative_flow": [
            f"cd {q(apes)}",
            (
                f"{py} training/train_correspondence.py --dataset creativeflow --epochs 20 --workers 0 "
                f"--train_folder={q(root / 'assets' / 'creative_flow' / 'train')} "
                f"--val_folder={q(root / 'assets' / 'creative_flow' / 'val')} "
                f"--test_folder={q(root / 'assets' / 'creative_flow' / 'test')} "
                f"--checkpoint={q(root / 'checkpoints' / 'finetune_corrnet_creative_flow')} "
                f"--logdir={q(root / 'logs' / 'finetune_corrnet_creative_flow')}"
            ),
        ],
        "corrnet_okay_samurai": [
            f"cd {q(apes)}",
            (
                f"{py} training/train_correspondence.py --dataset okaysamurai --epochs 20 --workers 0 "
                f"--train_folder={q(root / 'assets' / 'okay_samurai' / 'train')} "
                f"--val_folder={q(root / 'assets' / 'okay_samurai' / 'val')} "
                f"--test_folder={q(root / 'assets' / 'okay_samurai' / 'test')} "
                f"--checkpoint={q(root / 'checkpoints' / 'finetune_corrnet_okay_samurai')} "
                f"--logdir={q(root / 'logs' / 'finetune_corrnet_okay_samurai')}"
            ),
        ],
        "fullnet_okay_samurai": [
            f"cd {q(apes)}",
            (
                f"{py} training/train_fullnet.py --epochs 50 --workers 0 --offline_corr "
                f"--init_corrnet_path={q(root / 'checkpoints' / 'pretrain_corrnet_os' / 'model_best.pth.tar')} "
                f"--init_fullnet_path={q(root / 'checkpoints' / 'train_cluster' / 'model_best.pth.tar')} "
                f"--train_folder={q(root / 'assets' / 'okay_samurai' / 'train')} "
                f"--val_folder={q(root / 'assets' / 'okay_samurai' / 'val')} "
                f"--test_folder={q(root / 'assets' / 'okay_samurai' / 'test')} "
                f"--checkpoint={q(root / 'checkpoints' / 'finetune_fullnet_okay_samurai')} "
                f"--logdir={q(root / 'logs' / 'finetune_fullnet_okay_samurai')}"
            ),
        ],
        "duelyst_pseudo_label_review": [
            f"{py} tools/apes_bridge/check_apes_env.py --test-folder {q(output_root / 'duelyst_sheets')} --json",
            "Create APES Lab jobs against staged Duelyst characters, then inspect generated masks before using them in supervised or weak-supervised experiments.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare local APES fine-tuning manifests and Duelyst review data.")
    parser.add_argument("--output", type=Path, default=Path("data") / "training" / "apes_finetune")
    parser.add_argument("--duelyst-manifest", type=Path, default=Path("public") / "data" / "manifests" / "duelyst.private.json")
    args = parser.parse_args()

    root = repo_root()
    output_root = (root / args.output).resolve() if not args.output.is_absolute() else args.output.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    okay_root = root / "assets" / "okay_samurai"
    creative_root = root / "assets" / "creative_flow"
    sheets_root = root / "assets" / "okaysamurai_sheets"
    duelyst_manifest = (root / args.duelyst_manifest).resolve() if not args.duelyst_manifest.is_absolute() else args.duelyst_manifest.resolve()
    duelyst_dataset = prepare_duelyst_sheet_dataset(duelyst_manifest, output_root, root)

    manifest = {
        "format": "pixel_creator_apes_finetune_manifest",
        "version": 1,
        "output_root": normalize(output_root),
        "datasets": {
            "okay_samurai_supervised": {
                "root": normalize(okay_root),
                "splits": [split_health(okay_root, split) for split in ("train", "val", "test")],
                "purpose": "Supervised APES corrnet/fullnet fine-tuning.",
            },
            "creative_flow_supervised": {
                "root": normalize(creative_root),
                "splits": [creative_flow_health(creative_root, split) for split in ("train", "val", "test")],
                "purpose": "Supervised corrnet pretraining/fine-tuning.",
            },
            "okaysamurai_sheets_runtime": {
                "root": normalize(sheets_root),
                "character_count": len([path for path in sheets_root.iterdir() if path.is_dir()]) if sheets_root.exists() else 0,
                "purpose": "APES inference/preflight sheet-style test data.",
            },
            "duelyst_private_runtime": duelyst_dataset,
        },
        "commands": build_commands(root, output_root),
        "warnings": [
            "Duelyst assets are private local inputs. Do not commit or redistribute generated Duelyst frames or manifests.",
            "Duelyst staged frames are private-tool inputs for APES inference, pseudo-labeling, or later weak-supervision passes.",
            "Fullnet fine-tuning expects predcorr files from corrnet evaluation/precomputation.",
        ],
    }

    manifest_path = output_root / "finetune_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote APES fine-tune manifest: {normalize(manifest_path)}")


if __name__ == "__main__":
    main()
