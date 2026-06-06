/**
 * PressableScale — a drop-in replacement for TouchableOpacity that springs the
 * content down slightly while pressed (and optionally fires a light haptic),
 * giving buttons a tactile, physical feel instead of a flat opacity fade.
 *
 * The visual style is applied to the inner Animated.View so the transform never
 * fights the Pressable's hit area.
 */
import { useRef } from 'react';
import {
  Animated, Pressable, PressableProps,
  StyleProp, ViewStyle, GestureResponderEvent,
} from 'react-native';
import { tapLight } from '../lib/haptics';

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale factor while pressed (default 0.96). */
  scaleTo?: number;
  /** Fire a light haptic on press (default false). */
  haptic?: boolean;
}

export function PressableScale({
  children, style, scaleTo = 0.96, haptic = false, onPress, disabled, ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(1)}
      onPress={(e: GestureResponderEvent) => {
        if (haptic) tapLight();
        onPress?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
