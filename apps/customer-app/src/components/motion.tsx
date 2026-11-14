import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { colors } from '@/lib/theme';

/** Motion tokens: short, calm, one rhythm across the app. Respects the system "reduce motion" setting. */
export const motion = {
  enter: 320,
  stagger: 50,
  spring: { damping: 18, stiffness: 220, mass: 0.8 },
};

/** Fades + rises content into place; `index` staggers siblings (capped so long lists don't lag). */
export function Appear({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(motion.enter).delay(Math.min(index, 8) * motion.stagger)
        .easing(Easing.out(Easing.cubic)).withInitialValues({ transform: [{ translateY: 12 }], opacity: 0 })
        .reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}

export function FadeInView({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View style={style} entering={FadeIn.duration(motion.enter).delay(delay).reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}

/** Press feedback: a slight scale-down while pressed (no layout shift). */
export function usePressScale(to = 0.97) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => { scale.value = withTiming(to, { duration: 90, reduceMotion: ReduceMotion.System }); },
    onPressOut: () => { scale.value = withSpring(1, { ...motion.spring, reduceMotion: ReduceMotion.System }); },
  };
}

/** The "peak moment" mark for payment success / agreement signed. */
export function SuccessMark({ size = 88 }: { size?: number }) {
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withDelay(180, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }));
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 0.45 }],
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Success">
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand }, ringStyle]} />
      <Animated.View entering={ZoomIn.springify().damping(12).stiffness(180).reduceMotion(ReduceMotion.System)}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={size * 0.48} color="#fff" strokeWidth={2.5} />
      </Animated.View>
    </View>
  );
}

/** Thin progress bar that animates to `value` (0..1). */
export function ProgressBar({ value, color = colors.brand, track = colors.line, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(150, withTiming(Math.max(0, Math.min(1, value)), { duration: 600, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
  }, [value, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, style]} />
    </View>
  );
}
