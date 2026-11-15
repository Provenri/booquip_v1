import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_700Bold } from '@expo-google-fonts/newsreader/700Bold';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_400Regular,
    Newsreader_700Bold,
  });
  useEffect(() => {
    if (fontError) console.warn('Editorial fonts could not be loaded:', fontError);
  }, [fontError]);
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}