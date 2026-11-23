# MAEA — a place for the present

> A cinematic, calm, photo-led focus space. No login, build step, or paid service required.

![MAEA](https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80)

## Experience

- **Six photographic environments:** forest, mountains, ocean, sunset, night and meadows. Full-screen photography, gradual transitions, keyboard scene switching.
- **Resilient focus timer:** 25/45/60 minute presets, a break mode, custom durations (1–180 minutes), pause/resume, visual progress and fullscreen-style quiet view. End timestamps are stored so inactive-tab throttling won't make the timer drift.
- **Ambient sound:** rain, ocean and wind are synthesized locally using the Web Audio API; no audio streams or media accounts.
- **Tasks + intentional sessions:** add/finish/delete tasks, link one goal to the timer, and keep a seven-day log with optional reflection and mood.
- **Private by default:** data stays in browser localStorage. Export JSON or delete it from Settings.
- **PWA-ready:** static HTML/CSS/JS, web manifest, responsive mobile navigation, service worker for offline app shell and visited photo assets. The photos and web fonts need internet at least once. Browser notification is optional and not a substitute for a native background alarm.

## Run

Open `index.html` to explore the basic UI. For full PWA/service-worker support, serve it over HTTPS (such as GitHub Pages) or local HTTP:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

| Key | Action |
| --- | --- |
| `Space` | Start / pause timer outside input fields |
| `1`–`6` | Switch landscape |
| `?` | Show keyboard shortcuts |
| `Esc` | Close panel, modal, or focus view |

## Deploy

A Pages workflow is provided at `.github/workflows/pages.yml`. If the first run cannot enable Pages automatically, open **Repository Settings → Pages → Build and deployment → Source: GitHub Actions**, then rerun the workflow. Published URL usually follows `https://ddogy1212.github.io/maea/`, but check the actual deployment result before sharing it.

## Design and source notes

- Landscape images served from [Unsplash](https://unsplash.com/) using fixed image IDs, under the [Unsplash License](https://unsplash.com/license). Photo credits appreciated; scenes are atmospheric themes, **not assertions about exact geographic locations**.
- Background timer behavior follows [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) guidance: use absolute timestamps instead of counting interval ticks.
- Audio is created after user input following [MDN Web Audio autoplay best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
- All displayed focus statistics are derived exclusively from completed local sessions. The browser cannot guarantee background notifications if the device suspends the page.
- Zero trackers, zero cookies, zero analytics, no backend.

Designed as an immersive tool, not a collage of geometric illustrations. Crafted for mobile and desktop.

## Companion experience: ELSEWHERE — The Postcard Atelier

**[ELSEWHERE](./elsewhere/)** brings back the original photo-and-postcard concept with a **much simpler workflow**: select a photo and immediately receive a finished, photo-led postcard; optionally choose its mood or design, then share the image or download the PNG. There is also an optional private browser archive for saving and reopening postcards. It is now designed for real mobile use, not a multi-step editor.

The original **MAEA focus environment** remains at the repository root. Older versions of ELSEWHERE and PRESS remain in Git history. If GitHub Pages is enabled and deployed successfully, the companion URL is `https://ddogy1212.github.io/maea/elsewhere/`.
