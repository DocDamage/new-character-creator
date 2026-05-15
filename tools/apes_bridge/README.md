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

`run_apes_extract.py` currently provides the bridge contract, status files, logs, and deterministic placeholder masks. Replace `generate_placeholder_masks` with the real APES invocation when the APES runtime is installed.

The app treats APES as a core extraction path, not a side experiment: every report includes provenance, semantic labels, review status, warnings, and editable mask paths.

Reports can be imported from the APES Lab with the `Import APES report JSON` control. Imported masks are converted into the same `ExtractedPart` records as preset, connected-pixel, and manual cleanup outputs, preserving APES confidence and warnings for review.
