import { useState } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MotionPressable({ disabled, onPressIn, onPressOut, onHoverIn, onHoverOut, style, ...props }: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const handlePressIn: PressableProps['onPressIn'] = (event) => {
    setPressed(true);
    if (!disabled && !reducedMotion) scale.set(withTiming(0.98, { duration: 120 }));
    onPressIn?.(event);
  };
  const handlePressOut: PressableProps['onPressOut'] = (event) => {
    setPressed(false);
    scale.set(withTiming(1, { duration: reducedMotion ? 0 : 120 }));
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      style={[
        typeof style === 'function' ? style({ pressed: pressed && !disabled, hovered: hovered && !disabled }) : style,
        animatedStyle,
      ]}
    />
  );
}
