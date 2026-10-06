import './src/polyfills';
import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { PlaybackService } from './src/services/trackPlayerService';

// Đăng ký root component (tương đương document + app.js chạy trong trang web)
registerRootComponent(App);

// Đăng ký service chạy nền cho player — tương đương phần
// setupMediaSession() + setupActionNotification() trong app.js gốc,
// nhưng ở đây react-native-track-player lo toàn bộ thông báo,
// nút bấm trên màn hình khóa, tai nghe bluetooth,... một cách native.
TrackPlayer.registerPlaybackService(() => PlaybackService);
