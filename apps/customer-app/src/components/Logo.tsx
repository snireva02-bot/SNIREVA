import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '@/lib/theme';

/** Official logo sits on its own dark tile (artwork has a black background). */
export function Logo({ height = 56, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: colors.logoBg, borderRadius: radius, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }, style]}>
      <Image source={require('../../assets/images/logo-wide.png')} accessibilityLabel="SNIREVA"
        style={{ height, width: height * 2, resizeMode: 'contain' }} />
    </View>
  );
}
