from PIL import Image
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / 'photo.jpg'
output_dir = root / 'public'

if not source.exists():
    raise FileNotFoundError(f'Missing source image: {source}')

img = Image.open(source).convert('RGBA')
short_side = min(img.size)
left = (img.size[0] - short_side) // 2
top = (img.size[1] - short_side) // 2
cropped = img.crop((left, top, left + short_side, top + short_side))

for size, filename in [
    (512, 'photo.png'),
    (180, 'apple-touch-icon.png'),
    (192, 'icon-192.png'),
    (512, 'icon-512.png'),
]:
    resized = cropped.resize((size, size), Image.LANCZOS)
    resized.save(output_dir / filename)

print('icons-ready')
