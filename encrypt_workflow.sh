#!/usr/bin/env bash
set -euo pipefail

# Re-encrypts a workflow JSON file and rewrites encrypted_workflow.js.
# Usage:
#   ./encrypt_workflow.sh workflow.decrypted.json
#   WORKFLOW_TEXT_KEY='your-key' ./encrypt_workflow.sh workflow.decrypted.json

IN="${1:-workflow.decrypted.json}"
KEY="${WORKFLOW_TEXT_KEY:-OpmZA\$6TkD1w}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$SCRIPT_DIR/encrypted_workflow.js"

python3 - "$IN" "$OUT" "$KEY" <<'PY'
import base64
import hashlib
import json
import sys
from pathlib import Path

in_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
key_text = sys.argv[3]
key = key_text.encode("utf-8")
data = json.loads(in_path.read_text(encoding="utf-8"))
plain = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
enc = bytearray()
for counter, offset in enumerate(range(0, len(plain), 32)):
    digest = hashlib.sha256(key + counter.to_bytes(8, "big")).digest()
    chunk = plain[offset:offset + 32]
    enc.extend(a ^ b for a, b in zip(chunk, digest))
b64 = base64.b64encode(enc).decode("ascii")
out_path.write_text(f'''// Encrypted workflow data for Time Management by O'Neal.\n// This hides the workflow text from casual source browsing.\n// It is not a substitute for keeping secrets out of public repositories, because the key is intentionally included.\nexport const WORKFLOW_TEXT_KEY = {key_text!r};\nexport const ENCRYPTED_WORKFLOW_B64 = `{b64}`;\n\nexport async function decryptWorkflowConfig(key = WORKFLOW_TEXT_KEY) {{\n  const cipher = base64ToBytes(ENCRYPTED_WORKFLOW_B64);\n  const keyBytes = new TextEncoder().encode(key);\n  const plain = new Uint8Array(cipher.length);\n  let counter = 0;\n  for (let offset = 0; offset < cipher.length; offset += 32) {{\n    const counterBytes = new Uint8Array(8);\n    new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);\n    const input = new Uint8Array(keyBytes.length + counterBytes.length);\n    input.set(keyBytes, 0);\n    input.set(counterBytes, keyBytes.length);\n    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));\n    const len = Math.min(32, cipher.length - offset);\n    for (let i = 0; i < len; i++) plain[offset + i] = cipher[offset + i] ^ digest[i];\n    counter++;\n  }}\n  const text = new TextDecoder().decode(plain);\n  return JSON.parse(text);\n}}\n\nfunction base64ToBytes(b64) {{\n  const bin = atob(b64);\n  const out = new Uint8Array(bin.length);\n  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);\n  return out;\n}}\n''', encoding="utf-8")
print(f"Wrote encrypted workflow to {out_path}")
PY
