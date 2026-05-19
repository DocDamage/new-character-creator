# APES GPU Rebuild Runbook

This is the reproducible setup that fixed the local PyTorch3D/APES runtime on a Windows home PC with an NVIDIA RTX 3060.

## Final Working Runtime

- Windows PowerShell
- NVIDIA RTX 3060, CUDA-capable driver visible through `nvidia-smi`
- Visual Studio 2022 Build Tools at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`
- Micromamba environment: `apes-gpu-modern`
- Python `3.10.20`
- PyTorch `2.5.1+cu124`
- TorchVision `0.20.1+cu124`
- PyTorch3D `0.7.8`
- `torch-scatter 2.1.2+pt25cu124`
- `torch-cluster 1.6.3+pt25cu124`
- `opencv-python-headless 4.10.0.84`
- `numpy 1.26.4`
- `tensorboard 2.20.0`

The repo preflight currently reports `ready: true` with only a warning that upstream APES originally targeted Python 3.7.

## What Was Broken

PyTorch3D was the hard blocker.

The failed paths were:

- Installing `pytorch3d` from conda-forge/pytorch3d on Windows installed a CPU package and replaced CUDA PyTorch with CPU PyTorch.
- Building PyTorch3D with Visual Studio 2026 failed because CUDA rejected the MSVC version.
- Bypassing that compiler gate let CUDA's front-end crash.
- Building with CUDA 12.1 and the installed VS 2022 STL failed with `STL1002: Unexpected compiler version, expected CUDA 12.4 or newer`.
- A mixed CUDA env had `cuda-nvcc 12.1` with `cuda-cccl 13.2`, which caused misleading Thrust/CUB compile errors.
- Mixing conda OpenCV and pip OpenCV caused import-order DLL failures after importing `torchvision`.

The working fix was to use VS 2022 Build Tools, move the Python runtime to PyTorch CUDA 12.4, build PyTorch3D from source, install matching PyG wheels, and keep only pip headless OpenCV.

## From-Scratch Setup

Run these commands from the repo root.

```powershell
micromamba create -n apes-gpu-modern -c conda-forge python=3.10 h5py scipy scikit-image tqdm pillow matplotlib iopath fvcore -y
micromamba install -n apes-gpu-modern -c nvidia -c conda-forge cuda-nvcc=12.4 cuda-cccl=12.4 cuda-cccl_win-64=12.4 cuda-cudart-dev=12.4 -y
```

Install CUDA PyTorch from the official PyTorch wheel index:

```powershell
micromamba run -n apes-gpu-modern python -m pip install --force-reinstall torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
```

Install OpenCV and keep NumPy on the 1.x ABI:

```powershell
micromamba run -n apes-gpu-modern python -m pip install opencv-python-headless==4.10.0.84
micromamba run -n apes-gpu-modern python -m pip install --force-reinstall "numpy==1.26.4"
```

Build PyTorch3D from source with VS 2022 Build Tools:

```powershell
cmd.exe /c "call ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set ""FORCE_CUDA=1"" && set ""TORCH_CUDA_ARCH_LIST=8.6"" && set ""DISTUTILS_USE_SDK=1"" && set ""MAX_JOBS=2"" && set ""CUB_HOME=%APPDATA%\mamba\envs\apes-gpu-modern\include"" && micromamba run -n apes-gpu-modern python -m pip install --no-build-isolation --no-cache-dir ""git+https://github.com/facebookresearch/pytorch3d.git@stable"""
```

Install matching PyTorch Geometric extension wheels:

```powershell
micromamba run -n apes-gpu-modern python -m pip install --force-reinstall torch-scatter torch-cluster -f https://data.pyg.org/whl/torch-2.5.1+cu124.html
micromamba run -n apes-gpu-modern python -m pip install --force-reinstall "numpy==1.26.4"
```

Install TensorBoard for APES inference startup:

```powershell
micromamba run -n apes-gpu-modern python -m pip install tensorboard
```

`torch_batch_svd` is intentionally not required on this Windows setup. The upstream package currently passes a GCC-only flag to MSVC, so the vendored APES code falls back to `torch.linalg.svd`.

## Asset Links

The APES bridge expects the historical paths below. On this machine they are junctions into ignored asset folders:

```text
checkpoints -> assets/checkpoints
training data/okaysamurai_sheets -> assets/okaysamurai_sheets
```

Create them if they are missing:

```powershell
New-Item -ItemType Junction -Path checkpoints -Target assets\checkpoints
New-Item -ItemType Directory -Force "training data"
New-Item -ItemType Junction -Path "training data\okaysamurai_sheets" -Target assets\okaysamurai_sheets
```

## Verification

Run the import smoke check:

```powershell
micromamba run -n apes-gpu-modern python -c "import torch, torchvision, cv2, numpy, pytorch3d, torch_scatter, torch_cluster, tensorboard; print(torch.__version__, torch.version.cuda, torch.cuda.is_available()); print(cv2.__version__, numpy.__version__, pytorch3d.__version__)"
```

Expected result includes:

```text
2.5.1+cu124 12.4 True
4.10.0 1.26.4 0.7.8
```

Run the repo preflight:

```powershell
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

Expected result:

- `ready: true`
- all required modules set to `true`
- `torch.cuda_available: true`
- only warning is the upstream APES Python 3.7 target note

APES runtime compatibility fixes tracked in the repo:

- Vite `/@fs/...` staged frame paths resolve in the bridge.
- Bridge runtime inputs are resized to 256x256 for the vendored APES model.
- Bridge output/runtime paths are absolute before launching `vendor/APES/inference/inference_os.py`.
- Vendored APES uses `torch.linalg.svd` when `torch_batch_svd` is missing.
- Vendored APES uses `torch.linalg.eigh` instead of removed `torch.symeig`.
- Vendored APES uses current scikit-image `slic(max_num_iter=...)`.
- Vendored APES uses Windows-safe path basename handling.

Run the frontend checks:

```powershell
npm run lint
npm run test:tools
npm run build
npm run test:browser
npm run production:check
```

The browser harness also exercises the current LPC runtime path: grouped
body-base mannequins, canonical LPC animation labels, and compatible sheet-part
selection in Fast Creator. That coverage does not require the GPU APES
environment, but it is a useful companion check after rebuilding the local asset
tooling because LPC previews and APES staged assets both depend on the same
project-local Vite file serving rules.

## Production Boundary

The GPU APES environment, private Duelyst staging, and local APES bridge are
development-only tooling. They are not shipped in the public static package.
Production readiness is measured by `npm run production:check`, which includes
secret scanning, license audit generation, RAG evaluation, hosted RAG
validation, release validation, preview local-tool smoke coverage, and browser
regression.

## Private Duelyst And Fine-Tune Prep

After the runtime is ready, prepare the private Duelyst manifest and APES fine-tuning inventory:

```powershell
npm run duelyst:private-manifest -- --stage-count 64
npm run apes:prepare-finetune
```

Expected local-only outputs:

```text
public/data/manifests/duelyst.private.json
data/training/apes_finetune/finetune_manifest.json
data/training/apes_finetune/duelyst_sheets/
```

The private manifest labels all detected Duelyst unit sheets and stages the requested review subset. Labels include source family, normalized animation names, broad body class, training role, and alpha-silhouette detector metrics. Each staged folder under `duelyst_sheets/` also receives a `label.json` beside the copied frame and alpha mask.

Verify the Duelyst review dataset can be used by APES preflight:

```powershell
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --test-folder "data\training\apes_finetune\duelyst_sheets" --json
```

Expected result:

- `ready: true`
- `character_count: 64`
- `torch.cuda_available: true`

Prepare command-line Duelyst APES jobs from the same private staged manifest:

```powershell
npm run apes:prepare-duelyst-jobs
```

This writes ignored job configs under `data/apes/input/` plus `duelyst_job_batch.json`. To execute the prepared jobs through the local bridge:

```powershell
npm run apes:run-duelyst-jobs
```

By default, sprite-specific APES failures are recorded in `duelyst_job_batch.json` and the command exits cleanly so successful reports are still usable. Add `-- --fail-on-job-error` if you want a strict non-zero exit for CI or diagnostics.

Summarize completed local APES outputs for review:

```powershell
npm run apes:summarize-outputs
```

That writes `data/apes/output/apes_output_inventory.json` with report counts, labels, missing expected labels, low-confidence masks, warnings, review state, and failed output folders that contain `status.json` but no APES report.

Current Duelyst staged jobs use real staged idle atlas frames when available and only duplicate a representative crop for one-frame sources. The latest full local batch attempted 60 Duelyst jobs, produced 57 successful job results, and recorded 3 APES segmentation rejects: `apes_duelyst_neutral_mercsongweaver_010`, `apes_duelyst_neutral_mercarcanelimiter_038`, and `apes_duelyst_neutral_mercsightlessfarseer_048`. Output quality is sprite-specific, so inspect failures and low-confidence masks before using them for generated character parts.

## Notes For Future Rebuilds

- Do not install `pytorch3d` from conda on Windows for this env; it can silently drag the runtime back to CPU.
- Keep CUDA toolkit packages internally consistent. `cuda-nvcc` and `cuda-cccl` must be from the same CUDA line.
- Use VS 2022 Build Tools for native extension builds. VS 2026 is too new for this CUDA/PyTorch3D path.
- Avoid installing both conda OpenCV and pip OpenCV in the same env.
- Re-pin `numpy==1.26.4` after pip commands that may upgrade it.
- Install `tensorboard`; APES imports it through training utilities during inference startup.
- `torch_batch_svd` is not required in this Windows env because the vendored APES runtime falls back to `torch.linalg.svd`.
