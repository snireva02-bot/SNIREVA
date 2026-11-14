import { Image, View } from 'react-native';
import { Bike, BatteryCharging } from 'lucide-react-native';
import { formatINR } from '@snireva/shared';
import { supabase, type Tables } from '@/lib/supabase';
import { colors, radius, space } from '@/lib/theme';
import { Text } from './ui';

export const scooterPhoto = (path?: string | null) => (path ? supabase.storage.from('scooters').getPublicUrl(path).data.publicUrl : null);

export function ScooterImage({ path, size = 72 }: { path?: string | null; size?: number }) {
  const url = scooterPhoto(path);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.tint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityLabel="Scooter photo" />
        : <Bike size={size * 0.45} color={colors.brand} strokeWidth={1.5} />}
    </View>
  );
}

export function ScooterSummary({ scooter, rent }: { scooter: Tables<'scooters'>; rent: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
      <ScooterImage path={scooter.photo_paths[0]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium">{scooter.model}</Text>
        <Text variant="caption">{scooter.code}</Text>
        {scooter.battery_details ? (
          <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', marginTop: 2 }}>
            <BatteryCharging size={16} color={colors.ink2} strokeWidth={1.75} />
            <Text variant="small" style={{ flexShrink: 1 }}>{scooter.battery_details}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="bodyMedium" style={{ fontVariant: ['tabular-nums'] }}>{formatINR(rent)}</Text>
        <Text variant="caption">per week</Text>
      </View>
    </View>
  );
}
