import { forwardRef, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View,
  type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, WifiOff, X, type LucideIcon } from 'lucide-react-native';
import type { StatusMeta, Tone } from '@snireva/shared';
import { colors, isWeb, radius, space, touch, type } from '@/lib/theme';

/* ------------------------------------------------------------------ Text */
type Variant = keyof typeof type;
export function Text({ variant = 'body', style, color, ...p }: TextProps & { variant?: Variant; color?: string }) {
  return <RNText {...p} style={[type[variant], color ? { color } : null, style]} maxFontSizeMultiplier={1.6} />;
}

/* ------------------------------------------------------------------ Button */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: BtnVariant;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}
export function Button({ title, variant = 'primary', loading, icon: Icon, disabled, style, compact, ...rest }: ButtonProps) {
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.bad : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        compact && { minHeight: 40, paddingHorizontal: space.md },
        variant === 'primary' && { backgroundColor: pressed ? colors.brandPress : colors.brand, borderColor: 'transparent' },
        variant === 'secondary' && { backgroundColor: pressed ? colors.canvas : colors.surface, borderColor: colors.lineStrong },
        variant === 'ghost' && { backgroundColor: pressed ? colors.canvas : 'transparent', borderColor: 'transparent' },
        variant === 'danger' && { backgroundColor: pressed ? colors.badBg : colors.surface, borderColor: colors.lineStrong },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : Icon ? <Icon size={20} color={fg} strokeWidth={1.75} /> : null}
      <Text variant="bodyMedium" color={fg}>{title}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Input */
interface InputProps extends TextInputProps { label: string; error?: string | null; hint?: string; prefix?: string }
export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input({ label, error, hint, prefix, style, ...p }, ref) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="smallMedium">{label}</Text>
      <View style={[s.input, focus && { borderColor: colors.brand }, !!error && { borderColor: colors.bad }]}>
        {prefix ? <Text variant="body" color={colors.ink2} style={{ marginRight: space.sm }}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          onFocus={(e) => { setFocus(true); p.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
          style={[type.body, { flex: 1, paddingVertical: 0, minHeight: 46 }, isWeb && ({ outlineStyle: 'none' } as object), p.multiline && { minHeight: 96, paddingVertical: space.md, textAlignVertical: 'top' }, style]}
          {...p}
        />
      </View>
      {error ? <Text variant="small" color={colors.bad} accessibilityLiveRegion="polite">{error}</Text>
        : hint ? <Text variant="small">{hint}</Text> : null}
    </View>
  );
});

/* ------------------------------------------------------------------ Card / rows */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, pressed && { backgroundColor: colors.canvas }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ label, value, last, valueStyle }: { label: string; value: ReactNode; last?: boolean; valueStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <Text variant="small">{label}</Text>
      {typeof value === 'string' || typeof value === 'number'
        ? <Text variant="smallMedium" style={[{ flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }, valueStyle]}>{value}</Text>
        : value}
    </View>
  );
}

export function ListItem({ title, subtitle, icon: Icon, right, onPress, last, danger }: {
  title: string; subtitle?: string; icon?: LucideIcon; right?: ReactNode; onPress?: () => void; last?: boolean; danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [s.listItem, !last && s.rowBorder, pressed && { backgroundColor: colors.canvas }]}>
      {Icon ? <View style={s.listIcon}><Icon size={20} color={danger ? colors.bad : colors.ink2} strokeWidth={1.75} /></View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" color={danger ? colors.bad : undefined}>{title}</Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={20} color={colors.muted} strokeWidth={1.75} /> : null)}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Chip */
const toneMap: Record<Tone, { fg: string; bg: string }> = {
  green: { fg: colors.ok, bg: colors.okBg },
  amber: { fg: colors.warn, bg: colors.warnBg },
  red: { fg: colors.bad, bg: colors.badBg },
  grey: { fg: colors.neutral, bg: colors.neutralBg },
};
export function Chip({ meta, tone, label }: { meta?: StatusMeta; tone?: Tone; label?: string }) {
  const t = toneMap[meta?.tone ?? tone ?? 'grey'];
  return (
    <View style={[s.chip, { backgroundColor: t.bg }]} accessibilityLabel={`Status: ${meta?.label ?? label}`}>
      <View style={[s.dot, { backgroundColor: t.fg }]} />
      <Text variant="caption" color={t.fg}>{meta?.label ?? label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ Skeleton / empty / banner */
export function Skeleton({ width = '100%', height = 16, style }: { width?: ViewStyle['width']; height?: number; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View accessibilityElementsHidden style={[{ width, height, borderRadius: 6, backgroundColor: '#E5ECE8', opacity: o }, style]} />;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Icon size={24} color={colors.brand} strokeWidth={1.75} /></View>
      <Text variant="bodyMedium" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text variant="small" style={{ textAlign: 'center', maxWidth: 300 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: space.sm, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Banner({ tone = 'grey', icon: Icon, title, body, action }: {
  tone?: Tone; icon?: LucideIcon; title: string; body?: string; action?: ReactNode;
}) {
  const t = toneMap[tone];
  return (
    <View style={[s.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      {Icon ? <Icon size={20} color={t.fg} strokeWidth={1.75} style={{ marginTop: 2 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="smallMedium" color={t.fg}>{title}</Text>
        {body ? <Text variant="small" color={colors.ink2}>{body}</Text> : null}
        {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
      </View>
    </View>
  );
}

export function OfflineBanner({ offline, text }: { offline: boolean; text: string }) {
  if (!offline) return null;
  return <Banner tone="grey" icon={WifiOff} title={text} />;
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={s.sectionTitle}>
      <Text variant="caption" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{children}</Text>
      {action}
    </View>
  );
}

/* ------------------------------------------------------------------ Screen scaffolding */
export function Header({ title, back = true, right }: { title?: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={s.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [s.headerBtn, pressed && { backgroundColor: colors.canvas }]}>
          <ArrowLeft size={24} color={colors.ink} strokeWidth={1.75} />
        </Pressable>
      ) : <View style={{ width: space.sm }} />}
      <Text variant="title" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

interface ScreenProps extends ScrollViewProps {
  title?: string;
  back?: boolean;
  headerRight?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  children: ReactNode;
  noHeader?: boolean;
  tabScreen?: boolean;
}
/** Safe-area screen with optional header and a pinned bottom action bar. */
export function Screen({ title, back = true, headerRight, footer, scroll = true, children, noHeader, tabScreen, contentContainerStyle, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, contentContainerStyle]} {...rest}>
      {children}
    </ScrollView>
  ) : <View style={[s.content, { flex: 1 }, contentContainerStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={tabScreen ? ['top'] : ['top', 'bottom']} style={s.screen}>
      {!noHeader && <Header title={title} back={back} right={headerRight} />}
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? <View style={[s.footer, { paddingBottom: tabScreen ? space.md : Math.max(space.md, insets.bottom ? 0 : space.md) }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ Option sheet (picker) */
export function OptionSheet<T extends string>({ visible, title, options, value, onSelect, onClose }: {
  visible: boolean; title: string; options: { value: T; label: string; sub?: string }[]; value?: T | null;
  onSelect: (v: T) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <View style={s.sheetHeader}>
          <Text variant="title" style={{ flex: 1 }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.headerBtn} hitSlop={8}>
            <X size={24} color={colors.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 420 }}>
          {options.map((o, i) => (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: value === o.value }}
              onPress={() => { onSelect(o.value); onClose(); }}
              style={({ pressed }) => [s.option, i < options.length - 1 && s.rowBorder, pressed && { backgroundColor: colors.canvas }]}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{o.label}</Text>
                {o.sub ? <Text variant="small">{o.sub}</Text> : null}
              </View>
              {value === o.value ? <Check size={20} color={colors.brand} strokeWidth={2} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Tappable field that opens an OptionSheet. */
export function SelectField<T extends string>({ label, placeholder, value, options, onChange, error }: {
  label: string; placeholder: string; value?: T | null; options: { value: T; label: string; sub?: string }[];
  onChange: (v: T) => void; error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="smallMedium">{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}`} onPress={() => setOpen(true)}
        style={({ pressed }) => [s.input, !!error && { borderColor: colors.bad }, pressed && { backgroundColor: colors.canvas }]}>
        <Text variant="body" color={current ? colors.ink : colors.muted} style={{ flex: 1 }}>{current?.label ?? placeholder}</Text>
        <ChevronRight size={20} color={colors.muted} strokeWidth={1.75} style={{ transform: [{ rotate: '90deg' }] }} />
      </Pressable>
      {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
      <OptionSheet visible={open} title={label} options={options} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs, paddingRight: space.lg },
  headerBtn: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, gap: space.sm },
  btn: { minHeight: touch, borderRadius: radius, borderWidth: 1, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  input: { minHeight: touch, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius, backgroundColor: colors.surface, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: space.lg },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  listItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  listIcon: { width: 24, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 48, height: 48, borderRadius: radius, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -space.sm },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,31,29,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.xs, height: 56, borderBottomWidth: 1, borderBottomColor: colors.line },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
});
