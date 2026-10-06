// Tương đương #toast trong index.html/showToast() trong app.js
import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/ui/Text';
import { useStore } from '@/state/store';
import { colors, radius, spacing } from '@/theme';

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return <Text style={styles.toast}>{toast}</Text>;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    color: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    overflow: 'hidden',
    fontSize: 13,
    zIndex: 50,
  },
});
