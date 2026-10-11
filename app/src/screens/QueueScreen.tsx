// Tương đương #queuePanel trong index.html.
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { formatTime } from '@/utils/time';
import { useStore } from '@/state/store';
import { EmptyState } from '@/components/EmptyState';
import { colors, fonts, radius, spacing } from '@/theme';
import { durationLabel } from '@/utils/time';

export function QueueScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queue = useStore((s) => s.queue);
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);
  const playQueue = useStore((s) => s.playQueue);
  const queueRepeatLimit = useStore((s) => s.queueRepeatLimit);
  const cycleQueueRepeat = useStore((s) => s.cycleQueueRepeat);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>UP NEXT</Text>
          <Text style={styles.heading}>Hàng đợi</Text>
          <Text style={styles.stats}>{queue.length} bài · {durationLabel(queue)}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable hitSlop={8} style={styles.iconButton} onPress={playQueue}>
            <Text style={styles.iconButtonText}>▶</Text>
          </Pressable>
          <Pressable hitSlop={8} style={[styles.iconButton, queueRepeatLimit > 0 && styles.iconButtonActive]} onPress={cycleQueueRepeat}>
            <Text style={[styles.iconButtonText, queueRepeatLimit > 0 && styles.iconButtonTextActive]}>{queueRepeatLimit ? `↻${queueRepeatLimit}` : '↻'}</Text>
          </Pressable>
          <Pressable hitSlop={8} style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Text style={styles.iconButtonText}>×</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={queue}
        keyExtractor={(t, i) => `${t.id}-${i}`}
        ListEmptyComponent={<EmptyState message="Hàng đợi đang trống." />}
        renderItem={({ item }) => {
          const isCurrent = currentTrack?.id === item.id;
          return (
            <Pressable style={[styles.row, isCurrent && styles.rowActive]} onPress={() => playTrack(item)}>
              <Text style={styles.glyph}>{isCurrent && isPlaying ? '♫' : '♪'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {item.artist} · {item.duration ? formatTime(item.duration) : '--:--'}{isCurrent ? ' · đang phát' : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  heading: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 22, marginTop: spacing.xs },
  stats: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  iconButtonText: { color: colors.textMuted, fontSize: 14 },
  iconButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  iconButtonTextActive: { color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  rowActive: { backgroundColor: colors.accentDim, borderRadius: radius.md },
  glyph: { color: colors.accent, fontSize: 16, width: 20, textAlign: 'center' },
  title: { color: colors.text, fontWeight: '600' },
  artist: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
