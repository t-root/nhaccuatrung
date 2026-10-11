// Tương đương loadTrackDuration() trong app.js gốc (dò thời lượng bằng thẻ <audio>
// preload="metadata"). Ở đây dùng expo-av chỉ để đọc metadata rồi giải phóng ngay,
// không giữ lại để phát nhạc thật (việc đó do react-native-track-player đảm nhiệm).
import { Audio } from 'expo-av';
import type { Track } from '@/types';

export async function probeTrackDuration(track: Track): Promise<number | null> {
  try {
    const { sound, status } = await Audio.Sound.createAsync({ uri: track.src }, { shouldPlay: false });
    const loaded = status.isLoaded ? status : await sound.getStatusAsync();
    const duration = loaded.isLoaded && Number.isFinite(loaded.durationMillis) ? (loaded.durationMillis as number) / 1000 : null;
    await sound.unloadAsync();
    return duration;
  } catch {
    return null;
  }
}

// Dò song song có giới hạn (tránh mở hàng chục kết nối HTTP cùng lúc), báo kết quả
// dần qua onResolved thay vì đợi xong hết mới cập nhật UI.
export async function probeDurations(tracks: Track[], onResolved: (id: string, duration: number) => void, concurrency = 4) {
  let cursor = 0;
  async function worker() {
    while (cursor < tracks.length) {
      const track = tracks[cursor++];
      if (Number.isFinite(track.duration)) continue;
      const duration = await probeTrackDuration(track);
      if (duration != null) onResolved(track.id, duration);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}
