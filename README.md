# TekaSend

A Chrome Manifest V3 extension that highlights likely sensitive text, offers visual masking actions, and warns when sensitive text is pasted or typed into fields.

## Run locally

Install Node.js 20 or newer and a current desktop Chrome. In **Windows PowerShell**, run these commands from the project folder:

```powershell
npm.cmd install
npm.cmd run model:download
npm.cmd run build
```

`model:download` fetches the [Shield-82M ONNX model](https://huggingface.co/onnx-community/Shield-82M-ONNX) at a pinned revision, including its roughly 82 MB quantized model file, into `.local-model/`. The build copies this model and the matching ONNX Runtime Web files into `dist/`. Both folders are ignored by Git. The download needs an internet connection once; the built extension uses the packaged model locally and does not need a local AI server or an API key.

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project's `dist` folder. After each build or pull, click **Reload** on TekaSend in that page, then refresh the webpage you want to scan. Reloading the extension alone does not replace content scripts already running in open pages.

For coverage across sites, open TekaSend's **Details** in `chrome://extensions` and set **Site access** to **On all sites**. To scan a local `file://` page, also enable **Allow access to file URLs**. Chrome requires these user-controlled settings even when the extension declares matching pages.

For the sample page, run `npm.cmd run demo` in a second terminal and open `http://127.0.0.1:8000/`. If XAMPP serves this folder, use `http://localhost/AppBuilders_hackathon_app/demo/` instead. Try clicking a colored match, pasting `alex@example.com` into the textarea, and adding a dynamic sample line. Click **Scan Active Page** to test the local model on the synthetic person and address.

The deterministic local rules work without downloading the model. The **Scan Active Page** button uses the packaged on-device model when available. The first scan can take longer while Chrome initializes it. OpenAI fallback is off by default and only runs if you explicitly enable it in the popup and local inference fails. Older `aiEnabled` settings do not enable cloud fallback; use **Remove key** in the popup to delete a saved API key.

### If the pulled changes do not appear

1. Confirm Chrome loaded this project's `dist` folder, then run `npm.cmd run build` again.
2. Click **Reload** for TekaSend at `chrome://extensions` and refresh the target webpage.
3. If the local model does not initialize, check that `dist/models/onnx-community/Shield-82M-ONNX/onnx/model_quantized.onnx` and `dist/ort/ort-wasm-simd-threaded.asyncify.wasm` exist. Rerun `npm.cmd run model:download` if the model is missing, then rebuild.
4. From the popup's DevTools Console, `chrome.runtime.sendMessage({ kind: 'MODEL_STATUS_REQUEST' }).then(console.log)` shows the model lifecycle state. It should reach `ready` after a successful scan. If it reports an error, inspect the extension's service worker and offscreen document in `chrome://extensions` for details.

## Behavior and limits

- Red highlights: passwords, key formats, bearer tokens, private key headers. Yellow: names, emails, and Philippine mobile numbers. The fast name rule catches likely full names and single names after labels such as `Name:` or `Dear`; the local model can recognize other single names when context is clear. Name detection is heuristic, so some names may be missed or ordinary capitalized phrases may be flagged.
- Choose **Blur**, **Replace values**, **Placeholder**, or **Spoiler** in the popup. Turn on **Hide by default** to apply that effect automatically to detected sensitive text when a page loads or adds new content. The switch is off by default and also updates open pages. Click masked text to reveal the highlighted original; when the switch is off, click a highlight to apply the selected effect. Right-clicking text uses the browser's normal menu. Selecting arbitrary page text does not create a TekaSend mask.
- Turn off **Show hover tips** under Appearance to hide hints over detected text. Input warnings remain available.
- **Blur** uses soft focus. **Spoiler** uses floating particles that follow wrapped lines. On systems that request reduced motion, the particles stay still. Images use the webpage's normal click and context-menu behavior.
- Dummy text uses different characters while keeping the same visible character count. The replacement has no highlight background.
- Native input and textarea controls cannot display per-substring highlights. They show a nearby warning when sensitive text is entered or pasted.
- This is visual masking for the current page. It does **not** stop the site from reading data already entered or submitted, nor does it sanitize screenshots of other tabs, network requests, or the page's own JavaScript state.
- The content script runs on ordinary `http`, `https`, and permitted `file` pages, including matching frames and page-created `about:blank`/`blob:` frames. It also checks text in code blocks. Chrome internal pages and other protected browser pages remain unavailable to content scripts. Reload any already-open webpage after installation or an extension update.

## Development

Run `npm.cmd run watch` while editing, then reload the extension and page. If you download the model while watch mode is running, restart watch so the model is copied into `dist`. Run `npm.cmd run typecheck` and `npm.cmd test` to check source and detection cases.
