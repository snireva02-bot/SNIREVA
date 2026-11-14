import { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Battery, BatteryCharging, Cog, Disc, CircleDot, MessageSquareWarning, HelpCircle, ImagePlus, X, type LucideIcon } from 'lucide-react-native';
import { SERVICE_CATEGORY_LABEL, serviceRequestSchema } from '@snireva/shared';
import { Button, Input, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCurrentRental } from '@/lib/queries';
import { fileName, pickImage, uploadFile, type PickSource } from '@/lib/media';
import { supabase, type Enums } from '@/lib/supabase';
import { colors, radius, space } from '@/lib/theme';

type Cat = Enums<'service_category'>;
const CATS: { value: Cat; icon: LucideIcon }[] = [
  { value: 'battery', icon: Battery }, { value: 'charging', icon: BatteryCharging }, { value: 'motor', icon: Cog },
  { value: 'brakes', icon: Disc }, { value: 'tyres', icon: CircleDot }, { value: 'other', icon: HelpCircle },
];

export default function NewServiceRequest() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const complaint = kind === 'complaint';
  const { profile } = useAuth();
  const rental = useCurrentRental();
  const qc = useQueryClient();
  const [category, setCategory] = useState<Cat | null>(complaint ? 'complaint' : null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ category?: string; description?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  function addPhoto() {
    const go = async (src: PickSource) => {
      try { const uri = await pickImage(src); if (uri) setPhotos((p) => [...p, uri].slice(0, 4)); } catch (e) { Alert.alert('Photo', (e as Error).message); }
    };
    Alert.alert('Add photo', undefined, [
      { text: 'Take photo', onPress: () => go('camera') }, { text: 'Choose from gallery', onPress: () => go('gallery') }, { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function submit() {
    const parsed = serviceRequestSchema.safeParse({ category, description });
    if (!parsed.success) {
      const e: typeof errors = {};
      for (const i of parsed.error.issues) e[i.path[0] as 'category' | 'description'] ??= i.path[0] === 'category' ? 'Choose what the problem is about' : i.message;
      return setErrors(e);
    }
    if (!profile) return;
    setBusy(true); setErrors({});
    try {
      const paths: string[] = [];
      for (const uri of photos) paths.push(await uploadFile('service', `${profile.id}/${fileName('issue')}`, uri));
      const { data, error } = await supabase.from('service_requests').insert({
        user_id: profile.id, rental_id: rental.data?.id ?? null, category: parsed.data.category, description: parsed.data.description, photo_paths: paths,
      }).select('id').single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['service'] });
      router.replace(`/service/${data.id}`);
    } catch (e) {
      setErrors({ form: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={complaint ? 'Raise a complaint' : 'Report a problem'} footer={<Button title="Send" onPress={submit} loading={busy} />}>
      {!complaint ? (
        <View style={{ gap: space.sm }}>
          <Text variant="smallMedium">What's the problem?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {CATS.map(({ value, icon: Icon }) => {
              const on = category === value;
              return (
                <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setCategory(value)}
                  style={({ pressed }) => ({
                    width: '31.5%', minHeight: 80, borderRadius: radius, borderWidth: on ? 2 : 1, borderColor: on ? colors.brand : colors.line,
                    backgroundColor: on ? colors.tint : pressed ? colors.canvas : colors.surface, alignItems: 'center', justifyContent: 'center', gap: space.xs,
                  })}>
                  <Icon size={24} color={on ? colors.brandPress : colors.ink2} strokeWidth={1.75} />
                  <Text variant="smallMedium" color={on ? colors.brandPress : colors.ink}>{SERVICE_CATEGORY_LABEL[value]}</Text>
                </Pressable>
              );
            })}
          </View>
          {errors.category ? <Text variant="small" color={colors.bad}>{errors.category}</Text> : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <MessageSquareWarning size={20} color={colors.ink2} />
          <Text variant="small" style={{ flex: 1 }}>Tell us what went wrong. A manager will read it and get back to you.</Text>
        </View>
      )}
      <Input label="Describe it" value={description} onChangeText={setDescription} multiline error={errors.description}
        placeholder={complaint ? 'What happened, when, and who was involved' : 'e.g. Scooter stops after 10 km even when fully charged'} />
      <View style={{ gap: space.sm }}>
        <Text variant="smallMedium">Photos (optional, up to 4)</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {photos.map((uri) => (
            <View key={uri} style={{ width: 72, height: 72, borderRadius: radius, overflow: 'hidden' }}>
              <Image source={{ uri }} style={{ width: 72, height: 72 }} />
              <Pressable accessibilityLabel="Remove photo" onPress={() => setPhotos((p) => p.filter((x) => x !== uri))} hitSlop={8}
                style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(20,31,29,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {photos.length < 4 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={addPhoto}
              style={{ width: 72, height: 72, borderRadius: radius, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
              <ImagePlus size={24} color={colors.ink2} strokeWidth={1.75} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {errors.form ? <Text variant="small" color={colors.bad}>{errors.form}</Text> : null}
    </Screen>
  );
}
