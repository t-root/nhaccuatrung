# Đóng gói APK từ source web (Capacitor)

APK dùng **chung** source web ở root (`index.html`, `app.js`, `styles.css`,
`logo.png`, `manifest.webmanifest`, `theme.json`, `fonts/`). Không có bộ giao
diện Android thứ hai — Android chỉ chạy đúng các file đó trong WebView qua
Capacitor.

## Build nhanh

```bash
npm install          # chỉ cần chạy lần đầu
npm run apk:debug    # tạo dist/nhaccuatrung.apk
```

APK nằm ở `dist/nhaccuatrung-debug.apk`.

## Luồng hoạt động

1. `scripts/build-web.mjs` gom các asset web vào `www/` (danh sách trong biến
   `WEB_ASSETS` — thêm file web mới thì bổ sung vào đây).
2. `cap sync android` copy `www/` vào `android/app/src/main/assets/public/`.
3. Gradle build ra APK, rồi copy vào `dist/`.

Sửa giao diện/logic: chỉ sửa file web ở root rồi build lại — web và APK luôn
đồng nhất.

## Môi trường build (máy này)

- Node + npm (đã có).
- JDK: dùng JBR của Android Studio (`C:/Program Files/Android/Android Studio/jbr`, JDK 25).
- Android SDK: `C:/Users/T-Root/AppData/Local/Android/Sdk` (API 35, build-tools 36).
- Gradle **9.5.0** (ghim trong `android/gradle/wrapper/gradle-wrapper.properties`)
  và AGP **8.13.0**. Lưu ý: Gradle 9.6.0 xóa một API nội bộ mà AGP 8.x còn dùng,
  nên phải dùng 9.5.0; đừng nâng wrapper lên 9.6.x nếu chưa nâng AGP tương ứng.

`scripts/build-apk.mjs` tự dò JDK/SDK; nếu máy khác, đặt `JAVA_HOME` và
`ANDROID_HOME` trước khi chạy.

## Bản release (ký APK)

`npm run apk:release` tạo bản release nhưng **chưa ký**. Muốn cài/phát hành cần
cấu hình keystore ký trong `android/app/build.gradle`.

## Phát nền + điều khiển màn hình khóa (ĐÃ tích hợp)

Dùng plugin `@jofr/capacitor-media-session`: nó tạo một **foreground service**
có `MediaSession` + thông báo media, giữ nhạc phát tiếp khi tắt màn hình và hiện
nút phát/dừng/trước/sau ở màn hình khóa và thanh thông báo.

Cách nối trong `app.js` (một source, không tách bản riêng):

- Khai báo `nativeMedia` = plugin khi chạy trong APK (`window.Capacitor.isNativePlatform()`),
  còn trên web thì `nativeMedia = null`.
- 3 hàm `setupMediaSession()`, `updatePositionState()`, `syncMediaSession()` có
  thêm nhánh: nếu `nativeMedia` thì đẩy metadata / trạng thái phát / vị trí /
  action (play, pause, previoustrack, nexttrack, seekto, stop) sang plugin; nếu
  không thì chạy y như cũ bằng Media Session API của trình duyệt.

Quyền đã thêm trong `android/app/src/main/AndroidManifest.xml`:
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`
(bắt buộc cho foreground service kiểu mediaPlayback trên Android 14+).

⚠️ **Cần test trên máy thật.** Một số hãng (Xiaomi, Oppo, Vivo...) tối ưu pin
mạnh vẫn có thể dừng app khi tắt màn hình dù đã có foreground service — nếu gặp,
vào phần cài đặt pin của điện thoại cho phép app chạy nền. Muốn chắc tuyệt đối
như app nhạc chuyên nghiệp thì phải phát bằng native thuần (ngoài phạm vi bản này).

Ghi chú: `app.js` còn đăng ký service worker (`navigator.serviceWorker.register('app.js')`)
cho cache offline + nút thông báo trên web. Trong APK đã có nhánh native nên
`syncMediaSession()` không chạy thông báo service worker nữa (tránh trùng notification).

## Icon app

Icon launcher lấy từ `logo.png` và đã sinh sẵn trong `android/app/src/main/res/mipmap-*`
(nền `#080b0e`). Màn hình khởi động chỉ là một màu nền (`res/values/splash_colors.xml`)
nên không cần ảnh splash.

Muốn đổi logo: thay `logo.png`, tạm tạo `resources/icon.png` (1024x1024, PNG thật) rồi chạy
`npx capacitor-assets generate --android --iconBackgroundColor '#080b0e'`. Sau đó xóa
`resources/` và các ảnh `splash*.png` mà lệnh này sinh thêm.
