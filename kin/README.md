# KIN — Near-field Identity Studio

A **real, usable NFC + digital business-card maker**, available as a third independent companion app in `maea/kin/`. Existing MAEA, ELSEWHERE and AHEAD code is not replaced.

## What KIN does

### 01 — Digital identity card

Enter a **name** and optional role, organization, public phone, public email, website, and one-line introduction. The premium live card preview updates as you type. Choose from three atmospheric photographic styles: **Archive, Tide, Dusk**.

- **Share a link**: a public card is encoded inside the URL **fragment** (`#c=...`). It uses no server or account; the recipient opens a beautiful read-only card page and can tap the available contact methods.
- **QR code**: generate a scannable QR locally using QRCode.js (the JavaScript library loads from cdnjs on first use). No contact details go to a QR-generation server.
- **Save contact**: export a local UTF-8 vCard (`.vcf`) file. The recipient's public-view page can download the same contact file.
- **Draft autosave**: the current card form stays in this browser's localStorage so it can be edited again on the same device.
- **One NFC-ready compact link**: when the full share URL is too large for a small sticker, select **compact** or **automatic** and KIN builds a shorter card link with the name and one primary contact method. Shareable full QR and compact physical-tag data can differ.

### 02 — NFC utility

Choose what to store:

- The current digital card's URL (full or compact)
- Any valid HTTP or HTTPS link
- A short plain-text NDEF record

KIN estimates NDEF size against **user-selected tag memory budgets** (144/504/888 bytes), with a safety margin; it does **not** claim the capacity is confirmed for your tag. Click **태그에 기록하기**, accept overwrite confirmation, grant NFC permission, and touch a writable NDEF-formatted tag. The actual device checks whether it can write the record.

The **NFC scan** feature can read supported tag records and show the data safely. Read links are *not auto-opened*, to avoid accidentally visiting malicious pages.

### Compatibility and safety

- **Real Web NFC read and write requires a supported device, NFC hardware switched on, a compatible Android browser (Chrome), permission, a secure HTTPS context and a writable tag**. Safari/iOS, most desktop browsers and many in-app browsers don't expose Web NFC. Browser support can change.
- Use Chrome's browser directly if an embedded browser lacks NFC. There is no iOS NFC-writing workaround from the website.
- **Data stored in an NFC tag can be read by other people with compatible devices.** Shared cards and QR links also reveal the phone/email/site you choose to include. Share only public-facing contact information. This is not a private encrypted contact manager.
- Small NFC stickers can have significantly different actual capacities and may have been formatted, locked or written before. KIN's size display is an **estimate**; successful hardware writing must be confirmed with a real tag.
- The URL-fragment card is shareable without a database or shortened-link service. Anyone with that link can read its encoded fields. Changing your local draft will **not** update previously written links or stickers — write a new link to change a shared card.
- Contact fields stay on-device as localStorage draft data unless you choose to share/copy/write/scan. Other than public fonts/photos/static QRCode.js assets, KIN doesn't send contacts to a backend.
- Valid WEB links are restricted to HTTP(S); no automatic opening of scanned NFC URLs.
- Export only data you're authorized to share, and inspect the NFC tag before overwriting any existing important content.

### Run and deploy

Serve the repository with `python3 -m http.server 8080`; then open `http://localhost:8080/kin/`. **For hardware NFC access, HTTPS and a supported Android browser are normally required**, so a local HTTP preview does not provide full NFC writing.

If GitHub Pages is successfully configured and deployed, KIN should be reachable at:
`https://ddogy1212.github.io/maea/kin/`

The app is static, with no build process and no API keys. Its QR generator is third-party open-source QRCode.js loaded from the pinned [cdnjs 1.0.0 URL](https://cdnjs.com/libraries/qrcodejs/1.0.0).

References:
- [Chrome: Interact with NFC devices on Chrome for Android](https://developer.chrome.com/docs/capabilities/nfc)
- [MDN: NDEFReader.write()](https://developer.mozilla.org/en-US/docs/Web/API/NDEFReader/write)
- [MDN: NDEFReader.scan()](https://developer.mozilla.org/en-US/docs/Web/API/NDEFReader/scan)
- [QRCode.js](https://github.com/davidshimjs/qrcodejs)
- [Unsplash License](https://unsplash.com/license)

### Technology

Semantic HTML, responsive CSS, native JavaScript, localStorage, URL-fragment UTF-8/Base64url encoding, NDEFReader, QRCode.js, and download-on-demand vCard files. An app-scoped service worker caches the shell; static contact data is not fetched from a server.
