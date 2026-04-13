import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';

const logoAsset = require('../../assets/splash-logo.png');

const SLOGAN = "Africa's leading integrated business partner";

function initialsFromUser(user) {
  const raw = String(user?.name || user?.employeeId || '').trim();
  if (!raw) return '·';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return raw.slice(0, 2).toUpperCase();
}

export default function AppHeader() {
  const { user } = useAuth();
  const initials = useMemo(() => initialsFromUser(user), [user]);

  return (
    <View style={styles.wrap}>
      <View style={styles.brand}>
        <Image source={logoAsset} style={styles.logoImg} resizeMode="contain" accessibilityLabel="Inyatsi" />
        <Text style={styles.slogan} numberOfLines={2}>
          {SLOGAN}
        </Text>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.gridGap + 4,
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 12,
  },
  brand: {
    flex: 1,
    minWidth: 0,
  },
  logoImg: {
    width: '100%',
    maxWidth: 260,
    height: 78,
    marginBottom: 10,
  },
  slogan: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.heading,
    letterSpacing: 0.15,
    maxWidth: 300,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    flexShrink: 0,
    shadowColor: colors.primaryBlue,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatarText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
