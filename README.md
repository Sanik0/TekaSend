# TekaSend

A Chrome Manifest V3 extension that highlights likely sensitive text, offers visual masking actions, and warns when sensitive text is pasted or typed into fields.

## Run locally

1. Install Node.js 20 or newer and a current desktop Chrome.
2. In this folder, run `npm install` and then `npm run build`.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select this project's `dist` folder.
4. Run `npm run demo` in a second terminal and open `http://127.0.0.1:8000/`. If XAMPP is already serving this folder, you can instead open `http://localhost/AppBuilders_hackathon_app/demo/`.
5. Reload the demo page after installing or rebuilding the extension.

On Windows PowerShell, use `npm.cmd` in place of `npm` if PowerShell blocks `npm.ps1` under its execution policy.

The local rules work with no account or API key. Try clicking a colored match, selecting ordinary text, left clicking the image, pasting `alex@example.com` into the textarea, and adding a dynamic sample line.

## Optional AI fallback

Open the extension popup, paste **your own OpenAI API key**, enable AI analysis, and save. The extension then sends at most 5,000 characters of visible page text once per page load and up to 5,000 characters from each paste to OpenAI for extra detection. The **Run AI scan now** button repeats the page scan. The key is stored in `chrome.storage.local`, never in the source code; remove it from the popup when finished. API requests use the `gpt-4o-mini` Responses API with `store: false`. Usage may incur charges. Only enable it for synthetic demo data or pages you are permitted to send to the provider. The local rules continue to work when AI is off or unavailable.

## Behavior and limits

- Red highlights: passwords, key formats, bearer tokens, private key headers. Yellow: emails and Philippine mobile numbers. These are heuristics and can miss secrets or flag examples.
- Click a match to **Blur**, replace with **Dummy text**, **Redact**, or **Restore**. Select other page text for manual actions. Left click an image for the same actions. The image feature masks the entire image; it does not inspect text inside images.
- Native input and textarea controls cannot display per-substring highlights. They show a nearby warning instead. On a field, Blur affects the whole control; replacement and redaction affect the selected characters.
- This is visual masking for the current page. It does **not** stop the site from reading data already entered or submitted, nor does it sanitize screenshots of other tabs, network requests, or the page's own JavaScript state.
- Chrome blocks content scripts on its internal pages and some protected pages. Reload a normal `http` or `https` page after installation.

## Development

Run `npm run watch` while editing, then reload the extension and page. Run `npm run typecheck` and `npm test` to check source and detection cases.
