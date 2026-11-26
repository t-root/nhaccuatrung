// Build APK từ source web dùng chung và đưa kết quả vào thư mục dist/.
// Dùng: node scripts/build-apk.mjs [debug|release] [trung|dii|bao|huan|all]   (mặc định: debug, all)
// Mỗi nhãn (flavor) là một APK riêng: trung = Nhạc Của Trung, dii = Nhạc Của Dii, bao = Nhạc Của Bảo.
//
// Script tự dò JDK (ưu tiên JBR của Android Studio) và Android SDK nếu chưa có
// biến môi trường. Các bước: gom web -> cap sync -> gradle assemble -> copy vào dist.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const variant = (process.argv[2] || 'debug').toLowerCase();
const FLAVORS = { trung: 'nhaccuatrung', dii: 'nhaccuadii', bao: 'nhaccuabao', huan: 'nhaccuahuan' };
const flavorArg = (process.argv[3] || 'all').toLowerCase();
if (flavorArg !== 'all' && !FLAVORS[flavorArg]) {
  console.error(`Nhãn không hợp lệ: ${flavorArg} (trung | dii | bao | huan | all)`);
  process.exit(1);
}
const flavors = flavorArg === 'all' ? Object.keys(FLAVORS) : [flavorArg];
if (!['debug', 'release'].includes(variant)) {
  console.error(`Variant không hợp lệ: ${variant} (chỉ nhận debug hoặc release)`);
  process.exit(1);
}

// --- Dò JDK ---
function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = [
    'C:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Java',
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'bin', isWin ? 'java.exe' : 'java'))) return c;
  }
  return null;
}

// --- Dò Android SDK ---
function findAndroidHome() {
  for (const v of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (v && existsSync(v)) return v;
  }
  const home = process.env.USERPROFILE || process.env.HOME;
  const candidates = [
    home && join(home, 'AppData', 'Local', 'Android', 'Sdk'),
    home && join(home, 'Library', 'Android', 'sdk'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const JAVA_HOME = findJavaHome();
const ANDROID_HOME = findAndroidHome();
if (!JAVA_HOME) { console.error('Không tìm thấy JDK. Hãy đặt biến JAVA_HOME.'); process.exit(1); }
if (!ANDROID_HOME) { console.error('Không tìm thấy Android SDK. Hãy đặt biến ANDROID_HOME.'); process.exit(1); }
console.log(`JAVA_HOME = ${JAVA_HOME}`);
console.log(`ANDROID_HOME = ${ANDROID_HOME}`);

const env = { ...process.env, JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME };

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) { console.error(`Lệnh thất bại (exit ${r.status}).`); process.exit(r.status || 1); }
}

// 1) Sinh index.html riêng của từng nhãn, gom web + đồng bộ sang native
run('node', ['scripts/build-pages.mjs'], root);
run('node', ['scripts/build-web.mjs'], root);
run(isWin ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], root);

// 2) Gradle assemble từng nhãn, 3) copy APK vào dist/
const androidDir = join(root, 'android');
const gradlew = isWin ? join(androidDir, 'gradlew.bat') : './gradlew';
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const cap = (text) => text[0].toUpperCase() + text.slice(1);
for (const flavor of flavors) {
  run(gradlew, [`:app:assemble${cap(flavor)}${cap(variant)}`, '--no-daemon'], androidDir);
  const outDir = join(root, 'android', 'app', 'build', 'outputs', 'apk', flavor, variant);
  const apks = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('.apk')) : [];
  if (apks.length === 0) { console.error(`Không tìm thấy APK trong ${outDir}`); process.exit(1); }
  const fileName = variant === 'debug' ? `${FLAVORS[flavor]}.apk` : `${FLAVORS[flavor]}-${variant}.apk`;
  const dest = join(dist, fileName);
  copyFileSync(join(outDir, apks[0]), dest);
  console.log(`
✅ Đã tạo APK: ${dest}`);
}
