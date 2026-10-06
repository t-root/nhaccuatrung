// Màn hình chờ lúc mở app: equalizer chạy + thanh quét + dòng trạng thái kiểu terminal.
// Dùng cùng ngôn ngữ thiết kế với phần còn lại (vuông vức, một màu accent, chữ hoa giãn cách).
import React from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { colors, spacing } from '@/theme';

const STEPS = ['KHỞI TẠO HỆ THỐNG', 'THIẾT LẬP KẾT NỐI', 'ĐỒNG BỘ THƯ VIỆN', 'GIẢI MÃ TÍN HIỆU ÂM THANH'];
const BAR_DURATIONS = [520, 760, 430, 680, 590, 820, 470, 640, 540];
const BAR_MIN = 6;
const BAR_MAX = 46;
const SCAN_WIDTH = 72;

function EqualizerBar({ duration, delay }: { duration: number; delay: number }) {
  const value = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [value, duration, delay]);
  const height = value.interpolate({ inputRange: [0, 1], outputRange: [BAR_MIN, BAR_MAX] });
  return <Animated.View style={[styles.bar, { height }]} />;
}

export function LoadingScreen() {
  const [step, setStep] = React.useState(0);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const scan = React.useRef(new Animated.Value(0)).current;
  const cursor = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1400);
    const scanLoop = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    const cursorLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursor, { toValue: 0, duration: 0, delay: 450, useNativeDriver: true }),
        Animated.timing(cursor, { toValue: 1, duration: 0, delay: 450, useNativeDriver: true }),
      ]),
    );
    scanLoop.start();
    cursorLoop.start();
    return () => {
      clearInterval(timer);
      scanLoop.stop();
      cursorLoop.stop();
    };
  }, [scan, cursor]);

  const translateX = scan.interpolate({ inputRange: [0, 1], outputRange: [-SCAN_WIDTH, trackWidth] });

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>NHẠC CỦA TRUNG</Text>

      <View style={styles.equalizer}>
        {BAR_DURATIONS.map((duration, i) => (
          <EqualizerBar key={i} duration={duration} delay={i * 90} />
        ))}
      </View>

      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.scan, { transform: [{ translateX }] }]} />
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.prompt}>&gt;</Text>
        <Text style={styles.status} numberOfLines={1}>{STEPS[step]}</Text>
        <Animated.View style={{ opacity: cursor }}>
          <Text style={styles.status}>_</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl * 1.5, gap: spacing.lg },
  eyebrow: { color: colors.textMuted, fontSize: 11, letterSpacing: 4 },
  equalizer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 5, height: BAR_MAX },
  bar: { width: 5, backgroundColor: colors.accent },
  track: { alignSelf: 'stretch', maxWidth: 260, width: '100%', height: 2, backgroundColor: colors.border, overflow: 'hidden' },
  scan: { width: SCAN_WIDTH, height: 2, backgroundColor: colors.accent },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 18 },
  prompt: { color: colors.accent, fontSize: 12 },
  status: { color: colors.accent, fontSize: 12, letterSpacing: 2 },
});
