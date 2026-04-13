import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../styles/theme';

export function AnimatedPrimaryButton({ label, onPress, icon, style, textStyle }) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to) => {
    Animated.spring(scale, {
      toValue: to,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={() => animate(0.97)} onPressOut={() => animate(1)}>
      <Animated.View style={[styles.primary, style, { transform: [{ scale }] }]}>
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
        <Text style={[styles.primaryText, textStyle]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Gentle idle “breathing” scale plus the same press feedback as AnimatedPrimaryButton.
 */
export function AnimatedPrimaryButtonBreathing({ label, onPress, icon, style, textStyle }) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const breathScale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });

  const animatePress = (to) => {
    Animated.spring(pressScale, {
      toValue: to,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: breathScale }] }}>
      <Pressable onPress={onPress} onPressIn={() => animatePress(0.97)} onPressOut={() => animatePress(1)}>
        <Animated.View style={[styles.primary, style, { transform: [{ scale: pressScale }] }]}>
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
          <Text style={[styles.primaryText, textStyle]}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function AnimatedOutlineButton({ label, onPress, style, textStyle }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to) => {
    Animated.spring(scale, { toValue: to, friction: 5, tension: 120, useNativeDriver: true }).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={() => animate(0.97)} onPressOut={() => animate(1)}>
      <Animated.View style={[styles.outline, style, { transform: [{ scale }] }]}>
        <Text style={[styles.outlineText, textStyle]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primaryBlue,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  iconWrap: { marginRight: 2 },
  outline: {
    borderWidth: 2,
    borderColor: colors.primaryBlue,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  outlineText: {
    color: colors.primaryBlue,
    fontSize: 16,
    fontWeight: '800',
  },
});
