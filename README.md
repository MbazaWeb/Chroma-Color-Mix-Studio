# Chroma Color Mix Studio

A dependency-free, single-page color mixing studio built with HTML, CSS, and JavaScript.

## Deploy to Vercel

1. Import `MbazaWeb/Chroma-Color-Mix-Studio` in Vercel.
2. Select **Other** as the framework preset and leave the build command empty.
3. Keep the output directory set to `public` (it is configured in `vercel.json`) and deploy from the `main` branch.

The `public/` folder contains the deployable SPA. Its HTML is at the root, while CSS, JavaScript, and icons are organized under `public/assets/`. The `vercel.json` rewrite serves the SPA for app routes.

The site includes a web app manifest and service worker for installability and offline loading. On the first visit, it offers installation where supported. The browser requires a user action before showing its native install prompt; on iPhone and iPad, follow the Share → Add to Home Screen instructions.

Color selections, mixing, and completed blends have generated sound effects. Use the **Sound on/off** control in the header to mute or enable them.

## Development

- Run the built-in color utility tests with `npm test`.
- Check JavaScript syntax with `npm run check`.
- The app uses native browser JavaScript modules; no dependency installation or build step is needed.
- GitHub Actions runs the tests and syntax checks on pushes to `main` and pull requests.

## Repository layout

- `public/` — deployable SPA and static assets.
- `tests/` — Node.js built-in tests for color and mix utilities.
- `.github/workflows/` — continuous integration.
- Root configuration and deployment documentation stay alongside `vercel.json`.

## Mixing model

Chroma computes a normalized weighted average in **linear-light sRGB**.
Each HEX channel is decoded using the standard sRGB transfer function, averaged
by parts / total parts, then encoded back to sRGB and rounded once to 8-bit HEX.
Reference: https://www.w3.org/TR/css-color-4/#color-conversion-code

Equal black and white produces `#BCBCBC`; equal red and green produces `#BCBC00`.
This models a digital light mixture at fixed total intensity, not stacked lamps
whose total brightness increases. HEX alone does not specify pigment absorption,
scattering, concentration, substrate, or illumination, so physical paint matching
is not claimed. There are no hard-coded pair outcomes or random result colors.
Randomness is confined to the decorative animation. Sounds are artistic mappings.

Live preview, completed result, and export use the same calculation. Exports
include the model and exact fractional shares alongside rounded display shares.
Restored recipes are recalculated, including sessions from the earlier encoded-RGB
model. Saved swatches retain their original HEX values as standalone colors.


## Paint and measured-data modes

The mixing selector now offers digital light, an explicitly estimated paint
simulation (Spectral.js 3.0.0, MIT), and imported measured K/S coefficients.
See [data format, provenance and limitations](public/pigment-data-format.md).
The light model remains the default and existing recipes retain that model.
Measured mode requires a compatible calibration; no fabricated measurements or
restricted datasets are bundled. Changing from measured to another model clears
the measured recipe. Source and license fields travel with exported recipes.
Paint simulation uses Spectral.js artistic influence weighting; it is not a mass
or volume formulation tool. The measured model uses relative volume fractions.
