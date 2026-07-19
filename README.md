# Time Management by O'Neal - Fall 2026

Recommended GitHub repository name: `oneal-time-management-extension-gpl3`

Chrome Manifest V3 extension for timing a personal Fall 2026 workflow and creating a ChatGPT-ready productivity report.

## What it does

- Opens `https://j03.page/time-management-by-oneal-gpl3/` when first installed.
- Records detected current date and time.
- Lets the user manually change the session date, minute, and coded hour.
- Uses the hour code map `H,K,Q,4,5,6,D,S,W,V,F,I,C,M,15,16,17,18,19,20,21,22,L,G` for hours 1 through 24.
- Supports Core timed steps only and Detailed: every step timed.
- Supports pause/resume. Paused time is excluded from step totals.
- Exports a ChatGPT-ready report.

## Permissions

This version requests only `storage`. It does not request `tabs`, host permissions, web history, cookies, scripting, or activeTab.

## Plaintext workflow note

The bundled workflow text is stored in `encrypted_workflow.js` so it is not immediately readable by casually browsing GitHub source. The key is included so the extension can run and so users can decrypt the workflow. This is obfuscation, not strong secrecy.

## Decrypt workflow text

```bash
chmod +x decrypt_workflow.sh
./decrypt_workflow.sh
```

## Re-encrypt after editing

```bash
./decrypt_workflow.sh
# edit workflow.decrypted.json
./encrypt_workflow.sh workflow.decrypted.json
```
