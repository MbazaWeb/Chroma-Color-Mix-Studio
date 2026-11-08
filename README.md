# Chroma Color Mix Studio

A dependency-free, single-page color mixing studio built with HTML, CSS, and JavaScript.

## Deploy to Vercel

1. Import `MbazaWeb/Chroma-Color-Mix-Studio` in Vercel.
2. Select **Other** as the framework preset and leave the build command empty.
3. Deploy from the `main` branch.

The `vercel.json` configuration serves `index.html` for app routes, and the static HTML, CSS, and JavaScript files are served directly.

The site includes a web app manifest and service worker for installability and offline loading. On the first visit, it offers installation where supported. The browser requires a user action before showing its native install prompt; on iPhone and iPad, follow the Share → Add to Home Screen instructions.
