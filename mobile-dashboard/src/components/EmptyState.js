import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';

export default function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && typeof onAction === 'function' ? (
        <Pressable onPress={onAction} style={styles.btn}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.cardPadding,
    alignItems: 'center',
  },
  title: { ...typography.headerSm, color: colors.heading, marginBottom: 6 },
  message: { ...typography.body, color: colors.neutralGray, textAlign: 'center' },
  btn: {
    marginTop: 14,
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnText: { color: colors.white, fontWeight: '800' },
});

