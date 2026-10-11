// Wrapper bắt buộc cho <Text>/<TextInput> của react-native. React chỉ áp
// dụng defaultProps khi prop KHÔNG được truyền — vì gần như mọi <Text> trong
// app đều tự truyền `style` riêng, patch `Text.defaultProps.style` ở App.tsx
// không có tác dụng với chúng. Bọc lại ở đây để `fontFamily: fonts.body` LUÔN
// là style đầu tiên trong mảng, style riêng của từng chỗ gọi (kể cả
// fontFamily khác) vẫn được ghi đè lên trên như bình thường.
import React from 'react';
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native';
import { fonts } from '@/theme';

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[{ fontFamily: fonts.body }, style]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={[{ fontFamily: fonts.body }, style]} />;
}
