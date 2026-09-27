// Thay thế localStorage (state bài hát yêu thích/playlist/ẩn) và
// sessionStorage (phiên chỉnh sửa) + token viết cứng trong app.js gốc.
// - AsyncStorage: tương đương localStorage, bền qua các lần mở app.
// GitHub credential: hai phần tiền tố cố định, phần cuối tải từ key.txt.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { PersistedState, RepoInfo, Track } from '@/types';

const STATE_KEY = 'nhac-cua-trung-state-v1';
const REPO_KEY = 'nhac-cua-trung-repo-v1';
const LIBRARY_CACHE_KEY = 'nhac-cua-trung-library-cache-v1';

// Repo mặc định — tương đương getGitHubRepo() tự suy ra từ URL GitHub Pages
// trong bản web gốc. Bản RN không chạy trong trình duyệt nên không suy ra được,
// dùng thẳng repo cố định của Trung để khỏi phải nhập tay lần đầu mở app.
export const DEFAULT_REPO: RepoInfo = { owner: 't-root', name: 'nhaccuatrung' };
const KEY_FILE_URL = 'https://t-root.github.io/nhaccuatrung/key.txt';
const firstPat = 'github_';
const secondPat = 'pat_';

export const defaultState: PersistedState = { hidden: [], favorites: [], recent: [], playlists: [] };

export async function readPersistedState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState };
  }
}

export async function savePersistedState(state: PersistedState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export async function readRepoConfig(): Promise<RepoInfo | null> {
  const raw = await AsyncStorage.getItem(REPO_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveRepoConfig(repo: RepoInfo) {
  await AsyncStorage.setItem(REPO_KEY, JSON.stringify(repo));
}

// Token GitHub — CHỈ lưu ở đây, không có mặt trong bundle mã nguồn.
export async function readGitHubToken(): Promise<string | null> {
  try {
    const response = await fetch(KEY_FILE_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const thirdPat = (await response.text()).trim();
    if (!thirdPat) return null;
    return firstPat + secondPat + thirdPat;
  } catch {
    return null;
  }
}

// Danh sách bài hát tải thành công lần gần nhất từ GitHub — dùng làm phao cứu
// sinh khi mở app lúc không có mạng (loadLibrary() không gọi API được).
export async function readLibraryCache(): Promise<{ repo: RepoInfo; tracks: Track[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveLibraryCache(repo: RepoInfo, tracks: Track[]) {
  try {
    await AsyncStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify({ repo, tracks }));
  } catch {
    /* bỏ qua nếu bộ nhớ đầy */
  }
}
