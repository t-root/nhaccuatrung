// Service chạy nền cho react-native-track-player.
// Đây là phần thay thế setupMediaSession() + Service Worker notification
// trong app.js gốc — nhưng ở native, track-player tự vẽ thông báo/điều khiển
// trên màn hình khóa, thanh kéo xuống, tai nghe Bluetooth,... không cần code thêm.
import TrackPlayer, { Event } from 'react-native-track-player';
import { useStore } from '@/state/store';

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));

  // store.ts điều khiển từng bài bằng TrackPlayer.reset()+add(1 bài) chứ không
  // nạp cả hàng đợi vào track-player, nên native queue luôn chỉ có đúng 1 item
  // và TrackPlayer.skipToNext()/skipToPrevious() luôn thất bại (không có gì để
  // nhảy tới). Phải gọi thẳng moveQueue() của store — nơi thực sự biết queue/
  // repeat/shuffle — giống hệt cách web (app.js) xử lý nút Next/Previous.
  TrackPlayer.addEventListener(Event.RemoteNext, () => useStore.getState().moveQueue(1));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => useStore.getState().moveQueue(-1));

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) await TrackPlayer.pause();
    else if (event.permanent) await TrackPlayer.pause();
    else await TrackPlayer.play();
  });
}
