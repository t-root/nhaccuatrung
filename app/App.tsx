import React, { useCallback, useEffect } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { RootNavigation } from '@/navigation';
import { useStore } from '@/state/store';
import { colors, fonts } from '@/theme';

// Bản web gốc chỉ dùng đúng 1 font — Square VN (assets/fonts/Square-VN.ttf,
// giống hệt file bên bản web tại nhaccuatrung/fonts/Square-VN.ttf), khai ở
// :root trong styles.css, không có font nào khác. Giữ splash screen cho tới
// khi tải xong để tránh nháy chữ font hệ thống rồi mới đổi sang font thật.
SplashScreen.preventAutoHideAsync().catch(() => {});

// font-family: "Square VN" trên :root của styles.css gốc áp cho toàn trang —
// set một lần ở đây thay vì phải khai fontFamily thủ công trên từng <Text>.
// TextInput không kế thừa từ Text nên phải patch riêng, nếu không các ô nhập
// (tìm kiếm, đổi tên, token...) sẽ rơi về font hệ thống của máy.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [{ fontFamily: fonts.body }, (Text as any).defaultProps.style];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [{ fontFamily: fonts.body }, (TextInput as any).defaultProps.style];

export default function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const [fontsLoaded] = useFonts({
    SquareVN: require('./assets/fonts/Square-VN.ttf'),
  });

  useEffect(() => {
    bootstrap();
  }, []);

  const onLayout = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayout}>
        <StatusBar style="light" />
        <RootNavigation />
      </View>
    </SafeAreaProvider>
  );
}
