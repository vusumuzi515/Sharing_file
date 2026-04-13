import React from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FINISHED_PROJECTS } from '../data/finishedProjects';
import { colors, spacing, typography } from '../styles/theme';

export default function FinishedProjectsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={FINISHED_PROJECTS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={item.image} style={styles.thumb} resizeMode="cover" accessibilityLabel={item.title} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardCaption}>{item.caption}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.lightGrayBackground,
  },
  list: {
    paddingHorizontal: spacing.cardPadding,
    paddingBottom: 28,
    paddingTop: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  thumb: {
    width: '100%',
    height: 200,
    backgroundColor: '#e2e8f0',
  },
  cardBody: {
    padding: spacing.cardPadding,
  },
  cardTitle: {
    ...typography.headerSm,
    fontWeight: '800',
    color: colors.heading,
    marginBottom: 6,
  },
  cardCaption: {
    ...typography.body,
    color: colors.neutralGray,
    lineHeight: 20,
  },
});
