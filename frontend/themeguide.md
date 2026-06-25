# SovAds Neubrutalist Theme Guide

Use this guide to ensure all UI elements follow the **Neubrutalist** style.

## 1. Core Colors
- **Background**: `#F5F3F0` (Cream)
- **Foreground**: `#2D2D2D` (Charcoal — primary text + accent; avoid pure `#000`/`#141414`)
- **Cards/Inputs**: `#FFFFFF` (Solid White)
- **Highlights**: `#F5F3F0` (used for secondary tiles or hover states)
- **Hairline borders**: `#E5E5E5` (default); thick `#2D2D2D` borders only for primary CTA, active state, modals

## 2. Typography
- **Heading Font**: `var(--font-heading)` (Bebas Neue / Anton style)
- **Body Font**: `var(--font-body)` (Monospace style)
- **Colors**: All text should be charcoal (`#2D2D2D` or `var(--foreground)`) to maintain contrast against cream/white backgrounds without the harshness of pure black. White text only on dark filled buttons / dark hero backgrounds.
- **Headers**: Always uppercase, thick weights, tracking-tighter.
- **Labels**: Uppercase, bold, small (text-xs), high contrast.

## 3. Neubrutalist Utilities
### Cards
- Use `.card` or `.glass-card` (overridden to be brutalist).
- **Border**: `2px solid #2D2D2D`.
- **Shadow**: `shadow-[4px_4px_0px_0px_rgba(45,45,45,0.92)]`.
- **Hover**: `hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(45,45,45,0.92)]`.

### Buttons
- Use `.btn .btn-primary` or `.btn .btn-outline`.
- Charcoal `#2D2D2D` borders and softened hard shadows.
- Active state should "press down" (translate-y-px).

### Forms
- Inputs must have `#FFFFFF` background, charcoal borders, and hard shadows.
- Sharp corners (rounded-none).

## 4. Layout
- Use `max-w-5xl` for dashboard content to avoid excessive whitespace.
- Maintain a "raw" and "bold" aesthetic, but tone down density — use hairline `#E5E5E5` borders by default and reserve thick charcoal lines for accent.
- Media (images/video) should use `aspect-video` and `object-contain` within a charcoal-bordered container.

## 5. CSS Variables (globals.css)
- `--background`: `#F5F3F0`
- `--foreground`: `#2D2D2D`
- `--border-width`: `2px`
- `--hard-shadow`: `4px 4px 0px 0px rgba(45, 45, 45, 0.92)`
