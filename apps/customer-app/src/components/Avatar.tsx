import { useQuery } from '@tanstack/react-query';
import { Image, View } from 'react-native';
import { User } from 'lucide-react-native';
import { signedUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Text } from './ui';

export function Avatar({ path, localUri, name, size = 56 }: { path?: string | null; localUri?: string | null; name?: string | null; size?: number }) {
  const { data: url } = useQuery({ queryKey: ['signed', 'avatars', path], enabled: !!path && !localUri, queryFn: () => signedUrl('avatars', path), staleTime: 45 * 60 * 1000 });
  const src = localUri ?? url;
  const initials = (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
      {src ? <Image source={{ uri: src }} style={{ width: size, height: size }} accessibilityLabel="Profile photo" />
        : initials ? <Text variant="bodyMedium" color={colors.brandPress}>{initials}</Text>
        : <User size={size / 2.2} color={colors.brand} strokeWidth={1.75} />}
    </View>
  );
}
