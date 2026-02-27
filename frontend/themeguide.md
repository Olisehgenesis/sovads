# SovAds Neubrutalist Theme Guide

Use this guide to ensure all UI elements follow the **Neubrutalist** style.

## 1. Core Colors
- **Background**: `#F5F3F0` (Cream)
- **Foreground**: `#141414` (Deep Black)
- **Cards/Inputs**: `#FFFFFF` (Solid White)
- **Highlights**: `#F5F3F0` (used for secondary tiles or hover states)

## 2. Typography
- **Heading Font**: `var(--font-heading)` (Bebas Neue / Anton style)
- **Body Font**: `var(--font-body)` (Monospace style)
- **Colors**: **Strictly NO WHITE TEXT**. All text should be black (`#141414` or `black`) to maintain high contrast against cream/white backgrounds.
- **Headers**: Always uppercase, thick weights, tracking-tighter.
- **Labels**: Uppercase, bold, small (text-xs), high contrast.

## 3. Neubrutalist Utilities
### Cards
- Use `.card` or `.glass-card` (overridden to be brutalist).
- **Border**: `2px solid black`.
- **Shadow**: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`.
- **Hover**: `hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]`.

### Buttons
- Use `.btn .btn-primary` or `.btn .btn-outline`.
- Must have thick black borders and hard shadows.
- Active state should "press down" (translate-y-px).

### Forms
- Inputs must have `#FFFFFF` background, black borders, and hard shadows.
- Sharp corners (rounded-none).

## 4. Layout
- Use `max-w-5xl` for dashboard content to avoid excessive whitespace.
- Maintain a "raw" and "bold" aesthetic—don't be afraid of heavy black lines.
- Media (images/video) should use `aspect-video` and `object-contain` within a black-bordered container.

## 5. CSS Variables (globals.css)
- `--background`: `#F5F3F0`
- `--border-width`: `2px`
- `--hard-shadow`: `4px 4px 0px 0px rgba(0, 0, 0, 1)`
