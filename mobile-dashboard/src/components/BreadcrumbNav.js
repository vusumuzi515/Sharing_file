import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, typography } from '../styles/theme';

export default function BreadcrumbNav({ path = 'Home > Departments' }) {
  return <Text style={styles.breadcrumb}>{path}</Text>;
}

const styles = StyleSheet.create({
  breadcrumb: {
    ...typography.small,
    color: colors.neutralGray,
    marginBottom: 14,
  },
});
