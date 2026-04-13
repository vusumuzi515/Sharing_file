import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, fileIconColors } from '../styles/theme';

const fileTypeStyles = {
  DOCX: { color: fileIconColors.word, bg: '#dbeafe', icon: '📝' },
  PDF: { color: fileIconColors.pdf, bg: '#fee2e2', icon: '📕' },
  PPT: { color: fileIconColors.powerpoint, bg: '#ffedd5', icon: '📙' },
  XLSX: { color: fileIconColors.excel, bg: '#dcfce7', icon: '📗' },
};

export default function QuickFileItem({ file }) {
  const style = fileTypeStyles[file.type] || fileTypeStyles.DOCX;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.iconWrap, { backgroundColor: style.bg }]}>
          <Text style={styles.icon}>{style.icon}</Text>
        </View>
        <Text style={styles.name}>{file.name}</Text>
      </View>
      <Text style={[styles.type, { color: style.color }]}>{file.type}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  icon: {
    fontSize: 17,
  },
  name: {
    ...typography.body,
    color: colors.heading,
    flexShrink: 1,
  },
  type: {
    ...typography.small,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
