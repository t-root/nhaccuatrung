// Gom các asset web (source dùng chung) vào thư mục www/ để Capacitor đóng gói.
// Không đụng tới source gốc ở root; chỉ sao chép. Thêm asset mới thì bổ sung vào WEB_ASSETS.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

// Danh sách file/thư mục web cần đưa vào APK (theo cấu trúc thực tế của repo).
const WEB_ASSETS = [
  'index.html',
  'app.js',
  'styles.css',
  'logo.png',
  'manifest.webmanifest',
  'theme.json',
  'key.txt',
  'fonts',
];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

let copied = 0;
for (const name of WEB_ASSETS) {
  const from = join(root, name);
  if (!existsSync(from)) {
    console.warn(`[build-web] bỏ qua (không tìm thấy): ${name}`);
    continue;
  }
  cpSync(from, join(www, name), { recursive: true });
  copied++;
  console.log(`[build-web] + ${name}`);
}

console.log(`[build-web] Đã gom ${copied} asset vào ${www}`);
