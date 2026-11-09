# Measured pigment data

Chroma supports imported two-constant Kubelka–Munk data. No laboratory-measured
pigment library is bundled. Spectral.js paint simulation reconstructs spectra from
RGB and must not be described as measured data.

Machine-readable schema: [pigment-data.schema.json](/pigment-data.schema.json).
Pigment IDs must also be unique; runtime validation enforces this.

## JSON schema

- `version`: 1
- `basis`: "volume"
- `calibration`: description of measurement, coefficient units, binder, preparation,
  instrument/geometry, calibration method and conditions shared by all pigments.
- `pigments`: 1–8 objects, each containing:
  - `id`: unique string
  - `name`: display name
  - `material`: manufacturer, pigment/formulation, binder and sample identity
  - `source`: dataset URL/DOI or laboratory record
  - `license`: redistribution/use terms
  - `wavelengths`: 38 numbers: 380, 390, ..., 750 (nm)
  - `K`: 38 finite non-negative absorption coefficients
  - `S`: 38 finite positive scattering coefficients

K and S must use common compatible units and a common concentration calibration.
Reflectance alone generally does not determine K and S separately. Do not invent
coefficients from a HEX value, or mix unrelated datasets and call them calibrated.
Imported provenance is recorded, not independently verified by Chroma.

## Model and interpretation

Parts are relative pigment volume fractions. For every wavelength:
Kmix = sum(fraction * K); Smix = sum(fraction * S).
R = 1 / (1 + Kmix/Smix + sqrt((Kmix/Smix)^2 + 2*Kmix/Smix)).
Assumes an optically thick, diffusely scattering layer; excludes substrate,
finite thickness, gloss and fluorescence. Spectral.js integrates the reflectance
using D65 / CIE 1931 2° and converts to sRGB. Out-of-gamut channels are clipped;
screen HEX is an approximation. Validate held-out physical mixtures using measured
spectra and a declared Delta E metric before claiming formulation accuracy.

## Available sources (not bundled)

- Spectral.js 3.0.0, MIT: https://github.com/rvanwijnen/spectral.js
  Vendored from bb2b05c9d1e65ae824d47e3b1cc17ea32c8ee68f, UMD wrapper
  adapted to native ES modules; original copyright/license retained.
- Mixbox: https://github.com/scrtwpns/mixbox — noncommercial license;
  commercial license required for commercial use. Not included.
- University of Bath: https://doi.org/10.15125/BATH-00183 — CC BY 4.0
  reflectance measurements of specific historical pigments/mixtures. Not a
  ready-made compatible K/S calibration covering arbitrary modern paints.
- TU Delft Painting Tools: https://github.com/rubenwiersma/painting_tools —
  measured historical oilpaint dataset; data CC BY-NC-SA, code MIT.
  Do not assume the code license also licenses the dataset commercially.
