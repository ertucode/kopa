#!/bin/bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Kopa can only be signed for macOS on macOS." >&2
    exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_path="${repo_dir}/dist/mac-arm64/Kopa.app"

if [[ ! -d "${app_path}" ]]; then
    echo "Built application not found at ${app_path}." >&2
    exit 1
fi

echo "Applying a local ad-hoc signature to Kopa..."
/usr/bin/xattr -cr "${app_path}"
/usr/bin/codesign --force --deep --sign - "${app_path}"
/usr/bin/codesign --verify --deep --strict "${app_path}"

echo "Kopa was signed successfully."
