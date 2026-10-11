// Bảng chọn / tạo playlist nhanh — tương đương #playlistDialog trong index.html gốc.
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/ui/Text';
import { useStore } from '@/state/store';
import { colors, fonts, radius, spacing } from '@/theme';

export function AddToPlaylistSheet({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const persisted = useStore((s) => s.persisted);
  const addToPlaylist = useStore((s) => s.addToPlaylist);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const [name, setName] = React.useState('');

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>Thêm vào playlist</Text>
        <FlatList
          data={persisted.playlists}
          keyExtractor={(p) => p.id}
          style={{ maxHeight: 200 }}
          ListEmptyComponent={<Text style={styles.muted}>Chưa có playlist nào.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.option}
              onPress={() => {
                addToPlaylist(item.id, trackId);
                onClose();
              }}
            >
              <Text style={styles.optionText}>{item.name}</Text>
            </Pressable>
          )}
        />
        <View style={styles.newRow}>
          <TextInput
            style={styles.input}
            placeholder="Tên playlist mới"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <Pressable
            style={styles.createButton}
            onPress={() => {
              if (!name.trim()) return;
              createPlaylist(name, trackId);
              onClose();
            }}
          >
            <Text style={styles.createButtonText}>Tạo</Text>
          </Pressable>
        </View>
        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Đóng</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  title: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 16, marginBottom: spacing.md },
  muted: { color: colors.textMuted, paddingVertical: spacing.md },
  option: { paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  optionText: { color: colors.text },
  newRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  input: { flex: 1, backgroundColor: 'transparent', borderRadius: radius.md, color: colors.text, fontFamily: fonts.body, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
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
});
