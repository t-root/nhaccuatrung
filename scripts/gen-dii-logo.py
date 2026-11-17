# Sinh logo PWA cho "Nhạc Của Dii" -> dii/logo.png (1024x1024, an toàn cho maskable).
# Chạy: python scripts/gen-dii-logo.py   (cần Pillow)
import math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 4096                      # vẽ ở độ phân giải cao rồi thu nhỏ cho mượt
K = S / 1024
def P(x, y): return (x * K, y * K)

# Nền: gradient chéo hồng đào -> hồng đậm
bg = Image.new('RGB', (S, S))
px = bg.load()
c1, c2 = (255, 166, 190), (205, 52, 110)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
img = bg.convert('RGBA')

# Vài vòng tròn mờ trang trí
deco = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(deco)
for cx, cy, r, a in [(180, 190, 260, 40), (900, 880, 330, 38), (880, 130, 150, 30), (120, 820, 120, 30)]:
    d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill=(255, 255, 255, a))
img = Image.alpha_composite(img, deco)

def ellipse_poly(cx, cy, rx, ry, rot_deg, n=120):
    a = math.radians(rot_deg)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append(P(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
    return pts

def heart_poly(cx, cy, size, n=160):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append(P(cx + x * size / 16, cy + y * size / 16))
    return pts

def note(draw, dx, dy, fill):
    h1 = (400 + dx, 665 + dy); h2 = (650 + dx, 615 + dy)
    draw.polygon(ellipse_poly(*h1, 98, 72, -20), fill=fill)
    draw.polygon(ellipse_poly(*h2, 98, 72, -20), fill=fill)
    w = 30
    draw.rectangle([P(h1[0] + 80, 345 + dy), P(h1[0] + 80 + w, h1[1])], fill=fill)
    draw.rectangle([P(h2[0] + 80, 295 + dy), P(h2[0] + 80 + w, h2[1])], fill=fill)
    draw.polygon([P(h1[0] + 80, 345 + dy), P(h2[0] + 80 + w, 295 + dy), P(h2[0] + 80 + w, 385 + dy), P(h1[0] + 80, 435 + dy)], fill=fill)

NOTE_DY = -160   # đẩy nốt nhạc lên để chừa chỗ cho tên ở dưới

def load_font(size):
    here = os.path.dirname(os.path.abspath(__file__))
    for path in ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                 os.path.join(here, '..', 'fonts', 'Square-VN.ttf')):   # font cuối cùng có sẵn trong repo (hỗ trợ tiếng Việt)
        if os.path.exists(path):
            return ImageFont.truetype(path, int(size * K))
    raise SystemExit('Không tìm thấy font hỗ trợ tiếng Việt')

def text_block(draw, dx, dy, fill):
    for text, size, cy in (('NHẠC CỦA', 80, 705), ('Dii', 200, 850)):
        font = load_font(size)
        w = draw.textlength(text, font=font)
        draw.text(((512 + dx) * K - w / 2, (cy + dy) * K), text, font=font, fill=fill, anchor='lm')

# Bóng đổ nhẹ cho nốt nhạc
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
note(ImageDraw.Draw(shadow), 0, NOTE_DY + 18, (120, 10, 50, 110))
text_block(ImageDraw.Draw(shadow), 0, 8, (120, 10, 50, 120))
shadow = shadow.filter(ImageFilter.GaussianBlur(40))
img = Image.alpha_composite(img, shadow)

fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
dfg = ImageDraw.Draw(fg)
note(dfg, 0, NOTE_DY, (255, 255, 255, 255))
dfg.polygon(heart_poly(305, 330 + NOTE_DY, 110), fill=(255, 236, 242, 255))   # trái tim nhỏ bên nốt nhạc
text_block(dfg, 0, 0, (255, 255, 255, 255))
img = Image.alpha_composite(img, fg)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dii', 'logo.png')
os.makedirs(os.path.dirname(out), exist_ok=True)
img.convert('RGB').resize((1024, 1024), Image.LANCZOS).save(out, optimize=True)
print('Đã tạo', os.path.normpath(out))
