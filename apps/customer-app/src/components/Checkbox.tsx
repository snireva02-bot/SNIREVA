import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, space } from '@/lib/theme';
import { Text } from './ui';
import type { ReactNode } from 'react';

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: 48, paddingVertical: space.xs }}>
      <View style={{
        width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, marginTop: 1,
        borderColor: checked ? colors.brand : colors.lineStrong, backgroundColor: checked ? colors.brand : colors.surface,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {checked ? <Check size={16} color="#fff" strokeWidth={2.5} /> : null}
      </View>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text variant="small">{children}</Text> : children}</View>
    </Pressable>
  );
}
