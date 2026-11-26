// Sinh các trang riêng từ index.html gốc:
//  - Trang PWA con:   dii/index.html, bao/index.html (cài riêng, tên + logo riêng)
//  - index.html cho từng nhãn APK: android/app/src/<flavor>/assets/public/index.html (+ logo.png)
// Chạy lại mỗi khi sửa index.html:  node scripts/build-pages.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'index.html'), 'utf8');

// profile = khóa trong PROFILES của app.js; dir = thư mục trang con; flavor = nhãn APK
export const SITES = [
  { dir: 'dii', flavor: 'dii', profile: 'thuyduy', name: 'Nhạc Của Dii', nameHtml: 'Nhạc Của Dii', ask: 'Bạn là Dii?', short: 'Dii', themeColor: '#111827' },
  { dir: 'bao', flavor: 'bao', profile: 'bao', name: 'Nhạc Của Bảo', nameHtml: 'Nhạc Của Bảo', ask: 'Bạn là Bảo?', short: 'Bảo', themeColor: '#111827' },
  { dir: 'huan', flavor: 'huan', profile: 'huan', name: 'Nhạc Của Huấn', nameHtml: 'Nhạc Của Huấn', ask: 'Bạn là Huấn?', short: 'Huấn', themeColor: '#111827' },
];

function transform(site, { sub }) {
  let html = source;
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`Không tìm thấy trong index.html: ${from}`);
    html = html.split(from).join(to);
  };
  swap('/*PROFILE_SUFFIX*/\'\'', `':${site.profile}'`);
  swap('<title>Nhạc Của Trung</title>', `<title>${site.name}</title>`);
  swap('<span>Nhạc Của Trung</span>', `<span>${site.nameHtml}</span>`);
  swap('Bạn là Trung?', site.ask);
  swap('<meta name="theme-color" content="#111827">', `<meta name="theme-color" content="${site.themeColor}">`);
  if (sub) {
    swap('<link rel="manifest" href="manifest.webmanifest">', `<link rel="manifest" href="manifest.webmanifest">\n  <meta name="apple-mobile-web-app-title" content="${site.short}">\n  <link rel="apple-touch-icon" href="logo.png">`);
    swap('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="../styles.css">');
    swap('<script src="app.js?', `<script>window.FORCE_PROFILE = '${site.profile}'; window.APP_BASE = '../';</script>\n  <script src="../app.js?`);
  } else {
    swap('<script src="app.js?', `<script>window.FORCE_PROFILE = '${site.profile}';</script>\n  <script src="app.js?`);
  }
  return html;
}

for (const site of SITES) {
  const dir = join(root, site.dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), transform(site, { sub: true }));
  console.log(`Đã tạo ${site.dir}/index.html`);
  const assets = join(root, 'android', 'app', 'src', site.flavor, 'assets', 'public');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'index.html'), transform(site, { sub: false }));
  if (existsSync(join(dir, 'logo.png'))) copyFileSync(join(dir, 'logo.png'), join(assets, 'logo.png'));
  console.log(`Đã tạo android/app/src/${site.flavor}/assets/public/index.html`);
}
