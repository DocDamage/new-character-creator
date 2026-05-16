# APES Bridge

This folder is the first-class APES integration point for the character creator.

The React app creates APES job configs and expects APES inputs/outputs to use this file contract:

```text
data/apes/input/<job_id>/
  job.json
  frames/

data/apes/output/<job_id>/
  status.json
  apes_report.json
  masks/
    head_mask.png
    torso_mask.png
    front_arm_mask.png
    back_arm_mask.png
    front_leg_mask.png
    back_leg_mask.png
```

`run_apes_extract.py` now has a real bridge path. In default mode it:

- prepares a temporary APES test folder from the job's selected sprite frames and alpha silhouettes
- resolves app paths including Vite `/@fs/...` references from staged local assets
- normalizes runtime APES inputs to 256x256, which the vendored model expects
- runs `vendor/APES/inference/inference_os.py`
- writes `status.json`, `preflight.json`, and `apes_report.json`
- relabels APES part masks back onto the creator's core semantic labels with a preset-bounds heuristic
- writes a completed empty review report when APES runs but selects zero usable parts

Use placeholder masks only when you explicitly opt in for harness work:

```text
python tools/apes_bridge/run_apes_extract.py data/apes/input/<job_id>/job.json --allow-placeholder
```

The preflight currently verifies:

- vendored APES source exists under `vendor/APES`
- `checkpoints/train_cluster/model_best.pth.tar` exists
- the default test folder exists under `training data/okaysamurai_sheets`
- the active Python interpreter and required import modules are present
- PyTorch reports CUDA availability
- `conda`/`mamba` and `nvidia-smi` availability in `PATH`
- `tensorboard`, which APES imports through its training utilities even during inference startup

On the home GPU PC, the current working environment is `apes-gpu-modern`. It has been verified with:

- Python `3.10.20`
- PyTorch `2.5.1+cu124`
- TorchVision `0.20.1+cu124`
- PyTorch3D `0.7.8`
- `torch-scatter 2.1.2+pt25cu124`
- `torch-cluster 1.6.3+pt25cu124`
- `opencv-python-headless 4.10.0.84`
- `numpy 1.26.4`
- CUDA available on the RTX 3060
- TensorBoard `2.20.0`

The detailed rebuild recipe is in `docs/apes-gpu-rebuild.md`.

The main PyTorch3D root cause was Windows toolchain mismatch: CUDA rejected VS 2026, CUDA 12.1 rejected the installed VS 2022 STL, and a mixed `cuda-nvcc`/`cuda-cccl` environment produced misleading CUB/Thrust errors. The working path is VS 2022 Build Tools plus CUDA 12.4 PyTorch wheels, then a source build of PyTorch3D.

For older CUDA-capable setup attempts, these helper files remain available:

- `environment.gpu.yml` creates the dedicated APES runtime environment
- `setup_home_pc.ps1` updates that environment and runs a preflight check inside it

The current known-good setup is newer than the original APES target and is documented in `docs/apes-gpu-rebuild.md`.

The vendored APES runtime has compatibility shims for the modern Windows GPU environment:

- `torch_batch_svd` is optional; APES falls back to `torch.linalg.svd` when the native extension is unavailable.
- Removed `torch.symeig` calls are routed through `torch.linalg.eigh`.
- Current scikit-image uses `max_num_iter` for SLIC; the vendored APES call has been updated.
- The inference loader uses Windows-safe path basename handling.
- The bridge normalizes runtime APES frames to 256x256, which the vendored model expects.
- APES bridge output paths are resolved to absolute repo paths before launching vendored inference, avoiding `vendor/APES` cwd surprises.

## Fine-tuning data preparation

Run this from the repo root:

```text
npm run duelyst:private-manifest -- --stage-count 64
npm run apes:prepare-finetune
npm run apes:prepare-duelyst-jobs
```

The prep command writes:

```text
data/training/apes_finetune/finetune_manifest.json
data/training/apes_finetune/duelyst_sheets/
data/apes/input/duelyst_job_batch.json
```

Each Duelyst staged character folder contains:

- `<character_id>_0.png`: the private representative crop copied from the local staged cache
- `<character_id>_0_mask.png`: an alpha-derived foreground mask
- `label.json`: source family, filename/animation labels, detector class, final broad `body_class`, `training_role`, and the detector metrics used for review triage

The manifest inventories the local supervised datasets and emits quoted Windows-safe commands for APES training:

- `creative_flow` corrnet fine-tuning from `assets/creative_flow/{train,val,test}`
- `okay_samurai` corrnet fine-tuning from `assets/okay_samurai/{train,val,test}`
- `okay_samurai` fullnet fine-tuning from existing corrnet/fullnet checkpoints
- Duelyst pseudo-label review using the private staged sheet dataset

Important: Duelyst staged frames are private local inputs. Their labels are produced from Duelyst path/name/animation metadata plus a lightweight alpha-silhouette detector, not from human-reviewed APES correspondence labels. They should be used for filtering, inference, reviewed APES masks, and pseudo-label generation before being treated as supervised training examples.

`npm run apes:prepare-duelyst-jobs` writes ignored APES job JSON files for the staged APES-review Duelyst candidates. `npm run apes:run-duelyst-jobs` runs those jobs immediately. Current staged Duelyst jobs use real staged idle atlas frames when available and only duplicate a representative crop for one-frame sources. APES may still complete with an empty report when no moving parts can be selected; that empty report is expected for some static or low-motion inputs and is not an environment failure.

Current quality note: the first verified multi-frame Duelyst APES job produced creator-sized `head`, `torso`, and `front_arm` review masks, but missed other requested labels. Treat APES output as review material, not accepted training labels, until masks are manually checked and promoted.

The app treats APES as a core extraction path, not a side experiment: every report includes provenance, semantic labels, review status, warnings, and editable mask paths.

Reports can be imported from the APES Lab with the `Import APES report JSON` control. Imported masks are converted into the same `ExtractedPart` records as preset, connected-pixel, and manual cleanup outputs, preserving APES confidence and warnings for review.

For a no-CUDA browser harness on this machine, run:

```text
npm run qa:apes-harness
```

That command regenerates `public/data/qa/apes_report_harness.json` plus matching part and mask PNGs so the `Load and replace QA sample report` button in APES Lab imports real preview assets even without the APES runtime.

If the app is already running under `npm run dev`, APES Lab also exposes a `Generate local QA harness` button that calls the same generator through the local Vite dev server and imports the refreshed harness report immediately.

## Current verification commands

```text
micromamba run -n apes-gpu-modern python -c "import torch, torchvision, cv2, numpy, pytorch3d, torch_scatter, torch_cluster; print(torch.__version__, torch.version.cuda, torch.cuda.is_available()); print(cv2.__version__, numpy.__version__, pytorch3d.__version__)"
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

Expected preflight state:

- `ready: true`
- every required module present
- `torch.cuda_available: true`
- Python 3.10 warning only
