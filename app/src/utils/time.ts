export function formatTime(seconds?: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.floor(seconds as number);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Tương đương durationLabel() trong app.js gốc.
export function durationLabel(tracks: { duration?: number }[]) {
  if (!tracks.length) return '0:00';
  if (tracks.some((t) => !Number.isFinite(t.duration))) return 'đang tính thời lượng';
  return formatTime(tracks.reduce((total, t) => total + (t.duration || 0), 0));
}
