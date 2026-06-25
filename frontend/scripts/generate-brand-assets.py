from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / 'public'
APP_DIR = BASE_DIR / 'src' / 'app'
SOURCE = PUBLIC_DIR / 'logo_new.png'

if not SOURCE.exists():
    raise FileNotFoundError(f'Missing source logo: {SOURCE}')

img = Image.open(SOURCE).convert('RGBA')

# Generate a square PNG icon for app metadata.
icon_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save(PUBLIC_DIR / 'icon.png', format='PNG', optimize=True)

# Generate Apple touch icon.
apple = img.resize((180, 180), Image.Resampling.LANCZOS)
apple.save(PUBLIC_DIR / 'apple-touch-icon.png', format='PNG', optimize=True)

# Generate a favicon.ico using common sizes.
icons = [
    img.resize((16, 16), Image.Resampling.LANCZOS),
    img.resize((32, 32), Image.Resampling.LANCZOS),
    img.resize((48, 48), Image.Resampling.LANCZOS),
    img.resize((64, 64), Image.Resampling.LANCZOS),
]

# Pillow can write ICO directly with multiple sizes.
icons[0].save(
    PUBLIC_DIR / 'favicon.ico',
    format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    append_images=icons[1:],
)

icons[0].save(
    APP_DIR / 'favicon.ico',
    format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    append_images=icons[1:],
)

print('Generated:')
print('  -', PUBLIC_DIR / 'icon.png')
print('  -', PUBLIC_DIR / 'apple-touch-icon.png')
print('  -', PUBLIC_DIR / 'favicon.ico')
print('  -', APP_DIR / 'favicon.ico')
