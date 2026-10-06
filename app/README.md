# Nhạc Của Trung — bản React Native (Expo)

Viết lại từ bản web gốc (`index.html` / `app.js` / `styles.css`, dùng repo GitHub
làm "backend") thành app native bằng Expo + `react-native-audio-api`, hướng tới
100% tính năng và giao diện giống bản web.

## ⚠️ Trước khi làm gì khác

Bản web gốc có một **GitHub Personal Access Token viết cứng trong `app.js`**
(dòng 129-133), và file này đang chạy public trên GitHub Pages — bất kỳ ai mở
trang web cũng lấy được token đó và có toàn quyền ghi vào repo của bạn.

**Hãy vào GitHub → Settings → Developer settings → Personal access tokens,
revoke token đó ngay, rồi tạo token mới.** Token mới sẽ được nhập trực tiếp
trong app (màn hình Cài đặt) và lưu bằng `expo-secure-store` trên máy —
không có mặt trong mã nguồn hay trong bundle app nộp lên store.

Tạo token mới nên chọn **fine-grained token**, chỉ cấp quyền
`Contents: Read and write` cho đúng repo nhạc, không cấp quyền gì khác.

## Đã chuyển những gì từ bản web

| Bản web (app.js) | Bản RN |
|---|---|
| Đọc cây file qua GitHub Trees API | `src/api/github.ts` — `loadLibrary()` |
| Đọc/ghi/xóa file, playlist.json qua Contents API | `src/api/github.ts` |
| localStorage (yêu thích, playlist, ẩn, gần đây) | AsyncStorage (`src/state/storage.ts`) |
| Token viết cứng + mật khẩu md5 mở khóa ghi | Token GitHub thật do người dùng tự nhập, lưu SecureStore |
| `<audio>` + Media Session API + Service Worker notification | `react-native-audio-api` (`AudioContext`/`PlaybackNotificationManager`, native) |
| IndexedDB + Cache API để nghe offline | `expo-file-system` tải file về cache app |
| Queue, shuffle, repeat 1 bài / lặp playlist·nghệ sĩ / lặp hàng đợi N lần | Y hệt, chuyển sang `src/state/store.ts` (zustand) |
| Upload file bằng `<input type=file>` | `expo-document-picker` + chip chọn nhanh nghệ sĩ có sẵn |
| 3 view Tất cả / Gần đây / Yêu thích | Nút chuyển view ở đầu tab Thư viện |
| Dò thời lượng từng bài + tổng thời lượng trong stats-line | `src/services/durationProbe.ts` (expo-av, chạy nền) |
| Dialog "Thêm bài hát" hàng loạt vào playlist (lọc all/artist/recent/favorites) | `AddTracksSheet` trong `LibraryScreen.tsx` |
| Canvas visualizer (AnalyserNode, ~700 dòng vẽ) | `src/components/Visualizer.tsx` — bản rút gọn dùng **dữ liệu FFT thật** (`react-native-svg`), xem lưu ý bên dưới |

## Cấu trúc

```
App.tsx                     entry, gọi bootstrap() rồi render navigation
index.ts                    đăng ký root component
src/
  types.ts                  Track / Playlist / View / ...
  api/github.ts              toàn bộ gọi GitHub API (đọc + ghi)
  state/store.ts              store trung tâm (zustand) — thay cho các biến
                              toàn cục + hàm play/queue/playlist trong app.js
  state/storage.ts            AsyncStorage (state) + SecureStore (token)
  services/audioEngine.ts     AudioContext/AnalyserNode/PlaybackNotificationManager
                              (react-native-audio-api) — phát nhạc + màn hình khóa
  services/offlineCache.ts    tải & phát từ cache cục bộ (thay IndexedDB)
  services/durationProbe.ts   dò thời lượng từng bài ở nền (expo-av)
  navigation/index.tsx        tab bar + stack cho PlayerScreen
  screens/                    LibraryScreen, ArtistsScreen, PlaylistsScreen,
                              QueueScreen, PlayerScreen, SettingsScreen
  components/                 TrackRow, MiniPlayer, Toast, EmptyState, Visualizer
```

## ⚠️ Lưu ý về engine phát nhạc (react-native-audio-api)

Để có visualizer dùng dữ liệu tần số **thật** (không phải animation giả), app
dùng `react-native-audio-api` (Web Audio API cho RN) thay cho
`react-native-track-player`. Điều này kéo theo vài đánh đổi cần biết:

- **Tải bài chậm hơn streaming**: engine này phát qua `decodeAudioData()`, tức
  phải tải + giải mã xong cả file mp3 rồi mới phát được (không progressive
  streaming), khác với `<audio>`/track-player phát ngay trong lúc tải. App có
  hiện icon "đang tải" trên nút Play trong lúc này.
- **New Architecture bắt buộc bật** (`expo-build-properties` trong `app.json`)
  — SDK 51 + New Architecture còn khá mới, theo tài liệu chính thức của Expo có
  thể gặp vài lỗi vặt đã được vá ở bản SDK mới hơn.
- **Chưa test trên thiết bị/emulator thật** — máy dựng project này không có
  Android SDK, mọi thứ chỉ được xác minh qua `tsc`, `expo export`,
  `expo-doctor`, và `expo prebuild` cục bộ (xác nhận config plugin sinh đúng
  `AndroidManifest.xml`/`gradle.properties`). Lần build APK đầu tiên sau khi
  đổi engine có thể cần vài vòng sửa lỗi biên dịch native.

Nếu build APK mới bị lỗi hoặc phát nhạc không ổn định, phương án lùi an toàn là
quay lại commit trước đó (`git log`, tìm commit "Add missing feature parity...")
vẫn dùng `react-native-track-player` — mọi tính năng khác không đổi.

## Chạy thử

```bash
npm install
npx expo prebuild            # sinh code Android/iOS (cần vì audio-api là native module)
npx expo run:android         # hoặc: eas build -p android --profile preview
```

Lần đầu mở app: vào tab **Cài đặt**, nhập `owner/repo` của bạn (ví dụ
`trannguyen/nhaccuatrung`), bấm "Lưu & tải thư viện". Muốn sửa (yêu thích,
playlist, tải bài mới lên...) thì dán GitHub token vào ô bên dưới.

## Build ra APK cài trực tiếp lên máy (không cần Play Store)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```
EAS sẽ trả về link tải file `.apk`, tải về điện thoại Android và cài trực tiếp
(cần bật "Cài từ nguồn không xác định" trong Settings).

## Chưa làm / cần bạn quyết định tiếp

- **iOS**: chưa test, cần tài khoản Apple Developer để cài lâu dài lên iPhone
  thật (miễn phí thì app hết hạn sau 7 ngày).
- Repo trong bản web được TỰ SUY RA từ URL GitHub Pages (`*.github.io`); bản
  RN không chạy trong trình duyệt nên phải nhập tay owner/repo trong Cài đặt.
- Chưa viết test tự động; các luồng ghi (xóa/đổi tên/upload) nên test kỹ bằng
  tay trước khi dùng với dữ liệu thật, vì mọi thao tác ghi đều tác động thẳng
  lên repo GitHub qua API — không có "thùng rác" để khôi phục.
- Visualizer là bản rút gọn (thanh phổ dạng vòng cung, oscilloscope, lõi phát
  sáng theo bass) chứ chưa port đủ toàn bộ hiệu ứng gốc (laser, vệ tinh sao
  chổi, đồng hồ BASS/MID/HI...) — có thể bổ sung thêm sau nếu cần giống hệt.
