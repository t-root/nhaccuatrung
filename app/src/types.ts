// Các kiểu dữ liệu dùng chung, tương ứng với seedTracks/state trong app.js gốc.

export type Track = {
  id: string;          // uid(): "repo:<path>" hoặc "local:<...>"
  title: string;
  artist: string;
  path: string;         // đường dẫn trong repo, ví dụ artist/J97/Sóng Gió.mp3
  sha: string;
  src: string;           // URL raw.githubusercontent.com
  duration?: number;     // giây, tính lười (lazy) khi cần
  local?: boolean;
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  synced: boolean; // false = mới sửa ở máy, chưa đẩy lên GitHub xong
};

export type RepoInfo = { owner: string; name: string };

export type ViewType = 'all' | 'recent' | 'favorites' | 'folder' | 'playlist';

export type View = { type: ViewType; value: string };

export type RepeatMode = 'off' | 'one';

// Nguồn phát hiện tại — quyết định có tự lặp lại từ đầu khi hết danh sách không
export type PlaybackSource = 'none' | 'collection' | 'artist' | 'playlist' | 'queue';

export type SortMode = 'default' | 'title' | 'artist';

export type PersistedState = {
  hidden: string[];
  favorites: string[];
  recent: string[];
  playlists: Playlist[];
  // Thứ tự bài của từng nghệ sĩ: { tênNghệSĩ: [tênFile.mp3, ...] } (khớp artist/order.json trên GitHub).
  artistOrder?: Record<string, string[]>;
  // Nghệ sĩ đã đổi thứ tự ở máy nhưng chưa đẩy lên GitHub xong.
  artistOrderPending?: string[];
};

// Đang sắp xếp vị trí bài hát trong 1 playlist/nghệ sĩ; chưa lưu thì chỉ nằm ở máy.
export type ReorderState = { kind: 'playlist' | 'folder'; key: string; ids: string[]; original: string[] };
