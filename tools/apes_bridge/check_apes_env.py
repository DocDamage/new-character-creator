from __future__ import annotations

import argparse
import importlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any


REQUIRED_MODULES = (
    "torch",
    "torchvision",
    "cv2",
    "h5py",
    "skimage",
    "scipy",
    "numpy",
    "tqdm",
)

EXPECTED_CHECKPOINT = Path("checkpoints") / "train_cluster" / "model_best.pth.tar"
EXPECTED_VENDOR_ROOT = Path("vendor") / "APES"
EXPECTED_OS_TEST_FOLDER = Path("training data") / "okaysamurai_sheets"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _normalize_path(path: Path) -> str:
    return str(path).replace("\\", "/")


def _find_char_dirs(test_folder: Path) -> list[Path]:
    if not test_folder.exists() or not test_folder.is_dir():
        return []
    return sorted(path for path in test_folder.iterdir() if path.is_dir())


def resolve_repo_path(raw_path: str | Path, repo_root: Path | None = None) -> Path:
    repo = repo_root or _repo_root()
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return (repo / path).resolve()


def _sample_data_health(test_folder: Path) -> dict[str, Any]:
    char_dirs = _find_char_dirs(test_folder)
    sample = char_dirs[0] if char_dirs else None
    sample_frames = 0
    sample_masks = 0
    if sample is not None:
        sample_frames = len(list(sample.glob("*.png")))
        sample_masks = len(list(sample.glob("*_mask.png")))
    return {
        "exists": test_folder.exists(),
        "character_count": len(char_dirs),
        "sample_character": sample.name if sample is not None else None,
        "sample_png_count": sample_frames,
        "sample_mask_count": sample_masks,
    }


def _import_status() -> tuple[dict[str, bool], dict[str, str]]:
    available: dict[str, bool] = {}
    details: dict[str, str] = {}
    for module_name in REQUIRED_MODULES:
        try:
            importlib.import_module(module_name)
        except Exception as exc:  # pragma: no cover - import failure is environment-specific
            available[module_name] = False
            details[module_name] = str(exc)
        else:
            available[module_name] = True
    return available, details


def _torch_details() -> dict[str, Any]:
    try:
        torch = importlib.import_module("torch")
    except Exception as exc:  # pragma: no cover - import failure is environment-specific
        return {
            "installed": False,
            "error": str(exc),
            "cuda_available": False,
        }

    cuda_available = False
    try:
        cuda_available = bool(torch.cuda.is_available())
    except Exception as exc:  # pragma: no cover - torch runtime issue is environment-specific
        return {
            "installed": True,
            "version": getattr(torch, "__version__", None),
            "cuda_available": False,
            "cuda_error": str(exc),
        }

    return {
        "installed": True,
        "version": getattr(torch, "__version__", None),
        "cuda_available": cuda_available,
    }


def build_report(test_folder: Path | None = None) -> dict[str, Any]:
    repo_root = _repo_root()
    checkpoint_path = repo_root / EXPECTED_CHECKPOINT
    vendor_root = repo_root / EXPECTED_VENDOR_ROOT
    resolved_test_folder = resolve_repo_path(test_folder, repo_root) if test_folder else (repo_root / EXPECTED_OS_TEST_FOLDER)

    modules, module_errors = _import_status()
    torch_state = _torch_details()
    data_health = _sample_data_health(resolved_test_folder)

    findings: list[str] = []
    if sys.version_info[:2] != (3, 7):
        findings.append(
            f"APES upstream targets Python 3.7; current interpreter is {sys.version.split()[0]}."
        )
    if not checkpoint_path.exists():
        findings.append(f"Missing checkpoint: {_normalize_path(checkpoint_path)}")
    if not vendor_root.exists():
        findings.append(f"Missing vendored APES root: {_normalize_path(vendor_root)}")
    if not data_health["exists"]:
        findings.append(f"Missing APES test folder: {_normalize_path(resolved_test_folder)}")
    elif data_health["character_count"] == 0:
        findings.append(f"APES test folder has no character subfolders: {_normalize_path(resolved_test_folder)}")

    missing_modules = sorted(module_name for module_name, ok in modules.items() if not ok)
    if missing_modules:
        findings.append(f"Missing Python modules: {', '.join(missing_modules)}")

    if not torch_state.get("installed"):
        findings.append("PyTorch is not installed in this interpreter.")
    elif not torch_state.get("cuda_available"):
        findings.append("PyTorch CUDA is unavailable; vendored APES fullnet currently hard-requires GPU KNN.")

    if shutil.which("conda") is None and shutil.which("mamba") is None and shutil.which("micromamba") is None:
        findings.append("No conda-compatible environment manager found in PATH.")
    if shutil.which("nvidia-smi") is None:
        findings.append("nvidia-smi not found in PATH; GPU driver/tooling is not configured.")

    ready = len(findings) == 0
    return {
        "ready": ready,
        "repo_root": _normalize_path(repo_root),
        "python": {
            "version": sys.version.split()[0],
            "executable": _normalize_path(Path(sys.executable)),
        },
        "paths": {
            "checkpoint": _normalize_path(checkpoint_path),
            "vendor_root": _normalize_path(vendor_root),
            "test_folder": _normalize_path(resolved_test_folder),
        },
        "data": data_health,
        "modules": modules,
        "module_errors": module_errors,
        "torch": torch_state,
        "tools": {
            "conda": shutil.which("conda"),
            "mamba": shutil.which("mamba"),
            "micromamba": shutil.which("micromamba"),
            "nvidia_smi": shutil.which("nvidia-smi"),
        },
        "findings": findings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check whether the local machine can run vendored APES.")
    parser.add_argument(
        "--test-folder",
        type=Path,
        default=None,
        help="Optional APES test folder override. Defaults to training data/okaysamurai_sheets under the repo root.",
    )
    parser.add_argument("--json", action="store_true", help="Print the full JSON report.")
    args = parser.parse_args()

    report = build_report(args.test_folder)
    if args.json:
        print(json.dumps(report, indent=2))
        return

    print(f"ready={report['ready']}")
    for finding in report["findings"]:
        print(f"- {finding}")


if __name__ == "__main__":
    main()