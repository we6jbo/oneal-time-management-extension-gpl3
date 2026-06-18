#!/usr/bin/env bash
set -euo pipefail

# Decrypts encrypted_workflow.js into readable JSON.
# Usage:
#   ./decrypt_workflow.sh
#   WORKFLOW_TEXT_KEY='your-key' ./decrypt_workflow.sh output.json

OUT="${1:-workflow.decrypted.json}"
KEY="${WORKFLOW_TEXT_KEY:-OpmZA\$6TkD1w}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/encrypted_workflow.js"

python3 - "$SRC" "$OUT" "$KEY" <<'PY'
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

src_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
key = sys.argv[3].encode("utf-8")
text = src_path.read_text(encoding="utf-8")
match = re.search(r"ENCRYPTED_WORKFLOW_B64\s*=\s*`([^`]+)`", text, re.S)
if not match:
    raise SystemExit("Could not find ENCRYPTED_WORKFLOW_B64 in encrypted_workflow.js")

cipher = base64.b64decode(match.group(1))
plain = bytearray()
for counter, offset in enumerate(range(0, len(cipher), 32)):
    digest = hashlib.sha256(key + counter.to_bytes(8, "big")).digest()
    chunk = cipher[offset:offset + 32]
    plain.extend(a ^ b for a, b in zip(chunk, digest))

try:
    data = json.loads(plain.decode("utf-8"))
except Exception as exc:
    raise SystemExit(f"Decryption failed. Check key. Details: {exc}")

out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Wrote decrypted workflow JSON to {out_path}")
PY
