// Store trung tâm (zustand) — gộp toàn bộ biến toàn cục + hàm điều khiển của
// app.js gốc: seedTracks, view, queue, queueIndex, repeatMode, playlistRepeat,
// playbackSource, shuffle, canWrite, state (hidden/favorites/recent/playlists),
// loadLibrary(), playTrack(), moveQueue(), toggleFavorite(), v.v.
import { create } from 'zustand';
import TrackPlayer, { Capability, Event, State as RNTPState } from 'react-native-track-player';
import { GitHubClient, parseRepoInput } from '@/api/github';
import { prefetchAllForOffline, prefetchTrack, resolvePlayableUri } from '@/services/offlineCache';
import { probeDurations } from '@/services/durationProbe';
import {
  DEFAULT_REPO,
  PLAYBACK_RATES,
  defaultState,
  readGitHubToken,
  readLibraryCache,
  readPersistedState,
  readPlaybackRate,
  readRepoConfig,
  saveLibraryCache,
  savePersistedState,
  savePlaybackRate,
  saveRepoConfig,
} from '@/state/storage';
import type {
  PersistedState,
  Playlist,
  PlaybackSource,
  RepeatMode,
  ReorderState,
  RepoInfo,
  SortMode,
  Track,
  View,
} from '@/types';

function sourceForView(view: View): PlaybackSource {
  if (view.type === 'playlist') return 'playlist';
  if (view.type === 'folder') return 'artist';
  return 'collection';
}
// Fisher–Yates: xáo trộn đều, khác với sort(() => Math.random() - 0.5) bị lệch.
function shuffledCopy<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function trackFileName(track: Track | undefined) {
  return String(track?.path ?? '').split('/').pop() ?? '';
}
// Áp dụng thứ tự đã lưu lên danh sách bài: sắp lại bài trong từng nghệ sĩ, giữ nguyên thứ tự giữa các nghệ sĩ;
// bài chưa có trong order.json (mới tải lên) xếp sau.
function applyArtistOrder(list: Track[], orders: Record<string, string[]>): Track[] {
  const firstIndex = new Map<string, number>();
  list.forEach((t, i) => {
    if (!firstIndex.has(t.artist)) firstIndex.set(t.artist, i);
  });
  const rank = new Map<Track, number>(
    list.map((t, i) => {
      const order = orders[t.artist];
      const pos = order ? order.indexOf(trackFileName(t)) : -1;
      return [t, pos >= 0 ? pos : order ? order.length + i : i];
    })
  );
  return [...list].sort((a, b) => firstIndex.get(a.artist)! - firstIndex.get(b.artist)! || rank.get(a)! - rank.get(b)!);
}
function reorderMatches(reorder: ReorderState | null, view: View) {
  return Boolean(reorder) && reorder!.kind === view.type && reorder!.key === view.value;
}
function repeatsBySource(source: PlaybackSource) {
  return source === 'playlist' || source === 'artist';
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type Store = {
  // ----- cấu hình / quyền -----
  repo: RepoInfo | null;
  token: string | null;
  canWrite: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  // Kept for compatibility; credentials now load automatically from key.txt.
  showAccessPrompt: boolean;
  dismissAccessPrompt: () => void;

  // ----- thư viện -----
  client: GitHubClient | null;
  tracks: Track[];
  persisted: PersistedState;
  // Sắp xếp vị trí bài hát (chưa lưu thì chỉ nằm ở máy): null = không ở chế độ sắp xếp.
  reorder: ReorderState | null;

  // ----- điều hướng / danh sách hiển thị -----
  view: View;
  search: string;
  sort: SortMode;

  // ----- phát nhạc -----
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean; // tương ứng State.Buffering/Loading của track-player (đang tải file qua mạng)
  positionSec: number;
  durationSec: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  playbackRate: number;
  playlistRepeat: boolean;
  queueRepeatLimit: number; // 0..3
  queueRepeatRemaining: number;
  playbackSource: PlaybackSource;

  toast: string | null;

  // ----- actions: setup -----
  bootstrap: () => Promise<void>;
  setRepoFromInput: (text: string) => Promise<boolean>;
  setCanWrite: (enabled: boolean) => void;
  loadLibrary: () => Promise<void>;

  // ----- actions: điều hướng -----
  setView: (view: View) => void;
  setSearch: (text: string) => void;
  setSort: (sort: SortMode) => void;
  visibleTracks: () => Track[];
  artists: () => string[];

  // ----- actions: phát nhạc -----
  playTrack: (track: Track, nextQueue?: Track[] | null, isShuffled?: boolean) => Promise<void>;
  playCurrentList: (forceShuffle?: boolean) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  moveQueue: (direction: 1 | -1) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  addToQueue: (id: string) => void;
  playQueue: () => Promise<void>;
  cycleRepeatMode: () => void;
  cyclePlaybackRate: () => void;
  startReorder: () => void;
  moveInReorder: (id: string, how: 'up' | 'down' | 'top') => void;
  cancelReorder: (silent?: boolean) => void;
  saveReorder: () => Promise<void>;
  syncArtistOrder: () => Promise<void>;
  togglePlaylistRepeat: () => void;
  cycleQueueRepeat: () => void;

  // ----- actions: yêu thích / gần đây -----
  toggleFavorite: (id: string) => void;

  // ----- actions: playlist -----
  createPlaylist: (name: string, trackId?: string, initialTrackIds?: string[]) => Promise<void>;
  createPlaylistFromArtists: (artistNames: string[]) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addManyToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  renamePlaylist: (playlistId: string, newName: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  refreshPlaylistFromGitHub: (playlistId: string) => Promise<void>;

  // ----- actions: quản trị thư viện (cần canWrite) -----
  deleteTrack: (id: string) => Promise<void>;
  renameArtist: (oldName: string, newName: string) => Promise<void>;
  deleteArtist: (name: string) => Promise<void>;
  uploadLocalFiles: (files: { uri: string; name: string }[], artistName: string) => Promise<void>;

  showToast: (message: string) => void;
  dismissToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<Store>((set, get) => ({
  repo: null,
  token: null,
  canWrite: false,
  loadStatus: 'idle',
  loadError: null,
  showAccessPrompt: false,
  dismissAccessPrompt: () => set({ showAccessPrompt: false }),

  client: null,
  tracks: [],
  persisted: { ...defaultState },
  reorder: null,

  view: { type: 'all', value: '' },
  search: '',
  sort: 'default',

  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isBuffering: false,
  positionSec: 0,
  durationSec: 0,
  shuffle: false,
  repeatMode: 'off',
  playbackRate: 1,
  playlistRepeat: true,
  queueRepeatLimit: 0,
  queueRepeatRemaining: 0,
  playbackSource: 'none',

  toast: null,

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 2800);
  },
  dismissToast: () => set({ toast: null }),

  bootstrap: async () => {
    await TrackPlayer.setupPlayer().catch(() => {});
    await TrackPlayer.updateOptions({
      // 6 khả năng tương ứng đúng 6 nút Media Session trong app.js gốc:
      // play / pause / previoustrack / nexttrack / seekto / stop
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
      // Bắt buộc phải có để Event.PlaybackProgressUpdated được bắn định kỳ,
      // nếu không positionSec/durationSec sẽ đứng yên và timeline không chạy.
      progressUpdateEventInterval: 1,
    }).catch(() => {});

    const [savedRepo, token, persisted] = await Promise.all([readRepoConfig(), readGitHubToken(), readPersistedState()]);
    // Chưa từng cấu hình repo -> dùng repo mặc định của Trung luôn, khỏi bắt nhập tay.
    const repo = savedRepo ?? DEFAULT_REPO;
    if (!savedRepo) await saveRepoConfig(repo);
    set({ repo, token, canWrite: Boolean(token), persisted, showAccessPrompt: false });

    const playbackRate = await readPlaybackRate();
    set({ playbackRate });
    await TrackPlayer.setRate(playbackRate).catch(() => {});

    TrackPlayer.addEventListener(Event.PlaybackState, (e: any) => {
      set({ isPlaying: e.state === RNTPState.Playing, isBuffering: e.state === RNTPState.Buffering || e.state === RNTPState.Loading });
    });
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (e) => {
      set({ positionSec: e.position, durationSec: e.duration });
    });
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      get().moveQueue(1);
    });

    if (repo) get().loadLibrary();
  },

  setRepoFromInput: async (text) => {
    const repo = parseRepoInput(text);
    if (!repo) {
      get().showToast('Định dạng phải là owner/repo, ví dụ: trung/nhac-cua-trung.');
      return false;
    }
    await saveRepoConfig(repo);
    set({ repo });
    await get().loadLibrary();
    return true;
  },

  setCanWrite: (enabled) => set({ canWrite: enabled }),

  loadLibrary: async () => {
    const { repo, token } = get();
    if (!repo) {
      set({ loadStatus: 'error', loadError: 'Chưa cấu hình repository GitHub.' });
      return;
    }
    set({ loadStatus: 'loading', loadError: null });
    const client = new GitHubClient(repo, token);
    try {
      const { tracks: rawTracks, playlists: remotePlaylists, artistOrders } = await client.loadLibrary();
      const persisted = { ...get().persisted };

      // Thứ tự bài của nghệ sĩ: lấy bản trên GitHub, trừ nghệ sĩ đang chờ đồng bộ (đã sửa ở máy) thì giữ bản ở máy.
      if (artistOrders) {
        const local = persisted.artistOrder ?? {};
        const merged = { ...artistOrders };
        (persisted.artistOrderPending ?? []).forEach((name) => {
          if (local[name]) merged[name] = local[name];
        });
        persisted.artistOrder = merged;
      }
      const tracks = applyArtistOrder(rawTracks, persisted.artistOrder ?? {});

      const remoteNames = new Set(remotePlaylists.map((p) => p.name.toLocaleLowerCase()));
      // Chỉ bỏ khỏi máy những playlist đã từng đồng bộ mà giờ không còn trên GitHub;
      // playlist vừa sửa ở máy này (synced === false) thì giữ nguyên.
      persisted.playlists = persisted.playlists.filter((p) => remoteNames.has(p.name.toLocaleLowerCase()) || p.synced === false);

      remotePlaylists.forEach((remote) => {
        const trackIds = (remote.tracks || [])
          .map((path) => tracks.find((t) => t.path === path)?.id)
          .filter(Boolean) as string[];
        const existing = persisted.playlists.find((p) => p.name.toLocaleLowerCase() === remote.name.toLocaleLowerCase());
        if (existing) {
          if (existing.synced !== false) {
            existing.trackIds = trackIds;
            existing.synced = true;
          }
        } else {
          persisted.playlists.push({ id: `playlist:${Date.now()}-${remote.name}`, name: remote.name, trackIds, synced: true });
        }
      });

      set({ client, tracks, persisted, loadStatus: 'ready' });
      await savePersistedState(persisted);
      await saveLibraryCache(repo, tracks);

      // thử đẩy lại thứ tự nghệ sĩ / các playlist chưa đồng bộ (ví dụ vừa mất mạng lúc sửa)
      if ((persisted.artistOrderPending ?? []).length) get().syncArtistOrder().catch(() => {});
      for (const p of persisted.playlists.filter((p) => p.synced === false)) {
        client.syncPlaylist(p, tracks).then(() => {
          p.synced = true;
          savePersistedState(get().persisted);
        }).catch(() => {});
      }

      // Tương đương ensureDurations(seedTracks) trong app.js gốc — dò thời lượng
      // từng bài ở nền, cập nhật dần vào danh sách khi có kết quả.
      probeDurations(tracks, (id, duration) => {
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, duration } : t)) }));
      });

      // Âm thầm tải dần toàn bộ thư viện về máy để nghe được lúc mất mạng.
      prefetchAllForOffline(tracks);
    } catch (error: any) {
      const cached = await readLibraryCache();
      if (cached && cached.repo.owner === repo.owner && cached.repo.name === repo.name && cached.tracks.length) {
        set({ tracks: applyArtistOrder(cached.tracks, get().persisted.artistOrder ?? {}), loadStatus: 'ready', loadError: null });
        get().showToast('Không có mạng. Đang dùng danh sách nhạc đã lưu trên máy.');
        probeDurations(cached.tracks, (id, duration) => {
          set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, duration } : t)) }));
        });
        return;
      }
      set({ loadStatus: 'error', loadError: error.message || 'Không tải được thư viện.' });
      get().showToast(
        error.message === 'GitHub Pages URL required'
          ? 'Chưa cấu hình repository.'
          : 'Không đọc được file nhạc từ GitHub. Kiểm tra repository công khai và thử lại.'
      );
    }
  },

  setView: (view) => {
    const had = get().reorder;
    if (had && had.kind === view.type && had.key === view.value) return; // bấm lại đúng danh sách đang sắp xếp
    set({ view, search: '', reorder: null });
    if (had) get().showToast('Đã hủy thay đổi thứ tự chưa lưu.');
  },
  setSearch: (text) => set({ search: text }),
  setSort: (sort) => set({ sort }),

  artists: () => [...new Set(get().tracks.map((t) => t.artist))],

  visibleTracks: () => {
    const { tracks, persisted, view, search, sort, reorder } = get();
    if (reorderMatches(reorder, view)) {
      return reorder!.ids.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];
    }
    let list = tracks.filter((t) => !persisted.hidden.includes(t.id));
    if (view.type === 'recent') list = persisted.recent.map((id) => list.find((t) => t.id === id)).filter(Boolean) as Track[];
    if (view.type === 'favorites') list = list.filter((t) => persisted.favorites.includes(t.id));
    if (view.type === 'folder') list = list.filter((t) => t.artist === view.value);
    if (view.type === 'playlist') {
      const playlist = persisted.playlists.find((p) => p.id === view.value);
      // Hiển thị đúng thứ tự đã lưu trong playlist.json (trackIds), không theo thứ tự thư viện.
      list = playlist ? (playlist.trackIds.map((id) => list.find((t) => t.id === id)).filter(Boolean) as Track[]) : [];
    }
    const q = search.trim().toLocaleLowerCase();
    if (q) list = list.filter((t) => `${t.title} ${t.artist}`.toLocaleLowerCase().includes(q));
    if (sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    if (sort === 'artist') list = [...list].sort((a, b) => a.artist.localeCompare(b.artist, 'vi') || a.title.localeCompare(b.title, 'vi'));
    return list;
  },

  // ---------------- phát nhạc ----------------

  playTrack: async (track, nextQueue, isShuffled = false) => {
    const state = get();
    const view = state.view;
    let playbackSource = state.playbackSource;
    if (nextQueue && playbackSource !== 'queue' && (view.type === 'playlist' || view.type === 'folder')) {
      playbackSource = sourceForView(view);
    }

    let queue = state.queue;
    let queueIndex = state.queueIndex;
    if (nextQueue) {
      queue = [...nextQueue];
      queueIndex = queue.findIndex((t) => t.id === track.id);
    } else if (!queue.some((t) => t.id === track.id)) {
      queue = [track];
      queueIndex = 0;
    }

    // Đưa cả một danh sách mới vào hàng đợi thì chế độ ngẫu nhiên theo đúng danh sách đó; phát lại chính
    // hàng đợi hiện tại (playQueue, lặp vòng) thì giữ nguyên.
    const shuffle = nextQueue && nextQueue !== state.queue ? isShuffled : state.shuffle;
    set({ currentTrack: track, queue, queueIndex, playbackSource, shuffle });

    try {
      const uri = await resolvePlayableUri(track);
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: uri,
        title: track.title,
        artist: track.artist,
        artwork: require('../../assets/icon.png'),
      });
      // reset() có thể đưa tốc độ về 1x, nên đặt lại tốc độ người dùng đã chọn trước khi phát.
      await TrackPlayer.setRate(get().playbackRate).catch(() => {});
      await TrackPlayer.play();

      const persisted = { ...state.persisted };
      persisted.recent = [track.id, ...persisted.recent.filter((id) => id !== track.id)].slice(0, 20);
      set({ persisted });
      savePersistedState(persisted);

      // tải trước bài kế tiếp trong hàng đợi, giống preloadNextTrack()
      const next = queue[queueIndex + 1];
      if (next) prefetchTrack(next);
    } catch {
      get().showToast('Bỏ qua file lỗi, chuyển sang bài tiếp theo.');
      get().moveQueue(1);
    }
  },

  playCurrentList: async (forceShuffle = false) => {
    const { visibleTracks, view } = get();
    const tracks = visibleTracks();
    if (!tracks.length) return get().showToast('Danh sách này chưa có bài hát.');
    set({ playbackSource: sourceForView(view) });
    // Chỉ nút "Phát ngẫu nhiên" (forceShuffle = true) mới xáo; "Phát tất cả" luôn phát đúng thứ tự danh sách.
    const ordered = forceShuffle ? shuffledCopy(tracks) : tracks;
    await get().playTrack(ordered[0], ordered, forceShuffle);
  },

  togglePlayPause: async () => {
    const { currentTrack, isPlaying, playCurrentList } = get();
    if (!currentTrack) return playCurrentList();
    if (isPlaying) await TrackPlayer.pause();
    else await TrackPlayer.play();
  },

  seekTo: async (seconds) => {
    await TrackPlayer.seekTo(seconds);
  },

  moveQueue: async (direction) => {
    const { queue, queueIndex, repeatMode, playbackSource, playlistRepeat, queueRepeatRemaining, currentTrack, playTrack } = get();
    if (!queue.length) return;
    const next = queueIndex + direction;
    if (next < 0 || next >= queue.length) {
      if (repeatMode === 'one' && currentTrack) return playTrack(currentTrack);
      if (repeatsBySource(playbackSource) && playlistRepeat) {
        const idx = direction > 0 ? 0 : queue.length - 1;
        set({ queueIndex: idx });
        return playTrack(queue[idx]);
      }
      if (queueRepeatRemaining > 0 && direction > 0) {
        set({ queueRepeatRemaining: queueRepeatRemaining - 1, queueIndex: 0 });
        return playTrack(queue[0]);
      }
      return; // hết danh sách, không có chế độ lặp nào bật -> dừng
    }
    set({ queueIndex: next });
    await playTrack(queue[next]);
  },

  addToQueue: (id) => {
    const { tracks, persisted, queue, queueIndex, showToast } = get();
    const track = tracks.find((t) => t.id === id && !persisted.hidden.includes(t.id));
    if (!track) return;
    if (queue.some((t) => t.id === id)) return showToast('Bài hát đã có trong hàng đợi.');
    const nextQueue = [...queue, track];
    set({ queue: nextQueue, queueIndex: queueIndex < 0 ? 0 : queueIndex });
    showToast(`Đã thêm "${track.title}" vào hàng đợi.`);
  },

  playQueue: async () => {
    const { queue, playTrack, showToast } = get();
    if (!queue.length) return showToast('Hàng đợi đang trống.');
    set({ playbackSource: 'queue', queueRepeatRemaining: get().queueRepeatLimit });
    await playTrack(queue[0], queue);
  },

  cycleRepeatMode: () => {
    const repeatMode: RepeatMode = get().repeatMode === 'off' ? 'one' : 'off';
    set({ repeatMode });
    get().showToast(repeatMode === 'one' ? 'Bài hát đang lặp vô hạn.' : 'Đã tắt lặp bài hát.');
  },

  // ---------------- sắp xếp vị trí bài hát ----------------
  // Chỉnh xong tất cả rồi bấm "Lưu thứ tự" mới đẩy lên GitHub, đúng 1 lần cho mỗi danh sách (không lưu từng lần di chuyển).

  startReorder: () => {
    const { canWrite, view, tracks, persisted, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    if (view.type !== 'playlist' && view.type !== 'folder') return;
    const visible = tracks.filter((t) => !persisted.hidden.includes(t.id));
    let ids: string[];
    if (view.type === 'playlist') {
      const playlist = persisted.playlists.find((p) => p.id === view.value);
      ids = playlist ? (playlist.trackIds.map((id) => visible.find((t) => t.id === id)?.id).filter(Boolean) as string[]) : [];
    } else {
      ids = visible.filter((t) => t.artist === view.value).map((t) => t.id);
    }
    if (ids.length < 2) return showToast('Cần ít nhất 2 bài hát để sắp xếp.');
    set({ reorder: { kind: view.type, key: view.value, ids, original: [...ids] }, search: '' });
  },

  moveInReorder: (id, how) => {
    const { reorder } = get();
    if (!reorder) return;
    const from = reorder.ids.indexOf(id);
    if (from < 0) return;
    const to = how === 'top' ? 0 : how === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= reorder.ids.length || to === from) return;
    const ids = [...reorder.ids];
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    set({ reorder: { ...reorder, ids } });
  },

  cancelReorder: (silent = false) => {
    if (!get().reorder) return;
    set({ reorder: null });
    if (!silent) get().showToast('Đã hủy sắp xếp, thứ tự giữ nguyên.');
  },

  saveReorder: async () => {
    const { reorder, view, persisted, tracks, client, showToast } = get();
    if (!reorder || !reorderMatches(reorder, view)) return;
    if (reorder.ids.join('\n') === reorder.original.join('\n')) {
      set({ reorder: null });
      return showToast('Thứ tự không thay đổi.');
    }

    if (reorder.kind === 'playlist') {
      const playlist = persisted.playlists.find((p) => p.id === reorder.key);
      if (!playlist) {
        set({ reorder: null });
        return showToast('Không tìm thấy playlist.');
      }
      // Bài không nằm trong danh sách đang sắp xếp (ví dụ bài đã ẩn) giữ nguyên, xếp sau cùng.
      playlist.trackIds = [...reorder.ids, ...playlist.trackIds.filter((id) => !reorder.ids.includes(id))];
      playlist.synced = false;
      const next = { ...persisted };
      set({ persisted: next, reorder: null });
      await savePersistedState(next);
      try {
        await client?.syncPlaylist(playlist, tracks);
        playlist.synced = true;
        await savePersistedState(get().persisted);
        showToast(`Đã lưu thứ tự playlist "${playlist.name}".`);
      } catch (error: any) {
        showToast(`Đã lưu thứ tự cục bộ: ${error.message}`);
      }
      return;
    }

    const name = reorder.key;
    const order = reorder.ids.map((id) => trackFileName(tracks.find((t) => t.id === id))).filter(Boolean);
    const next: PersistedState = {
      ...persisted,
      artistOrder: { ...(persisted.artistOrder ?? {}), [name]: order },
      artistOrderPending: [...new Set([...(persisted.artistOrderPending ?? []), name])],
    };
    const ordered = applyArtistOrder(tracks, next.artistOrder ?? {});
    set({ persisted: next, tracks: ordered, reorder: null });
    await savePersistedState(next);
    if (client && get().repo) await saveLibraryCache(get().repo!, ordered);
    try {
      await get().syncArtistOrder();
      showToast(`Đã lưu thứ tự bài hát của "${name}".`);
    } catch (error: any) {
      showToast(`Đã lưu thứ tự cục bộ: ${error.message}`);
    }
  },

  // Đẩy thứ tự của MỌI nghệ sĩ đang chờ lên GitHub trong 1 lần ghi duy nhất.
  syncArtistOrder: async () => {
    const { client, persisted, tracks } = get();
    const pending = persisted.artistOrderPending ?? [];
    if (!pending.length) return;
    if (!client) throw new Error('Chưa cấu hình repository.');
    await client.syncArtistOrder(pending, persisted.artistOrder ?? {}, [...new Set(tracks.map((t) => t.artist))]);
    const current = get().persisted;
    const next = { ...current, artistOrderPending: (current.artistOrderPending ?? []).filter((n) => !pending.includes(n)) };
    set({ persisted: next });
    await savePersistedState(next);
  },

  cyclePlaybackRate: () => {
    const index = PLAYBACK_RATES.indexOf(get().playbackRate);
    const playbackRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
    set({ playbackRate });
    TrackPlayer.setRate(playbackRate).catch(() => {});
    savePlaybackRate(playbackRate);
    get().showToast(playbackRate === 1 ? 'Tốc độ phát: bình thường (1x).' : `Tốc độ phát: ${playbackRate}x.`);
  },

  togglePlaylistRepeat: () => {
    const playlistRepeat = !get().playlistRepeat;
    set({ playlistRepeat });
    get().showToast(playlistRepeat ? 'Đang lặp vô hạn.' : 'Đã tắt lặp.');
  },

  cycleQueueRepeat: () => {
    const limit = get().queueRepeatLimit >= 3 ? 0 : get().queueRepeatLimit + 1;
    set({ queueRepeatLimit: limit, queueRepeatRemaining: limit });
    get().showToast(limit ? `Hàng đợi sẽ lặp ${limit} lần.` : 'Đã tắt lặp hàng đợi.');
  },

  // ---------------- yêu thích ----------------

  toggleFavorite: (id) => {
    const { canWrite, persisted, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const favorites = persisted.favorites.includes(id)
      ? persisted.favorites.filter((x) => x !== id)
      : [id, ...persisted.favorites];
    const next = { ...persisted, favorites };
    set({ persisted: next });
    savePersistedState(next);
  },

  // ---------------- playlist ----------------

  createPlaylist: async (name, trackId, initialTrackIds) => {
    const { canWrite, persisted, tracks, client, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const cleanName = name.trim();
    if (!cleanName) return showToast('Nhập tên playlist.');
    if (persisted.playlists.some((p) => p.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      return showToast('Playlist này đã tồn tại.');
    }
    const playlist: Playlist = {
      id: `playlist:${Date.now()}`,
      name: cleanName,
      trackIds: initialTrackIds ?? (trackId ? [trackId] : []),
      synced: false,
    };
    const next = { ...persisted, playlists: [...persisted.playlists, playlist] };
    set({ persisted: next });
    await savePersistedState(next);
    try {
      await client?.syncPlaylist(playlist, tracks);
      playlist.synced = true;
      await savePersistedState(get().persisted);
      showToast(`Đã tạo playlist "${playlist.name}".`);
    } catch (error: any) {
      showToast(`Đã lưu playlist cục bộ: ${error.message}`);
    }
  },

  // Tạo playlist từ ≥2 nghệ sĩ: tên tự đặt bằng cách nối tên các nghệ sĩ ("Bray + Dattka"),
  // nội dung là toàn bộ bài (chưa bị ẩn) của các nghệ sĩ đó.
  createPlaylistFromArtists: async (artistNames) => {
    const { canWrite, persisted, tracks, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    if (artistNames.length < 2) return showToast('Chọn từ 2 nghệ sĩ trở lên.');
    const trackIds = tracks
      .filter((t) => artistNames.includes(t.artist) && !persisted.hidden.includes(t.id))
      .map((t) => t.id);
    await get().createPlaylist(artistNames.join(' + '), undefined, trackIds);
  },

  addToPlaylist: async (playlistId, trackId) => {
    await get().addManyToPlaylist(playlistId, [trackId]);
  },

  addManyToPlaylist: async (playlistId, trackIds) => {
    const { canWrite, persisted, tracks, client, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const playlist = persisted.playlists.find((p) => p.id === playlistId);
    if (!playlist) return showToast('Chưa có playlist để chọn.');
    const newIds = trackIds.filter((id) => !playlist.trackIds.includes(id));
    if (!newIds.length) return showToast('Bài hát đã có trong playlist.');
    playlist.trackIds.push(...newIds);
    playlist.synced = false;
    const next = { ...persisted };
    set({ persisted: next });
    await savePersistedState(next);
    try {
      await client?.syncPlaylist(playlist, tracks);
      playlist.synced = true;
      await savePersistedState(get().persisted);
      showToast(`Đã thêm ${newIds.length} bài hát vào ${playlist.name}.`);
    } catch (error: any) {
      showToast(`Đã lưu playlist cục bộ: ${error.message}`);
    }
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    const { canWrite, persisted, tracks, client, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const playlist = persisted.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    playlist.synced = false;
    const next = { ...persisted };
    set({ persisted: next });
    await savePersistedState(next);
    try {
      await client?.syncPlaylist(playlist, tracks);
      playlist.synced = true;
      await savePersistedState(get().persisted);
      showToast('Đã xóa bài hát khỏi playlist.');
    } catch (error: any) {
      showToast(`Đã xóa cục bộ: ${error.message}`);
    }
  },

  renamePlaylist: async (playlistId, newName) => {
    const { canWrite, persisted, tracks, client, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const cleanName = newName.trim();
    if (!cleanName) return showToast('Nhập tên playlist.');
    const playlist = persisted.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    playlist.name = cleanName;
    playlist.synced = false;
    const next = { ...persisted };
    set({ persisted: next });
    await savePersistedState(next);
    try {
      await client?.syncPlaylist(playlist, tracks);
      playlist.synced = true;
      await savePersistedState(get().persisted);
      showToast(`Đã đổi tên playlist thành "${cleanName}".`);
    } catch (error: any) {
      showToast(`Đã đổi tên cục bộ: ${error.message}`);
    }
  },

  deletePlaylist: async (playlistId) => {
    const { canWrite, persisted, client, view, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const playlist = persisted.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    try {
      await client?.deletePlaylistRemote(playlist);
      const next = { ...persisted, playlists: persisted.playlists.filter((p) => p.id !== playlistId) };
      set({ persisted: next, view: view.value === playlistId ? { type: 'all', value: '' } : view });
      await savePersistedState(next);
      showToast('Đã xóa playlist trên GitHub.');
    } catch (error: any) {
      showToast(error.message);
    }
  },

  refreshPlaylistFromGitHub: async (playlistId) => {
    const { client, persisted, tracks, view, showToast } = get();
    if (!client) return;
    const playlist = persisted.playlists.find((p) => p.id === playlistId);
    if (!playlist || playlist.synced === false) return;
    try {
      const remote = await client.fetchPlaylistFile(playlist.name);
      if (!remote) return;
      const trackIds = (remote.tracks || []).map((path) => tracks.find((t) => t.path === path)?.id).filter(Boolean) as string[];
      playlist.trackIds = trackIds;
      playlist.synced = true;
      const next = { ...persisted };
      set({ persisted: next });
      await savePersistedState(next);
      if (view.type === 'playlist' && view.value === playlistId) set({ view: { ...view } });
    } catch {
      // mạng lỗi -> giữ bản đang có, im lặng như bản gốc
    }
  },

  // ---------------- quản trị thư viện ----------------

  deleteTrack: async (id) => {
    const { canWrite, tracks, client, showToast, loadLibrary } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const track = tracks.find((t) => t.id === id);
    if (!track || !client) return;
    try {
      await client.deleteTrackFile(track);
      await loadLibrary();
      showToast('Đã xóa file khỏi GitHub.');
    } catch (error: any) {
      showToast(error.message);
    }
  },

  renameArtist: async (oldName, newName) => {
    const { canWrite, tracks, client, view, showToast, loadLibrary } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    if (!newName || newName === '.' || newName === '..' || /[\\/]/.test(newName)) {
      return showToast('Tên nghệ sĩ không hợp lệ.');
    }
    if (newName.toLocaleLowerCase() === oldName.toLocaleLowerCase()) return;
    if (get().artists().some((a) => a.toLocaleLowerCase() === newName.toLocaleLowerCase())) {
      return showToast('Tên nghệ sĩ đã tồn tại.');
    }
    if (!client) return;
    try {
      await client.renameArtist(oldName, newName, tracks);
      // Chuyển thứ tự bài sang tên mới; bản trên GitHub được ghi (và dọn tên cũ) ở lần đồng bộ ngay sau khi tải lại thư viện.
      const p = get().persisted;
      if (p.artistOrder?.[oldName]) {
        const artistOrder = { ...p.artistOrder, [newName]: p.artistOrder[oldName] };
        delete artistOrder[oldName];
        const next = {
          ...p,
          artistOrder,
          artistOrderPending: [...new Set([...(p.artistOrderPending ?? []).filter((n) => n !== oldName), newName])],
        };
        set({ persisted: next });
        await savePersistedState(next);
      }
      if (view.type === 'folder' && view.value === oldName) set({ view: { type: 'folder', value: newName } });
      await loadLibrary();
      showToast(`Đã đổi tên nghệ sĩ thành "${newName}".`);
    } catch (error: any) {
      showToast(error.message);
    }
  },

  deleteArtist: async (name) => {
    const { canWrite, tracks, client, view, showToast, loadLibrary } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    const artistTracks = tracks.filter((t) => t.artist === name);
    if (!artistTracks.length || !client) return showToast('Nghệ sĩ này không có file nhạc.');
    try {
      for (const track of artistTracks) await client.deleteTrackFile(track);
      if (view.type === 'folder' && view.value === name) set({ view: { type: 'all', value: '' } });
      await loadLibrary();
      showToast(`Đã xóa nghệ sĩ "${name}".`);
    } catch (error: any) {
      showToast(error.message);
    }
  },

  uploadLocalFiles: async (files, artistName) => {
    const { canWrite, client, loadLibrary, showToast } = get();
    if (!canWrite) return showToast('Chế độ chỉ nghe.');
    if (!client) return showToast('Chưa cấu hình repository.');
    if (!artistName.trim()) return showToast('Chọn nghệ sĩ để tải bài hát lên.');
    try {
      for (const file of files) {
        await client.pushLocalFile(file.uri, file.name, artistName.trim());
      }
      await loadLibrary();
      showToast(`Đã thêm ${files.length} bài hát lên GitHub.`);
    } catch (error: any) {
      showToast(error.message);
    }
  },
}));
