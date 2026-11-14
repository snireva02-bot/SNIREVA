import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { AuthProvider, isProfileComplete, useAuth } from '@/lib/auth';
import { PushRegistration } from '@/lib/push';
import { UpdateBanner } from '@/lib/updates';
import { colors } from '@/lib/theme';
import '@/lib/network';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 7 * 24 * 3600 * 1000, retry: 2, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'online' },
  },
});
// Last known rental / payment state survives restarts and offline use.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'snireva-cache' });

function RootNavigator() {
  const { session, ready, profile, profileLoading } = useAuth();
  const loading = !ready || (session && profileLoading && profile === undefined);

  const segments = useSegments();
  const signedIn = !!session;
  const complete = isProfileComplete(profile);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Send the user to the right area whenever auth / profile state changes.
  useEffect(() => {
    if (loading) return;
    const area = segments[0] as string | undefined;
    if (!signedIn && area !== '(auth)') router.replace('/sign-in');
    else if (signedIn && !complete && area !== 'setup') router.replace('/setup');
    else if (signedIn && complete && (area === '(auth)' || area === 'setup')) router.replace('/');
  }, [loading, signedIn, complete, segments]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !complete}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && complete}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Expo Router error boundary: shown instead of a white screen if a screen crashes. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '600', color: colors.ink }}>Something went wrong</Text>
        <Text style={{ fontSize: 16, color: colors.ink2 }}>Your data is safe. Try again, or close and reopen the app.</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{error.message}</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={{ marginTop: 8, height: 48, borderRadius: 8, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 3600 * 1000 }}>
          <AuthProvider>
            <StatusBar style="dark" />
            <PushRegistration />
            <RootNavigator />
            <UpdateBanner />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
