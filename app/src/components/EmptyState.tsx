// Tương đương #emptyState trong index.html gốc: khung icon vuông + tiêu đề
// (Space Grotesk) + mô tả nhỏ bên dưới.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { colors, fonts, spacing } from '@/theme';

export function EmptyState({ message, description }: { message: string; description?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Text style={styles.iconGlyph}>♫</Text>
      </View>
      <Text style={styles.title}>{message}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  icon: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconGlyph: { color: colors.accent, fontSize: 24 },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 16, textAlign: 'center' },
  description: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.xs },
});
