import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors, radius, space } from './theme';

/**
 * Over-the-air updates (EAS Update). The app checks on launch and whenever it returns to the
 * foreground; a downloaded update is applied on "Restart" or automatically on the next launch.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const checking = useRef(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    const check = async () => {
      if (checking.current || ready) return;
      checking.current = true;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          const f = await Updates.fetchUpdateAsync();
          if (f.isNew) setReady(true);
        }
      } catch {
        // offline or update server unreachable: try again next time
      } finally {
        checking.current = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [ready]);

  if (!ready) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + space.sm, alignItems: 'center', zIndex: 100 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="New version ready. Restart to update."
        onPress={() => Updates.reloadAsync()}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: pressed ? colors.brandPress : colors.ink,
          paddingHorizontal: space.lg, minHeight: 44, borderRadius: radius })}>
        <RefreshCw size={16} color="#fff" />
        <Text variant="smallMedium" color="#fff">New version ready · Tap to restart</Text>
      </Pressable>
    </View>
  );
}
