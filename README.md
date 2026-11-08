# Chroma Color Mix Studio

A dependency-free, single-page color mixing studio built with HTML, CSS, and JavaScript.

## Deploy to Vercel

1. Import `MbazaWeb/Chroma-Color-Mix-Studio` in Vercel.
2. Select **Other** as the framework preset and leave the build command empty.
3. Keep the output directory set to `public` (it is configured in `vercel.json`) and deploy from the `main` branch.

The `public/` folder contains the deployable SPA. Its HTML is at the root, while CSS, JavaScript, and icons are organized under `public/assets/`. The `vercel.json` rewrite serves the SPA for app routes.

The site includes a web app manifest and service worker for installability and offline loading. On the first visit, it offers installation where supported. The browser requires a user action before showing its native install prompt; on iPhone and iPad, follow the Share → Add to Home Screen instructions.
