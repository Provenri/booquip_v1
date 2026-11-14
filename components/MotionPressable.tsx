import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MotionPressable({ disabled, onPressIn, onPressOut, style, ...props }: PressableProps) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const handlePressIn: PressableProps['onPressIn'] = (event) => {
    if (!disabled && !reducedMotion) scale.set(withTiming(0.98, { duration: 120 }));
    onPressIn?.(event);
  };
  const handlePressOut: PressableProps['onPressOut'] = (event) => {
    scale.set(withTiming(1, { duration: reducedMotion ? 0 : 120 }));
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        animatedStyle,
      ]}
    />
  );
}
