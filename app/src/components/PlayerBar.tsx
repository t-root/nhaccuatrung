// Tương đương #playerBar trong index.html gốc — thanh player ĐẦY ĐỦ (không phải
// mini-player), nằm ngay trong luồng trang dưới playlist; khi cuộn xuống thì được
// HomeScreen ghim (sticky) ở top màn hình. Bản gốc không có "màn hình phát nhạc
// toàn màn hình" riêng — đây là nơi DUY NHẤT hiển thị điều khiển phát.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import Slider from '@react-native-community/slider';
import { useStore } from '@/state/store';
import { colors, radius, spacing } from '@/theme';
import { formatTime } from '@/utils/time';

export function PlayerBar() {
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const isBuffering = useStore((s) => s.isBuffering);
  const positionSec = useStore((s) => s.positionSec);
  const durationSec = useStore((s) => s.durationSec);
  const togglePlayPause = useStore((s) => s.togglePlayPause);
  const moveQueue = useStore((s) => s.moveQueue);
  const seekTo = useStore((s) => s.seekTo);
  const shuffle = useStore((s) => s.shuffle);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const repeatMode = useStore((s) => s.repeatMode);
  const cycleRepeatMode = useStore((s) => s.cycleRepeatMode);
  const playbackRate = useStore((s) => s.playbackRate);
  const cyclePlaybackRate = useStore((s) => s.cyclePlaybackRate);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const persisted = useStore((s) => s.persisted);

  const liked = currentTrack ? persisted.favorites.includes(currentTrack.id) : false;

  return (
    <View style={[styles.bar, isPlaying && styles.barLive]}>
      <View style={styles.nowPlaying}>
        <View style={[styles.art, isPlaying && styles.artLive]}>
          <Text style={styles.artGlyph}>{isPlaying ? '♫' : '♪'}</Text>
        </View>
        <View style={styles.nowCopy}>
          <Text style={styles.title} numberOfLines={1}>{currentTrack?.title ?? 'Chưa chọn bài hát'}</Text>
          <Text style={styles.artist} numberOfLines={1}>{currentTrack?.artist ?? 'Chọn một bài để bắt đầu'}</Text>
        </View>
        <Pressable hitSlop={10} onPress={() => currentTrack && toggleFavorite(currentTrack.id)}>
          <Text style={[styles.heart, liked && styles.heartActive]}>{liked ? '♥' : '♡'}</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={styles.controls}>
          <Pressable hitSlop={8} onPress={toggleShuffle}>
            <Text style={[styles.control, shuffle && styles.controlActive]}>⤨</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => moveQueue(-1)}>
            <Text style={styles.control}>|◀</Text>
          </Pressable>
          <Pressable style={styles.playButton} onPress={togglePlayPause} disabled={isBuffering}>
            {isBuffering ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.playButtonText}>{isPlaying ? 'Ⅱ' : '▶'}</Text>}
          </Pressable>
          <Pressable hitSlop={8} onPress={() => moveQueue(1)}>
            <Text style={styles.control}>▶|</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={cycleRepeatMode}>
            <Text style={[styles.control, repeatMode === 'one' && styles.controlActive]}>{repeatMode === 'one' ? '↻∞' : '↻'}</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={cyclePlaybackRate}>
            <Text style={[styles.control, styles.speed, playbackRate !== 1 && styles.controlActive]}>{playbackRate}x</Text>
          </Pressable>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.time}>{formatTime(positionSec)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={Math.max(durationSec, 1)}
            value={Math.min(positionSec, durationSec || 0)}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
            onSlidingComplete={seekTo}
          />
          <Text style={styles.time}>{formatTime(durationSec)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(142, 240, 209, 0.32)',
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  barLive: { borderColor: colors.accent },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  art: {
    width: 43,
    height: 43,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artLive: { backgroundColor: colors.accentDim },
  artGlyph: { color: colors.accent, fontSize: 18 },
  nowCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 13, fontWeight: '600' },
  artist: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  heart: { color: colors.textMuted, fontSize: 20, marginLeft: spacing.xs },
  heartActive: { color: colors.accent },
  center: { gap: spacing.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  control: { color: colors.textMuted, fontSize: 14, minWidth: 24, textAlign: 'center' },
  speed: { fontSize: 12, minWidth: 34 },
  controlActive: { color: colors.text, backgroundColor: colors.accent, borderRadius: radius.sm, overflow: 'hidden', paddingHorizontal: 4 },
  playButton: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  playButtonText: { color: colors.accent, fontSize: 13 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  slider: { flex: 1, height: 28 },
  time: { color: colors.textMuted, fontSize: 9, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'center' },
});
