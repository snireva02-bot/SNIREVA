import { Platform, type TextStyle } from 'react-native';

/** SNIREVA tokens (client deck). Light theme only for v1. */
export const colors = {
  brand: '#23915C',
  brandPress: '#1C7A4C',
  ink: '#141F1D',
  ink2: '#45534E',
  muted: '#66756F',
  line: '#DCE6E0',
  lineStrong: '#C5D3CB',
  canvas: '#F2F7F4',
  tint: '#DCF1E6',
  surface: '#FFFFFF',
  ok: '#1A7A4C', okBg: '#DCF1E6',
  warn: '#8A5300', warnBg: '#FCEFD6',
  bad: '#B42318', badBg: '#FBE5E2',
  neutral: '#4F5C57', neutralBg: '#EDF1EF',
  logoBg: '#050505',
} as const;

/** 4/8 spacing scale */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = 8;
export const touch = 48;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** Type scale: display (amounts), title, body, small, caption. */
export const type = {
  display: { fontFamily: font.semibold, fontSize: 32, lineHeight: 40, color: colors.ink, letterSpacing: -0.5, ...tabular },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 28, color: colors.ink, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: colors.ink },
  bodyMedium: { fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: colors.ink },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.ink2 },
  smallMedium: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: colors.ink },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: colors.muted },
} satisfies Record<string, TextStyle>;

export const num = tabular;
export const hairline = 1;
export const isWeb = Platform.OS === 'web';
