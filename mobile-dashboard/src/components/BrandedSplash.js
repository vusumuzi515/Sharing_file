import React from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';

/** Same file as Expo `icon` / `splash.image`: `./assets/splash-logo.png` (project root). */
const logo = require('../../assets/splash-logo.png');

/**
 * Rare fallback while reading AsyncStorage (usually under 100ms).
 * Native splash is hidden from App.js so this is not stuck behind Expo Go bundling UI.
 */
export default function BrandedSplash() {
  return (
    <View style={styles.root}>
      <View style={styles.square}>
        <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="Inyatsi" />
      </View>
      <Text style={styles.title}>INYATSI Department Files</Text>
      <ActivityIndicator style={styles.spinner} color="#0052CC" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  square: {
    width: 132,
    height: 132,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginTop: 22,
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 28,
  },
});
