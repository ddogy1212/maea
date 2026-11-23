# ELSEWHERE — The Postcard Atelier

An editorial, photo-driven postcard studio, built as an independent second experience inside `maea/elsewhere/`. The original MAEA app at `../` is untouched.

## What works

- **Six photo collections** with large editorial landing imagery.
- **Live postcard editor:** three real 1600px canvas templates — Editorial, Cinema and Heritage — in landscape or portrait format.
- **Front and back:** image-led front, handwritten-letter-inspired reverse, with title, place, date and a 240-character message.
- **Personal photographs:** local JPG / PNG / WEBP up to 20MB, resized to a maximum 2400px edge for storage.
- **Photographic framing:** 100–165% zoom and high quality image smoothing.
- **Download:** actual rendered canvas as full-resolution PNG, both faces. Mobile sharing uses the Web Share API when available and falls back to PNG download.
- **Private archive:** postcards saved with preview thumbnails, edit, search, favorite and delete functions, backed by IndexedDB with localStorage fallback. No account, tracking or servers.
- **Mobile-friendly:** a dedicated bottom navigation on the public site, editor/preview tabs inside the postcard studio, touch-friendly controls and safe-area spacing.
- **PWA:** a separate service worker scoped to `/elsewhere/`; the UI works offline after being loaded online once, and previously viewed landscape images may be cached. Google Fonts and never-loaded images need internet.
- **Keyboard:** `C` to open a new postcard when not typing, `Ctrl/Cmd+S` to save in the editor, `Esc` to close.

## Preview

Run `python3 -m http.server 8080` from the repository root and open `http://localhost:8080/elsewhere/`. Static HTML, CSS and JavaScript — no build or dependency installation.

If GitHub Pages is successfully enabled for the repository, visit `https://ddogy1212.github.io/maea/elsewhere/`. The existing root Pages workflow already publishes the entire repository; this directory does **not** need another workflow.

## Notes

Photo source: fixed images served by [Unsplash](https://unsplash.com/) under its [License](https://unsplash.com/license), for mood and illustration only. Location labels are creative scene titles; a photo is not evidence of the exact named place.

Generated poster/photo exports depend on the browser permitting canvas CORS access to remote images. If a remote image does not export, upload a photo you own via the studio instead. Text-only/blank-image fallbacks remain available for failed sources.

All postcard records are **local to the current browser/device**, not synced to other devices. Browser storage can be erased by the user, privacy settings, or device cleanups. Download the rendered PNG to keep a durable copy. The export file does not contain hidden geo-coordinates or EXIF copied from uploaded source photos.

Design principles: art-directed photography rather than CSS primitive illustrations; responsive layouts; transparent privacy; no false user stats or placeholder saved records.

## Sources

- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [Unsplash License](https://unsplash.com/license)

Built with care as a completely different companion to MAEA.
