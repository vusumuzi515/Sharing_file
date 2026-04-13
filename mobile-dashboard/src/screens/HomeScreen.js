import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import QuickAccessFiles from '../components/QuickAccessFiles';
import { AnimatedPrimaryButtonBreathing } from '../components/AnimatedButton';
import { FINISHED_PROJECTS } from '../data/finishedProjects';
import { colors, spacing, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';

const { width: WIN_W } = Dimensions.get('window');
const CARD_W = Math.min(WIN_W * 0.82, 312);
const CARD_GAP = 14;

const CORE_VALUES = [
  { key: 'accountability', label: 'Accountability' },
  { key: 'agility', label: 'Agility / Can-do attitude' },
  { key: 'commitment', label: 'Commitment' },
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'change', label: 'Embrace change' },
];

const HOME_PROJECT_PREVIEW = FINISHED_PROJECTS.slice(0, 3);

function ValueHeroBackground() {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const textOpacity = useMemo(
    () =>
      opacity.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.34],
      }),
    [opacity]
  );

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setIndex((i) => (i + 1) % CORE_VALUES.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }).start();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [opacity]);

  const v = CORE_VALUES[index];

  return (
    <View style={styles.valueHero} accessibilityRole="summary">
      <View style={[StyleSheet.absoluteFill, styles.valueHeroBase]} />
      <View style={styles.valueBlob1} />
      <View style={styles.valueBlob2} />
      <View style={styles.valueAccent} />
      <Animated.Text style={[styles.valueHeroWatermark, { opacity: textOpacity }]} numberOfLines={3}>
        {v.label}
      </Animated.Text>
      <View style={styles.valueDots}>
        {CORE_VALUES.map((item, i) => (
          <View key={item.key} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();

  const goDepartments = () => {
    navigation.getParent()?.navigate('Departments');
  };

  const goFinishedProjects = () => {
    navigation.navigate('FinishedProjectsScreen');
  };

  const handleOpenFileDetails = (payload) => {
    const departmentId = payload?.departmentId || user?.departmentId || '';
    const departmentName = payload?.departmentName || user?.department || 'Department';
    const file = payload?.file || {
      id: payload?.fileId,
      name: payload?.fileName || 'File',
      project: payload?.project,
    };
    if (!file?.id) return;
    navigation.navigate('FileDetailsScreen', {
      departmentId,
      departmentName,
      file,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerWrap}>
        <View style={styles.headerCard}>
          <AppHeader />
        </View>
      </View>
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {user?.name ? <Text style={styles.hi}>Hi, {user.name.split(' ')[0]}</Text> : null}

        <ValueHeroBackground />

        <View style={styles.ctaPanel}>
          <AnimatedPrimaryButtonBreathing
            label="Departments"
            onPress={goDepartments}
            icon={<Text style={styles.ctaIcon}>📁</Text>}
            style={styles.deptBtn}
          />
        </View>

        <View style={styles.projectsHeader}>
          <Text style={styles.sectionTitle}>Finished projects</Text>
          <Pressable onPress={goFinishedProjects} style={styles.seeMoreHit} hitSlop={12}>
            <Text style={styles.seeMore}>See more</Text>
            <Text style={styles.seeMoreChevron}>›</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.projectScroll}
          decelerationRate="fast"
          snapToInterval={CARD_W + CARD_GAP}
          snapToAlignment="start"
        >
          {HOME_PROJECT_PREVIEW.map((p) => (
            <Pressable
              key={p.id}
              onPress={goFinishedProjects}
              style={({ pressed }) => [styles.projectCard, pressed && styles.projectCardPressed]}
            >
              <Image source={p.image} style={styles.projectImage} resizeMode="cover" accessibilityLabel={p.title} />
              <View style={styles.projectBody}>
                <Text style={styles.projectTitle} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={styles.projectCaption} numberOfLines={2}>
                  {p.caption}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <QuickAccessFiles onFilePress={handleOpenFileDetails} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#eef1f5',
  },
  headerWrap: {
    paddingHorizontal: spacing.cardPadding,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: '#eef1f5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bodyScroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.cardPadding,
    paddingTop: 12,
    paddingBottom: 32,
  },
  hi: {
    ...typography.body,
    color: colors.heading,
    fontWeight: '700',
    marginBottom: 12,
  },
  valueHero: {
    height: 188,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    justifyContent: 'flex-end',
  },
  valueHeroBase: {
    backgroundColor: '#032a63',
  },
  valueBlob1: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.primaryBlue,
    opacity: 0.28,
    top: -100,
    right: -70,
  },
  valueBlob2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#ffffff',
    opacity: 0.07,
    bottom: -40,
    left: -30,
  },
  valueAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: '#000',
    opacity: 0.2,
  },
  valueHeroWatermark: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 28,
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.4,
    lineHeight: 32,
    textTransform: 'uppercase',
  },
  valueDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotOn: {
    backgroundColor: colors.white,
    width: 18,
  },
  ctaPanel: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.cardPadding,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  deptBtn: {
    width: '100%',
  },
  ctaIcon: {
    fontSize: 20,
  },
  projectsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    ...typography.headerSm,
    color: colors.heading,
    fontWeight: '800',
  },
  seeMoreHit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  seeMore: {
    ...typography.body,
    color: colors.primaryBlue,
    fontWeight: '800',
  },
  seeMoreChevron: {
    fontSize: 22,
    color: colors.primaryBlue,
    fontWeight: '600',
    marginTop: -2,
    marginLeft: 2,
  },
  projectScroll: {
    paddingRight: spacing.cardPadding,
    paddingBottom: 10,
  },
  projectCard: {
    width: CARD_W,
    marginRight: CARD_GAP,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  projectCardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  projectImage: {
    width: '100%',
    height: 148,
    backgroundColor: '#e2e8f0',
  },
  projectBody: {
    padding: 14,
  },
  projectTitle: {
    ...typography.body,
    color: colors.heading,
    fontWeight: '800',
    marginBottom: 6,
    lineHeight: 20,
  },
  projectCaption: {
    ...typography.small,
    color: colors.neutralGray,
    lineHeight: 18,
    fontWeight: '600',
  },
});
