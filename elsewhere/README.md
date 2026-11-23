# ELSEWHERE — The Everyday Postcard Atelier

**One photo, one feeling.** The original idea is back, but the difficult editing process is gone.

ELSEWHERE is an independent creative app in `maea/elsewhere/`. The original MAEA focus app at the repository root is unchanged. The earlier PRESS utility and original complicated postcard design remain accessible through Git history.

## The experience

**Three simple steps:** choose a photo → the app generates a beautiful postcard immediately → save the PNG or share it directly.

1. Open `/elsewhere/`. You'll see an actual photo-based demo postcard.
2. Tap **내 사진으로 바로 만들기**, choose a JPG, PNG or WEBP image. Your postcard auto-renders; portrait photos use a portrait canvas and landscape photos use a landscape canvas.
3. Tap **바로 공유하기** or **이미지 저장**. The share action uses the device's native Web Share API for image files when available, including supported messenger apps. If the browser cannot share files, it saves a PNG instead, which you can attach to KakaoTalk yourself.
4. Optional: choose a mood (**추억, 여행, 축하, 응원**), tap **디자인 바꾸기**, or open **문구 직접 다듬기**. These advanced actions aren't required to export.
5. Optional: tap **내 엽서함에 담기** to store this postcard locally. Later tap **내 엽서함 → 다시 열기** to continue editing, or delete a saved item.

### What makes it useful

- Share a custom greeting, photo keepsake, memory, anniversary message or trip photo as a single image.
- One photo becomes a 1600×1200 (landscape) or 1200×1600 (portrait) PNG with real typography and photographic layout.
- Three professionally art-directed layouts: **Editorial**, **Cinema**, and **Afterglow**.
- Prewritten mood-specific messages and a one-tap suggestion switch, plus manual overrides.
- An optional 40-card private archive backed by IndexedDB, without sign-up.
- Share from supported mobile browsers with native file sharing.
- Full-featured mobile layout: prominent upload, immediate preview, sticky save/share controls above Android safe areas, and optional details below.

### Privacy and limitations

- Your photos are processed in the browser with Canvas. No photo server or account is used. The chosen photos, generated PNGs and local saved entries stay on your device unless **you choose to share** them.
- The app's sample scenery comes from Unsplash and therefore requires the internet on first load. The sample photos may depend on cross-origin image permissions for PNG export; if an external sample cannot be loaded, use your own photo.
- The photo archive is local to that device/browser and can disappear when the browser's stored data is cleared. Always download important finished postcards.
- JPEG, PNG and WEBP input only, up to 20 MB per file and up to 65 megapixels. Animated GIF is not supported.
- Large images can use significant phone memory; support varies by browser.
- Exports include visible text and artwork, not the original photo EXIF metadata.
- Share targets (including KakaoTalk) depend on what apps and capabilities the phone/browser exposes; **no guaranteed KakaoTalk integration** is claimed.
- If the phone has no Web Share support, the app downloads PNG so you can manually send it.

## Run locally

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/elsewhere/`. To access the deployed app, GitHub Pages must be enabled. Its intended URL is `https://ddogy1212.github.io/maea/elsewhere/`.

Vanilla HTML/CSS/JS, Canvas 2D, IndexedDB, Web Share, Service Worker. No build system.

Visual imagery licensed via [Unsplash](https://unsplash.com/license). Reference APIs: [MDN Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API), [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
