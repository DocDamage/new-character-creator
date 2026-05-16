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
- runs `vendor/APES/inference/inference_os.py`
- writes `status.json`, `preflight.json`, and `apes_report.json`
- relabels APES part masks back onto the creator's core semantic labels with a preset-bounds heuristic

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

On this repo's current Windows machine, the typical blockers are missing conda tooling, missing APES Python modules, and no configured CUDA path.

For the CUDA-capable home PC, use the included setup files in this folder:

- `environment.gpu.yml` creates the dedicated APES runtime environment
- `setup_home_pc.ps1` updates that environment and runs a preflight check inside it

The app treats APES as a core extraction path, not a side experiment: every report includes provenance, semantic labels, review status, warnings, and editable mask paths.

Reports can be imported from the APES Lab with the `Import APES report JSON` control. Imported masks are converted into the same `ExtractedPart` records as preset, connected-pixel, and manual cleanup outputs, preserving APES confidence and warnings for review.

For a no-CUDA browser harness on this machine, run:

```text
npm run qa:apes-harness
```

That command regenerates `public/data/qa/apes_report_harness.json` plus matching part and mask PNGs so the `Load and replace QA sample report` button in APES Lab imports real preview assets even without the APES runtime.

If the app is already running under `npm run dev`, APES Lab also exposes a `Generate local QA harness` button that calls the same generator through the local Vite dev server and imports the refreshed harness report immediately.
