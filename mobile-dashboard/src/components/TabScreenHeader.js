import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';

/** Top bar for main tab screens (no back). */
export default function TabScreenHeader({ title, right }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : <View style={styles.rightSpacer} />}
    </View>
  );
}

export function HeaderIconButton({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn} hitSlop={8}>
      <Text style={styles.iconBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.cardPadding,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    ...typography.headerMd,
    color: colors.heading,
    fontWeight: '800',
  },
  right: {},
  rightSpacer: { width: 72 },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.lightGrayBackground,
  },
  iconBtnText: {
    ...typography.small,
    color: colors.primaryBlue,
    fontWeight: '800',
  },
});
