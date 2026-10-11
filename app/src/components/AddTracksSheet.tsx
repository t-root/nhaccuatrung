// Tương đương #addTracksDialog trong index.html gốc: thêm nhiều bài hát cùng lúc
// vào playlist đang mở, có bộ lọc theo tất cả/nghệ sĩ/gần đây/yêu thích.
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useStore } from '@/state/store';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Track } from '@/types';

type AddTrackFilter = 'all' | 'artist' | 'recent' | 'favorites';

export function AddTracksSheet({ playlistId, onClose }: { playlistId: string; onClose: () => void }) {
  const tracks = useStore((s) => s.tracks);
  const persisted = useStore((s) => s.persisted);
  const artists = useStore((s) => s.artists)();
  const addManyToPlaylist = useStore((s) => s.addManyToPlaylist);
  const [filter, setFilter] = React.useState<AddTrackFilter>('all');
  const [artistFilter, setArtistFilter] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);

  const playlist = persisted.playlists.find((p) => p.id === playlistId);
  let candidates = tracks.filter((t) => !persisted.hidden.includes(t.id) && !playlist?.trackIds.includes(t.id));
  if (filter === 'recent') candidates = persisted.recent.map((id) => candidates.find((t) => t.id === id)).filter(Boolean) as Track[];
  if (filter === 'favorites') candidates = candidates.filter((t) => persisted.favorites.includes(t.id));
  if (filter === 'artist' && artistFilter) candidates = candidates.filter((t) => t.artist === artistFilter);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, { maxHeight: '80%' }]}>
        <Text style={styles.title}>Thêm bài hát</Text>
        <View style={styles.filterRow}>
          {(['all', 'artist', 'recent', 'favorites'] as AddTrackFilter[]).map((f) => (
            <Pressable key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {{ all: 'Tất cả', artist: 'Nghệ sĩ', recent: 'Gần đây', favorites: 'Yêu thích' }[f]}
              </Text>
            </Pressable>
          ))}
        </View>
        {filter === 'artist' && (
          <FlatList
            horizontal
            data={artists}
            keyExtractor={(a) => a}
            style={{ marginBottom: spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.filterChip, artistFilter === item && styles.filterChipActive]}
                onPress={() => setArtistFilter(item)}
              >
                <Text style={[styles.filterChipText, artistFilter === item && styles.filterChipTextActive]}>{item}</Text>
              </Pressable>
            )}
          />
        )}
        <FlatList
          data={candidates}
          keyExtractor={(t) => t.id}
          style={{ maxHeight: 320 }}
          ListEmptyComponent={<Text style={styles.muted}>Không còn bài hát phù hợp để thêm.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.option} onPress={() => toggle(item.id)}>
              <View style={[styles.checkbox, selected.includes(item.id) && styles.checkboxChecked]}>
                {selected.includes(item.id) && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.optionText} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.optionArtist} numberOfLines={1}>{item.artist}</Text>
              </View>
            </Pressable>
          )}
        />
        <View style={styles.newRow}>
          <Pressable onPress={onClose} style={[styles.cancel, { flex: 1 }]}>
            <Text style={styles.cancelText}>Hủy</Text>
          </Pressable>
          <Pressable
            style={styles.createButton}
            onPress={() => {
              if (!selected.length) return;
              addManyToPlaylist(playlistId, selected);
              onClose();
            }}
          >
            <Text style={styles.createButtonText}>Thêm đã chọn ({selected.length})</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  title: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 16, marginBottom: spacing.md },
  muted: { color: colors.textMuted, paddingVertical: spacing.md },
  newRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  createButton: {
    backgroundColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  createButtonText: { color: colors.accent, fontWeight: '700' },
  cancel: { marginTop: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.textMuted },
  filterRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  filterChipActive: { borderColor: colors.accent },
  filterChipText: { color: colors.textMuted, fontSize: 11 },
  filterChipTextActive: { color: colors.accent, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  optionText: { color: colors.text },
  optionArtist: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  checkboxMark: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
