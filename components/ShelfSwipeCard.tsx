import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getShelfSwipeAction } from '@/lib/bookGesture';
import { colors, radii, spacing, type } from '@/constants/theme';

export default function ShelfSwipeCard({ bookId, disabled, onQuip, onReturn, children }: {
  bookId: string;
  disabled: boolean;
  onQuip: () => void;
  onReturn: () => void;
  children: ReactNode;
}) {
  const translation = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => { translation.set(0); }, [bookId, translation]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translation.get() }] }));
  const returnStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -translation.get() / 60)) }));
  const quipStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, translation.get() / 60)) }));
  const gesture = Gesture.Pan().enabled(!disabled)
    .activeOffsetX([-15, 15]).failOffsetY([-12, 12])
    .onUpdate((event) => { translation.set(Math.max(-120, Math.min(120, event.translationX))); })
    .onEnd((event) => {
      const action = getShelfSwipeAction(event.translationX, event.translationY, event.velocityX, event.velocityY);
      if (action === 'quip') scheduleOnRN(onQuip);
      if (action === 'return') scheduleOnRN(onReturn);
    })
    .onFinalize(() => { translation.set(reducedMotion ? 0 : withSpring(0, { duration: 250 })); });
  return (
    <View style={styles.container}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={styles.hints}>
        <Animated.Text style={[styles.hint, quipStyle]}>QUIP →</Animated.Text>
        <Animated.Text style={[styles.hint, returnStyle]}>← RETURN</Animated.Text>
      </View>
      <GestureDetector gesture={gesture}><Animated.View style={animatedStyle}>{children}</Animated.View></GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: radii.lg },
  hints: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.brandPale },
  hint: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '700' },
});
