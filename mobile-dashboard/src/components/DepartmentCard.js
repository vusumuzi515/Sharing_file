import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, folderIconColors } from '../styles/theme';

const iconByType = {
  engineering: '⚙️',
  finance: '📊',
  hr: '🔒',
  procurement: '✅',
};

export default function DepartmentCard({ department }) {
  const locked = !department.accessGranted;
  const folderColor = folderIconColors[department.iconType] || colors.neutralGray;

  return (
    <View style={[styles.card, locked && styles.lockedCard]}>
      <View style={[styles.iconWrap, { backgroundColor: department.bgColor }]}>
        <Text style={[styles.icon, { color: folderColor }]}>📁</Text>
        <Text style={styles.cornerIcon}>{iconByType[department.iconType] || '•'}</Text>
      </View>

      <Text style={styles.title}>{department.name}</Text>
      <Text style={[styles.access, locked ? styles.accessDenied : styles.accessGranted]}>
        {locked ? 'Access Restricted' : '✓ Access Granted'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.cardPadding,
    minHeight: 130,
  },
  lockedCard: {
    opacity: 0.78,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  icon: {
    fontSize: 20,
  },
  cornerIcon: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    fontSize: 14,
  },
  title: {
    ...typography.body,
    color: colors.heading,
    marginBottom: 5,
  },
  access: {
    ...typography.small,
  },
  accessGranted: {
    color: colors.successGreen,
  },
  accessDenied: {
    color: colors.neutralGray,
  },
});
