// Thay thế IndexedDB ("nhac-cua-trung-audio") + AUDIO_CACHE trong Service Worker
// của app.js gốc. Ở native, cách đơn giản và đáng tin cậy nhất là tải file mp3
// về thư mục cache của app bằng expo-file-system, rồi phát từ file cục bộ.
import * as FileSystem from 'expo-file-system';
import type { Track } from '@/types';

const DIR = `${FileSystem.cacheDirectory}nhac-cua-trung-audio/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function fileNameFor(track: Track) {
  // sha giữ ổn định tên file kể cả khi tựa bài có ký tự đặc biệt
  return `${(track.sha || track.id).replace(/[^a-zA-Z0-9_-]/g, '')}.audio`;
}

export async function getCachedPath(track: Track): Promise<string | null> {
  await ensureDir();
  const path = `${DIR}${fileNameFor(track)}`;
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? path : null;
}

// Tương đương prefetchTrack(): tải trước bài đang phát + bài kế tiếp, không tải cả danh sách
export async function prefetchTrack(track: Track): Promise<string | null> {
  try {
    await ensureDir();
    const path = `${DIR}${fileNameFor(track)}`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) return path;
    const result = await FileSystem.downloadAsync(track.src, path);
    return result.status === 200 ? path : null;
  } catch {
    return null;
  }
}

export async function resolvePlayableUri(track: Track): Promise<string> {
  const cached = await getCachedPath(track);
  return cached ?? track.src;
}

export async function clearCache() {
  await FileSystem.deleteAsync(DIR, { idempotent: true });
}

let prefetchAllInFlight = false;

// Âm thầm tải dần TOÀN BỘ thư viện về máy (tuần tự, không phải Promise.all,
// để không dồn tải hết cùng lúc). Bài nào đã có file cục bộ rồi thì
// prefetchTrack() tự bỏ qua, nên gọi lại hàm này mỗi lần mở app không tốn
// thêm dung lượng/băng thông. Nhờ vậy sau khi mở app có mạng một lần, dần dần
// cả thư viện sẽ nghe được lúc mất mạng.
export async function prefetchAllForOffline(tracks: Track[]) {
  if (prefetchAllInFlight) return;
  prefetchAllInFlight = true;
  try {
    for (const track of tracks) {
      if (/^https?:/i.test(track.src)) await prefetchTrack(track);
    }
  } finally {
    prefetchAllInFlight = false;
  }
}
