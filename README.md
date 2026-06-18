# Oneal Time Management Extension GPL3

Suggested GitHub repository name: **oneal-time-management-extension-gpl3**

Time Management by O'Neal is a Manifest V3 Chrome extension that times a detailed or condensed workflow, supports pause/resume, saves local timing records, and creates a ChatGPT-ready improvement report.

## Important privacy note

The personal workflow text is stored in `encrypted_workflow.js` instead of plain text. This is intended to prevent casual source browsing from showing the workflow immediately.

This is **not strong secret protection** because the decryption key is intentionally included in the repository so the extension can run and so you can decrypt the workflow later. Do not put passwords, MFA codes, API keys, private documents, or anything truly secret in the workflow text.

Current text key:

```text
OpmZA$6TkD1w
```

## Chrome permissions

This version uses only:

```json
"permissions": ["storage"]
```

It does not request host permissions. It does not request the `tabs` permission. The extension can still open the project page because creating a new tab does not require declaring the `tabs` permission.

## Local install

1. Download or clone this repository.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select this project folder.
7. Pin the extension.
8. Open the extension popup and start a timing session.

## Decrypt the workflow text

Run:

```bash
chmod +x decrypt_workflow.sh
./decrypt_workflow.sh
```

This creates:

```text
workflow.decrypted.json
```

You can also choose a custom output path:

```bash
./decrypt_workflow.sh /tmp/workflow.json
```

## Edit and re-encrypt the workflow text

1. Decrypt it:

```bash
./decrypt_workflow.sh workflow.decrypted.json
```

2. Edit `workflow.decrypted.json`.

3. Re-encrypt it:

```bash
chmod +x encrypt_workflow.sh
./encrypt_workflow.sh workflow.decrypted.json
```

4. Reload the extension at `chrome://extensions`.

## Use a different key

You can override the key while decrypting or encrypting:

```bash
WORKFLOW_TEXT_KEY='new-key-here' ./encrypt_workflow.sh workflow.decrypted.json
WORKFLOW_TEXT_KEY='new-key-here' ./decrypt_workflow.sh workflow.decrypted.json
```

If you change the key, the extension source will be rewritten to use the new key.

## Chrome Web Store privacy summary

Single purpose: local workflow time tracking and local ChatGPT-ready report generation.

Data category: User activity only.

Storage justification: The extension uses local Chrome storage to save timer state, workflow progress, pause/resume data, completed/skipped steps, selected mode, and local report text.

No data is sold, transmitted to a third-party server, used for advertising, or used for creditworthiness/lending decisions.

## License

GPL-3.0-or-later. Add a full `LICENSE` file before publishing publicly if you want GitHub to display the license automatically.
