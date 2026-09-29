# El Solar Timbero design system

## Approved foundation

The palette in `src/app/globals.css` adapts the three images in `reference/`:
parchment background, lighter surfaces, weathered red, navy, warm dark text,
and sand/gold accents. Use semantic Tailwind classes such as `bg-background`,
`text-foreground`, `text-muted`, and `border-border`.

Use `border-border` for input boundaries. `border-subtle` and `accent-gold` are
decorative on parchment, not substitutes for accessible text or control outlines.
Flat-color contrast: foreground/background 12.98:1, muted/background 5.59:1,
surface/primary 7.51:1, surface/navy 12.49:1, border/surface 4.17:1.
Check final textured compositions and interactive states separately.

Barlow Condensed 700/800 (`font-heading`) supplies poster headings. Source Sans 3
400/600 (`font-sans`) supplies body text and forms. `next/font/google` downloads
fonts at build time and serves them locally with `display: swap`; browsers do not
request Google Fonts. Preserve font copyright/license notices when distributing
font files. Script accents remain optional and are not loaded.

- Barlow license: https://github.com/google/fonts/blob/main/ofl/barlowcondensed/OFL.txt
- Source Sans 3 license: https://github.com/google/fonts/blob/main/ofl/sourcesans3/OFL.txt

Use existing Tailwind spacing: 8–16px within groups, 24–32px for padding,
48–96px between sections. Target 20–32px page gutters and a 72rem content width.
Use 2–4px corners, minimal shadows, and controls at least 44px tall.

## Homepage artwork direction (not implemented)

Use `public/artwork/homepage-capitol-street.png` for the scene: Capitol, palm,
leafy trees and paved street. The prior waterfront scenes are rejected for the
homepage. See `docs/artwork-homepage-correction.md` for the corrected prompt.

Use the Capitol, vintage car, dancing couple, and parchment/background scene as
decorative background layers. Keep headings, event details, and RSVP controls in
HTML. The reference files are flattened images, not isolated reusable artwork.
Matching artwork has been generated in `public/artwork/`; see `docs/artwork.md`
for the prompt set and asset details. These are new illustrations, not extracted
original layers.

Compose layers independently so their position and visibility can adapt on mobile.
Reserve clear space behind text; put forms on solid surfaces. Repeat a small grain
tile for paper texture instead of downloading a full-size image for each section.
Use responsive optimized images for substantial scene artwork; CSS backgrounds
are not automatically optimized by Next.js. Decorative image elements can also be
positioned behind content with empty alt text and no pointer events.

The homepage has not been built. Its starter classes still override parts of the
theme and will be replaced as part of the homepage exercise.
