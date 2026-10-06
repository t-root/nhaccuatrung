// Tương đương #confirmDialog trong index.html gốc. KHÔNG dùng Alert.alert của
// RN vì hộp thoại hệ điều hành luôn hiển thị bằng font hệ thống của máy, không
// thể đổi sang SquareVN — toàn bộ chữ trong app phải dùng đúng 1 font này.
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { colors, fonts, spacing } from '@/theme';

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>CONFIRM ACTION</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {/* Đúng .secondary-button (Hủy) + .primary-button (Xác nhận) trong #confirmDialog gốc —
                bản gốc KHÔNG có biến thể màu đỏ cho hành động xóa, chỉ có đúng 1 màu nhấn (coral/mint). */}
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 360, padding: spacing.xl, borderWidth: 1, borderColor: colors.accent, backgroundColor: '#0b1014' },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 20, textTransform: 'uppercase', marginBottom: spacing.sm },
  message: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm },
  cancelButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.textMuted, fontWeight: '600' },
  confirmButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  confirmText: { color: colors.accent, fontWeight: '700' },
});
