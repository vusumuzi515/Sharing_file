import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';

/**
 * Stack: back + title. Tab: title + optional right action (no back).
 */
export default function ScreenHeader({
  navigation,
  title,
  subtitle,
  showBack = true,
  right,
  onBack,
}) {
  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigation?.navigate?.('MainTabs', { screen: 'Home' });
  };

  return (
    <View style={styles.wrap}>
      {showBack ? (
        <Pressable onPress={handleBack} style={styles.backHit} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.backPlaceholder} />
      )}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightSlot}>{right || <View style={styles.rightPlaceholder} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.cardPadding,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 52,
  },
  backHit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    marginLeft: -4,
  },
  backIcon: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.primaryBlue,
    marginTop: -2,
    marginRight: 2,
  },
  backLabel: {
    ...typography.body,
    color: colors.primaryBlue,
    fontWeight: '700',
  },
  backPlaceholder: { width: 72 },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  title: {
    ...typography.headerSm,
    color: colors.heading,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.small,
    color: colors.neutralGray,
    marginTop: 2,
    textAlign: 'center',
  },
  rightSlot: { minWidth: 72, alignItems: 'flex-end' },
  rightPlaceholder: { width: 8, height: 8 },
});
