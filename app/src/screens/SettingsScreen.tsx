// Thay thế #accessDialog (mật khẩu md5 cứng trong app.js gốc) bằng màn hình
// Cài đặt repository và các tùy chọn ứng dụng.
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { useStore } from '@/state/store';
import { colors, fonts, radius, spacing } from '@/theme';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const repo = useStore((s) => s.repo);
  const token = useStore((s) => s.token);
  const canWrite = useStore((s) => s.canWrite);
  const setCanWrite = useStore((s) => s.setCanWrite);
  const setRepoFromInput = useStore((s) => s.setRepoFromInput);
  const uploadLocalFiles = useStore((s) => s.uploadLocalFiles);
  const artists = useStore((s) => s.artists)();
  const showToast = useStore((s) => s.showToast);

  const [repoInput, setRepoInput] = useState(repo ? `${repo.owner}/${repo.name}` : '');
  const [uploadArtist, setUploadArtist] = useState('');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl * 2 }}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Cài đặt</Text>
        <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
          <Text style={styles.closeIcon}>×</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Repository GitHub</Text>
      <Text style={styles.hint}>Dạng owner/repo, ví dụ: trannguyen/nhaccuatrung. Repo phải chứa thư mục artist/&lt;tên nghệ sĩ&gt;/*.mp3</Text>
      <TextInput
        style={styles.input}
        value={repoInput}
        onChangeText={setRepoInput}
        placeholder="owner/repo"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
      <Pressable style={styles.primaryButton} onPress={() => setRepoFromInput(repoInput)}>
        <Text style={styles.primaryButtonText}>Lưu & tải thư viện</Text>
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Quyền chỉnh sửa</Text>
        <Switch value={canWrite} onValueChange={setCanWrite} disabled={!token} />
      </View>
      <Text style={styles.hint}>{token ? 'Đã tự tải khóa — bật/tắt để chuyển giữa chế độ chỉ nghe và chỉnh sửa.' : 'Không tải được khóa — app đang ở chế độ chỉ nghe.'}</Text>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Tải bài hát lên (cần quyền ghi)</Text>
      <TextInput
        style={styles.input}
        value={uploadArtist}
        onChangeText={setUploadArtist}
        placeholder="Tên thư mục nghệ sĩ (artist/<tên>/)"
        placeholderTextColor={colors.textMuted}
      />
      {artists.length > 0 && (
        <FlatList
          horizontal
          data={artists}
          keyExtractor={(a) => a}
          style={{ marginBottom: spacing.sm }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable style={styles.artistChip} onPress={() => setUploadArtist(item)}>
              <Text style={styles.artistChipText}>{item}</Text>
            </Pressable>
          )}
        />
      )}
      <Pressable
        style={styles.secondaryButton}
        onPress={async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: 'audio/*',
            multiple: true,
            copyToCacheDirectory: true,
          });
          if (result.canceled) return;
          const files = result.assets.map((a) => ({ uri: a.uri, name: a.name }));
          uploadLocalFiles(files, uploadArtist);
        }}
      >
        <Text style={styles.secondaryButtonText}>Chọn file nhạc để tải lên GitHub</Text>
      </Pressable>

      <View style={styles.divider} />
      <Text style={styles.warning}>
        Lưu ý bản quyền: đây là thư viện nhạc cá nhân. Nếu repo chứa mp3 có bản quyền thương mại, chỉ nên dùng
        riêng cho bạn, không công khai/phân phối app này.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  heading: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 22 },
  closeIcon: { color: colors.textMuted, fontSize: 26 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, lineHeight: 18 },
  input: {
    backgroundColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: { color: colors.accent, fontWeight: '700' },
  secondaryButton: { backgroundColor: 'transparent', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: 'center' },
  secondaryButtonText: { color: colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  rowLabel: { color: colors.text },
  dangerText: { color: colors.danger, marginTop: spacing.sm },
  artistChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  artistChipText: { color: colors.text, fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  warning: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
