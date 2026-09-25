"""Render the simple beat-dot icon for Windows and Android. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
scale = 4
image = Image.new('RGBA', (512 * scale, 512 * scale))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, 512 * scale - 1, 512 * scale - 1), 112 * scale, fill='#0d1718')
for radius, color, width in [(168, '#173c3c', 4), (136, '#143332', 0), (112, '#1b5551', 0), (88, '#39c5bb', 0)]:
    box = tuple(value * scale for value in (256-radius, 256-radius, 256+radius, 256+radius))
    if width: draw.ellipse(box, outline=color, width=width * scale)
    else: draw.ellipse(box, fill=color)
image = image.resize((512, 512), Image.Resampling.LANCZOS)
image.save(root / 'src/assets/icon.png')
image.save(root / 'src/assets/icon.ico', sizes=[(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)])
for density, size in [('mdpi',48), ('hdpi',72), ('xhdpi',96), ('xxhdpi',144), ('xxxhdpi',192)]:
    folder = root / 'android/app/src/main/res' / f'mipmap-{density}'
    folder.mkdir(parents=True, exist_ok=True)
    image.resize((size,size), Image.Resampling.LANCZOS).save(folder / 'ic_launcher.png')
print('Generated Windows and Android beat-dot icons.')
