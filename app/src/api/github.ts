// Cổng gọi GitHub API — chuyển 1:1 logic từ loadLibrary(), pushFilesToGitHub(),
// deleteGitHubFile(), syncPlaylistToGitHub(), renameArtist()... trong app.js gốc.
// Khác biệt duy nhất so với bản web: TOKEN không còn viết cứng trong code.
// Người dùng tự nhập token (Cài đặt -> Quyền chỉnh sửa) và token được lưu bằng
// expo-secure-store, không nằm trong bundle app nộp lên store hay commit vào git.

import * as FileSystem from 'expo-file-system';
import type { Playlist, RepoInfo, Track } from '@/types';

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']);

function getExtension(path: string) {
  return `.${path.split('.').pop()!.toLowerCase()}`;
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function uid(text: string) {
  return text.startsWith('local:') ? text : `repo:${text}`;
}

function authHeaders(token?: string | null) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export class GitHubClient {
  repo: RepoInfo;
  branch = 'main';
  token: string | null;

  constructor(repo: RepoInfo, token: string | null) {
    this.repo = repo;
    this.token = token;
  }

  private contentsEndpoint(path: string) {
    return `https://api.github.com/repos/${this.repo.owner}/${this.repo.name}/contents/${encodePath(path)}`;
  }

  // Tương đương loadLibrary(): đọc cây file (git trees API), lọc file nhạc
  // trong artist/<tên>/..., và đọc playlist/<tên>/playlist.json
  async loadLibrary(): Promise<{ tracks: Track[]; playlists: Array<{ name: string; tracks: string[] }> }> {
    const headers = authHeaders(this.token);
    const repoRes = await fetch(`https://api.github.com/repos/${this.repo.owner}/${this.repo.name}`, { headers });
    if (!repoRes.ok) {
      if (repoRes.status === 403) throw new Error('GitHub API từ chối truy cập hoặc đã hết rate limit.');
      if (repoRes.status === 404) throw new Error('Không tìm thấy repository GitHub.');
      throw new Error('GitHub API unavailable');
    }
    const repository = await repoRes.json();
    this.branch = repository.default_branch;

    const treeRes = await fetch(
      `https://api.github.com/repos/${this.repo.owner}/${this.repo.name}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`,
      { headers }
    );
    if (!treeRes.ok) {
      if (treeRes.status === 403) throw new Error('GitHub API từ chối truy cập hoặc đã hết rate limit.');
      throw new Error('GitHub API unavailable');
    }
    const tree = await treeRes.json();

    const tracks: Track[] = (tree.tree as any[])
      .filter((item) => item.type === 'blob' && /^artist\/[^/]+\/.+$/i.test(item.path) && AUDIO_EXT.has(getExtension(item.path)))
      .map((item) => {
        const parts = item.path.split('/');
        const artist = parts[0].toLowerCase() === 'artist' && parts.length > 2 ? parts[1] : parts[0] || 'Nhạc gốc';
        const title = parts[parts.length - 1].replace(/\.[^.]+$/, '');
        const src = `https://raw.githubusercontent.com/${this.repo.owner}/${this.repo.name}/${this.branch}/${encodePath(item.path)}`;
        return {
          id: uid(item.path),
          title,
          artist,
          path: item.path,
          sha: item.sha,
          src,
          local: false,
        } as Track;
      });

    const playlistFiles = (tree.tree as any[]).filter(
      (item) => item.type === 'blob' && /^playlist\/[^/]+\/playlist\.json$/i.test(item.path)
    );
    const remotePlaylists = await Promise.all(
      playlistFiles.map(async (item) => {
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${this.repo.owner}/${this.repo.name}/${this.branch}/${encodePath(item.path)}`);
          return await res.json();
        } catch {
          return null;
        }
      })
    );

    return { tracks, playlists: remotePlaylists.filter(Boolean) as Array<{ name: string; tracks: string[] }> };
  }

  // Đọc thẳng playlist.json mới nhất (dùng Contents API để né cache CDN của raw.githubusercontent.com)
  async fetchPlaylistFile(name: string): Promise<{ name: string; tracks: string[] } | null> {
    const safeName = name.replace(/[<>:"/\\|?*]/g, '-').trim();
    const path = `playlist/${safeName}/playlist.json`;
    const headers = authHeaders(this.token);
    const res = await fetch(
      `${this.contentsEndpoint(path)}?ref=${encodeURIComponent(this.branch)}&t=${Date.now()}`,
      { headers, cache: 'no-store' as RequestCache }
    );
    if (!res.ok) return null;
    const file = await res.json();
    const json = decodeURIComponent(escape(globalThis.atob(String(file.content).replace(/\n/g, ''))));
    return JSON.parse(json);
  }

  requireToken() {
    if (!this.token) throw new Error('Chưa cấu hình quyền GitHub để chỉnh sửa. Vào Cài đặt để nhập token.');
    return this.token;
  }

  async deleteFile(path: string, message: string) {
    const token = this.requireToken();
    const headers = authHeaders(token);
    const endpoint = this.contentsEndpoint(path);
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(this.branch)}`, { headers });
    if (!existing.ok) throw new Error('Không tìm thấy file trên GitHub.');
    const { sha } = await existing.json();
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: this.branch }),
    });
    if (!res.ok) throw new Error('GitHub từ chối xóa file.');
  }

  async deleteTrackFile(track: Track) {
    return this.deleteFile(track.path, `Delete music: ${track.path}`);
  }

  // Tải 1 file local (đã chọn từ document-picker) lên artist/<artistName>/<fileName>
  async pushLocalFile(localUri: string, fileName: string, artistName: string) {
    const token = this.requireToken();
    const headers = authHeaders(token);
    const path = `artist/${artistName}/${fileName}`.split('/').filter(Boolean).join('/');
    const endpoint = this.contentsEndpoint(path);
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(this.branch)}`, { headers });
    let sha: string | undefined;
    if (existing.ok) sha = (await existing.json()).sha;
    else if (existing.status !== 404) throw new Error(`Không kiểm tra được file ${fileName}.`);

    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    const body: Record<string, unknown> = { message: `Add music: ${path}`, content: base64, branch: this.branch };
    if (sha) body.sha = sha;
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub từ chối ${fileName}. Kiểm tra token và quyền Contents.`);
  }

  async syncPlaylist(playlist: Playlist, tracks: Track[]) {
    const token = this.requireToken();
    const headers = authHeaders(token);
    const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '-').trim();
    const path = `playlist/${safeName}/playlist.json`;
    const content = JSON.stringify(
      { name: playlist.name, tracks: playlist.trackIds.map((id) => tracks.find((t) => t.id === id)?.path).filter(Boolean) },
      null,
      2
    );
    const endpoint = this.contentsEndpoint(path);
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(this.branch)}`, { headers });
    let sha: string | undefined;
    if (existing.ok) sha = (await existing.json()).sha;
    else if (existing.status !== 404) throw new Error('GitHub không cho đọc playlist.');
    const body: Record<string, unknown> = {
      message: `Update playlist: ${playlist.name}`,
      content: globalThis.btoa(unescape(encodeURIComponent(content))),
      branch: this.branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('GitHub từ chối lưu playlist.');
  }

  async deletePlaylistRemote(playlist: Playlist) {
    const token = this.requireToken();
    const headers = authHeaders(token);
    const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '-').trim();
    const path = `playlist/${safeName}/playlist.json`;
    const endpoint = this.contentsEndpoint(path);
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(this.branch)}`, { headers });
    if (existing.status === 404) return;
    if (!existing.ok) throw new Error('Không đọc được playlist trên GitHub.');
    const { sha } = await existing.json();
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Delete playlist: ${playlist.name}`, sha, branch: this.branch }),
    });
    if (!res.ok) throw new Error('GitHub từ chối xóa playlist.');
  }

  // Đổi tên nghệ sĩ = đọc blob từng file, tạo file mới ở đường dẫn mới, xóa file cũ
  async renameArtist(oldName: string, newName: string, tracks: Track[]) {
    const token = this.requireToken();
    const headers = authHeaders(token);
    const artistTracks = tracks.filter((t) => t.artist === oldName);
    if (!artistTracks.length) throw new Error('Nghệ sĩ này không có file nhạc.');
    for (const track of artistTracks) {
      const relativePath = track.path.split('/').slice(2).join('/');
      const oldPath = track.path;
      const newPath = `artist/${newName}/${relativePath}`;
      const oldEndpoint = this.contentsEndpoint(oldPath);
      const newEndpoint = this.contentsEndpoint(newPath);

      let source: { sha?: string; content?: string };
      if (track.sha) {
        const blobRes = await fetch(
          `https://api.github.com/repos/${this.repo.owner}/${this.repo.name}/git/blobs/${encodeURIComponent(track.sha)}`,
          { headers }
        );
        if (!blobRes.ok) throw new Error(`Không đọc được file ${relativePath}.`);
        const blob = await blobRes.json();
        source = { sha: track.sha, content: blob.content };
      } else {
        const res = await fetch(`${oldEndpoint}?ref=${encodeURIComponent(this.branch)}`, { headers });
        if (!res.ok) throw new Error(`Không đọc được file ${relativePath}.`);
        source = await res.json();
      }

      const destRes = await fetch(`${newEndpoint}?ref=${encodeURIComponent(this.branch)}`, { headers });
      if (destRes.ok) throw new Error(`File đích đã tồn tại: ${newPath}.`);

      const putRes = await fetch(newEndpoint, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Rename artist: ${oldName} to ${newName}`,
          content: String(source.content || '').replace(/\s/g, ''),
          branch: this.branch,
        }),
      });
      if (!putRes.ok) throw new Error(`Không tạo được file mới: ${newPath}.`);

      const delRes = await fetch(oldEndpoint, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Rename artist: ${oldName} to ${newName}`, sha: source.sha, branch: this.branch }),
      });
      if (!delRes.ok) throw new Error(`Đã tạo file mới nhưng chưa xóa được ${oldPath}.`);
    }
  }
}

// Tương đương getGitHubRepo() trong bản web, nhưng ở app native không có location.hostname,
// nên repo được cấu hình thủ công trong Cài đặt (owner/name) thay vì suy ra từ URL github.io.
export function parseRepoInput(text: string): RepoInfo | null {
  const trimmed = text.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const [owner, name] = trimmed.split('/').filter(Boolean);
  if (!owner || !name) return null;
  return { owner, name };
}
