# PRESS. — Image Workshop

**Practical first, beautiful second.**

PRESS replaces the previous postcard prototype in `maea/elsewhere/` with a functional image tool. The previous implementation is preserved in Git history. The original MAEA focus app in `maea/` is unchanged.

## Use in three seconds

1. Open PRESS and tap **사진 선택하기** (or drag photos onto the drop zone).
2. Wait for automatic conversion. No login, configuration, or start button.
3. Download one image or tap **전체 ZIP 저장**.

**Best for:** sending school photos, compressing screenshots, converting PNG to WEBP, resizing many photos at once, and making image attachments smaller.

## Features

- Batch conversion of up to 30 JPG, PNG, WEBP images, 35 MB per input file.
- Automatic output: JPG stays JPG, WEBP stays WEBP, PNG becomes WEBP for practical space savings.
- Downsize images to 2560px max edge by default (1600px, 1080px, or original dimensions available).
- Adjustable quality, optional JPG/WEBP/PNG choice in **압축 설정**.
- Prevent bigger files in default mode when the source is already smaller and output is the same format/resolution.
- Real original vs converted byte counts, savings indicators, preview comparison, per-image save and remove.
- Locally generated ZIP for batch download; actual binary ZIP headers and CRC-32, no server.
- Clipboard paste for image files (Ctrl/Cmd+V in compatible browsers).
- Offline-capable shell after first load and PWA manifest.
- All image processing is local to the browser. Source images aren't uploaded; canvas output strips the original file's ordinary metadata.
- No saved files or accounts: the active batch is held in browser memory. Save downloads before leaving.

## Run

With Python installed, from the repository root:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/elsewhere/`.

If the GitHub Pages workflow is deployed successfully, the web app is at:
`https://ddogy1212.github.io/maea/elsewhere/`.

## Important limitations

- JPG exports replace transparent backgrounds with white. For transparency, use WEBP or PNG.
- Some browsers may not support WebP encoding and may fall back to PNG. The app detects the real result MIME type.
- PNG export is lossless; the quality percentage does not affect PNG compression.
- Animated formats (including GIF) and video are not supported.
- Very large/high-megapixel images may fail or exhaust memory, especially on older phones; the app limits images to 65MP.
- Browser downloads may be blocked by device permissions or storage limits. ZIP creation requires sufficient available RAM.
- Lossy compression can remove fine detail. Users should inspect results before deleting irreplaceable original files.

## Technical notes

Static HTML, CSS, and plain JavaScript without build dependencies. Canvas exports, object URLs, file uploads, source comparison, ZIP (stored method, UTF-8 names, CRC-32 and central directory), service worker. Photographic editorial hero uses a fixed Unsplash picture ([license](https://unsplash.com/license)); an internet connection is required for that decorative image and optional web fonts, not for local image conversion.

Background inspiration: [MDN canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob), [MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap), [PKWARE ZIP format](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

The public UI is deliberately one-task-at-a-time: upload → process → download.
