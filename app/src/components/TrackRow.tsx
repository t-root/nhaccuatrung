// Tương đương renderTracks() trong app.js: mỗi bài hát là 1 hàng, có nút
// phát / yêu thích / thêm vào hàng đợi / thêm vào playlist / xóa.
// Bố cục theo đúng .track-row ở @media max-width:640px của styles.css gốc:
// hàng 1 = index + art/tên + thời lượng, hàng action xuống HÀNG RIÊNG bên dưới
// (không chen cùng hàng với tên bài, để có vùng chạm đủ lớn trên di động).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { colors, fonts, radius, spacing } from '@/theme';
import { formatTime } from '@/utils/time';
import type { Track } from '@/types';

export function TrackRow({
  track,
  index,
  isPlaying,
  isCurrent,
  liked,
  inPlaylistView,
  onPlay,
  onFavorite,
  onQueue,
  onAddToPlaylist,
  onRemove,
}: {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrent: boolean;
  liked: boolean;
  inPlaylistView: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onQueue: () => void;
  onAddToPlaylist: () => void;
  onRemove: () => void;
}) {
  return (
    <Pressable style={[styles.row, isCurrent && styles.rowActive]} onPress={onPlay}>
      <View style={styles.topRow}>
        <Text style={[styles.index, isCurrent && styles.indexActive]}>{isCurrent && isPlaying ? '♫' : String(index + 1).padStart(2, '0')}</Text>
        <View style={styles.art}>
          <Text style={styles.artGlyph}>{isCurrent ? '♫' : '♪'}</Text>
        </View>
        <View style={styles.main}>
          <Text style={[styles.title, isCurrent && styles.titleActive]} numberOfLines={2}>{track.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{track.artist}{track.local ? ' · đã tải lên' : ''}</Text>
        </View>
        <Text style={styles.duration}>{track.duration ? formatTime(track.duration) : '--:--'}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable hitSlop={8} style={styles.actionButton} onPress={onFavorite}>
          <Text style={[styles.icon, liked && styles.iconActive]}>{liked ? '♥' : '♡'}</Text>
        </Pressable>
        <Pressable hitSlop={8} style={styles.actionButton} onPress={onQueue}>
          <Text style={styles.icon}>≡+</Text>
        </Pressable>
        <Pressable hitSlop={8} style={styles.actionButton} onPress={onAddToPlaylist}>
          <Text style={styles.icon}>+</Text>
        </Pressable>
        <Pressable hitSlop={8} style={styles.actionButton} onPress={onRemove}>
          {/* Ký tự ×/− để nút xóa theo màu chủ đề, không dùng emoji 🗑 (emoji tự đổi màu, không ăn theme) — xem comment gốc trong styles.css */}
          <Text style={[styles.icon, styles.iconDanger]}>{inPlaylistView ? '−' : '×'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rowActive: { backgroundColor: colors.accentDim, borderTopColor: colors.accent },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  index: { width: 22, color: colors.textMuted, fontVariant: ['tabular-nums'], fontSize: 11 },
  indexActive: { color: colors.accent },
  art: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: { color: colors.accent, fontSize: 15 },
  main: { flex: 1 },
  title: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 },
  titleActive: { color: colors.accent },
  artist: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  duration: { color: colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs },
  actionButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { color: colors.textMuted, fontSize: 14 },
  iconActive: { color: colors.accent },
  iconDanger: { color: colors.textMuted },
});
