#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$APP_ROOT/.." && pwd)"
ENV_PREFIX="$REPO_ROOT/.apes/envs/apes-cu110"

export CUDA_HOME="$ENV_PREFIX"
export PATH="$ENV_PREFIX/bin:$PATH"
export CC="$ENV_PREFIX/bin/x86_64-conda-linux-gnu-gcc"
export CXX="$ENV_PREFIX/bin/x86_64-conda-linux-gnu-g++"
export TORCH_CUDA_ARCH_LIST="${TORCH_CUDA_ARCH_LIST:-8.6}"
export CPATH="/usr/include:${CPATH:-}"
export CPLUS_INCLUDE_PATH="/usr/include:${CPLUS_INCLUDE_PATH:-}"
export LIBRARY_PATH="/usr/lib/x86_64-linux-gnu:${LIBRARY_PATH:-}"

"$ENV_PREFIX/bin/nvcc" --version
"$CXX" --version | head -1
"$ENV_PREFIX/bin/python" -m pip install --no-deps --no-build-isolation --force-reinstall \
  "git+https://github.com/KinglittleQ/torch-batch-svd.git"
"$ENV_PREFIX/bin/python" - <<'PY'
import torch
from torch_batch_svd import svd

sample = torch.randn(2, 3, 3, device="cuda" if torch.cuda.is_available() else "cpu")
u, s, v = svd(sample)
print("torch", torch.__version__, "cuda", torch.version.cuda, "available", torch.cuda.is_available())
print("torch_batch_svd", tuple(u.shape), tuple(s.shape), tuple(v.shape))
PY
