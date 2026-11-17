# Sinh icon launcher Android cho các nhãn APK (dii, bao) từ <thư mục>/logo.png.
# Chạy: python scripts/gen-android-icons.py   (cần Pillow, numpy)
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FLAVORS = {'dii': ('dii', 'Nhạc Của Dii'), 'bao': ('bao', 'Nhạc Của Bảo')}
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
ADAPTIVE_XML = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'''
STRINGS_XML = '''<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">{name}</string>
    <string name="title_activity_main">{name}</string>
</resources>
'''

def adaptive_foreground(logo, px):
    """Canvas 108dp: logo chiếm 75% ở giữa, phần viền được nối tiếp bằng phản chiếu để liền màu với nền."""
    inner = int(px * 0.75)
    arr = np.asarray(logo.resize((inner, inner), Image.LANCZOS).convert('RGB'))
    pad = (px - inner) // 2
    padded = np.pad(arr, ((pad, px - inner - pad), (pad, px - inner - pad), (0, 0)), mode='reflect')
    return Image.fromarray(padded)

def legacy_icon(logo, px, round_):
    img = logo.resize((px, px), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (px * 4, px * 4), 0)
    d = ImageDraw.Draw(mask)
    if round_:
        d.ellipse([0, 0, px * 4 - 1, px * 4 - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, px * 4 - 1, px * 4 - 1], radius=px * 4 // 5, fill=255)
    img.putalpha(mask.resize((px, px), Image.LANCZOS))
    return img

for flavor, (folder, app_name) in FLAVORS.items():
    logo = Image.open(os.path.join(ROOT, folder, 'logo.png')).convert('RGB')
    res = os.path.join(ROOT, 'android', 'app', 'src', flavor, 'res')
    for density, scale in DENSITIES.items():
        d = os.path.join(res, f'mipmap-{density}')
        os.makedirs(d, exist_ok=True)
        adaptive_foreground(logo, int(108 * scale)).save(os.path.join(d, 'ic_launcher_foreground.png'), optimize=True)
        legacy_icon(logo, int(48 * scale), False).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
        legacy_icon(logo, int(48 * scale), True).save(os.path.join(d, 'ic_launcher_round.png'), optimize=True)
    # Màu nền adaptive icon = màu trung bình của đường viền logo
    edge = np.concatenate([np.asarray(logo)[0], np.asarray(logo)[-1], np.asarray(logo)[:, 0], np.asarray(logo)[:, -1]]).mean(axis=0)
    color = '#%02X%02X%02X' % tuple(int(v) for v in edge)
    v26 = os.path.join(res, 'mipmap-anydpi-v26'); os.makedirs(v26, exist_ok=True)
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        open(os.path.join(v26, name), 'w', encoding='utf-8', newline='\n').write(ADAPTIVE_XML)
    values = os.path.join(res, 'values'); os.makedirs(values, exist_ok=True)
    open(os.path.join(values, 'ic_launcher_background.xml'), 'w', encoding='utf-8', newline='\n').write(
        f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{color}</color>\n</resources>\n')
    open(os.path.join(values, 'strings.xml'), 'w', encoding='utf-8', newline='\n').write(STRINGS_XML.format(name=app_name))
    print('Đã tạo icon cho', flavor, color)
