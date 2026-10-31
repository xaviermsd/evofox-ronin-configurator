# EvoFox Ronin — Brand Assets

Flat geometric fox in **ink on lime**, matching the CapMitra Edit "Electric Lime"
design system (see `src/theme.css`). Light theme only.

| Colour | Hex | Use |
|---|---|---|
| Lime | `#d6ff36` | Icon tile, primary fills. Never as text on light backgrounds. |
| Ink | `#080808` | The fox, wordmark, text on lime. |
| Background | `#f7f8f4` | Warm white page / banner background. |
| Muted | `#58616f` | Taglines and secondary text. |

Type: **Plus Jakarta Sans 800** for the wordmark (uppercase, −0.01em), **Inter 500/600**
for the tagline. Wordmark text in the SVGs is converted to outlines, so no fonts are needed.

## Files

| File | Size | Where it's used |
|---|---|---|
| `brand/app-icon.svg` | vector | Sidebar avatar, loading screen. Lime tile + ink fox. |
| `brand/fox-mark.svg` / `.png` | vector / 512 | Ink fox, transparent cut-outs. Use on light backgrounds. |
| `brand/fox-mark-lime.svg` | vector | Lime fox for the dark keyboard stage **only**. |
| `brand/logo-horizontal.svg` / `.png` | vector / 1465×320 | Tile + wordmark + tagline, for headers, docs, README. |
| `brand/logo-stacked.svg`, `../logo.png` | vector / 1024² | Square lockup on warm white. |
| `../favicon.svg` | vector | Modern browsers. Simplified fox (no ear cut-outs) so it reads at 16px. |
| `../favicon.ico` | 16/32/48 | Legacy browsers. |
| `../favicon-16.png`, `../favicon-32.png` | 16, 32 | PNG fallbacks. |
| `../favicon.png` | 512 | Kept so old links keep working (same as `icon-512.png`). |
| `../apple-touch-icon.png` | 180 | iOS home screen (opaque, square; iOS rounds the corners). |
| `../icon-192.png`, `../icon-512.png` | 192, 512 | PWA manifest, `purpose: any`. |
| `../icon-maskable-512.png` | 512 | PWA manifest, `purpose: maskable`; fox sits inside the 80% safe zone. |
| `../og-banner.jpg` | 1200×675, ~98 KB | Open Graph / Twitter / WhatsApp preview (under the 300 KB WhatsApp limit). |

## Rules

- Keep clear space around the tile of at least ¼ of its width.
- Don't recolour the fox, add gradients or glows, or put the ink fox on dark backgrounds
  (use `fox-mark-lime.svg` on the keyboard stage instead).
- Minimum size: 16px for `favicon.svg`; 24px for `app-icon.svg` (it has ear cut-outs).
- Previous neon-fox artwork is kept in `assets/legacy/` for reference.
