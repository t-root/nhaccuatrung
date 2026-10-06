// Điều hướng: KHÔNG có tab bar dưới, đúng cấu trúc mobile gốc (một trang cuộn
// duy nhất trong HomeScreen). Hàng đợi và Cài đặt mở dạng modal qua icon,
// giống #queuePanel trượt ra và không có màn "Cài đặt" trong bản gốc (đây là
// bổ sung bắt buộc để nhập token thật, xem README).
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '@/screens/HomeScreen';
import { QueueScreen } from '@/screens/QueueScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { Toast } from '@/components/Toast';

const RootStack = createNativeStackNavigator();

export function RootNavigation() {
  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false, presentation: 'modal' }}>
        <RootStack.Screen name="Home" component={HomeScreen} options={{ presentation: 'card' }} />
        <RootStack.Screen name="Queue" component={QueueScreen} />
        <RootStack.Screen name="Settings" component={SettingsScreen} />
      </RootStack.Navigator>
      <Toast />
    </NavigationContainer>
  );
}
