import React from 'react';
import { Pressable, View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { colors, typography, spacing } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { rootNavigationRef } from '../navigation/rootNavigationRef';
import TabScreenHeader from '../components/TabScreenHeader';

function resetToHome() {
  if (!rootNavigationRef.isReady()) return;
  rootNavigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'MainTabs',
          state: {
            index: 0,
            routes: [
              {
                name: 'Home',
                state: {
                  index: 0,
                  routes: [{ name: 'HomeScreen' }],
                },
              },
              { name: 'Departments' },
              { name: 'Upload' },
              { name: 'Activity' },
              { name: 'Profile' },
            ],
          },
        },
      ],
    })
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, session, signOut } = useAuth();
  const caps = session?.capabilities;

  const handleSignOut = async () => {
    await signOut();
    resetToHome();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TabScreenHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.name}>{user?.name || user?.employeeId || 'Guest'}</Text>
        <Text style={styles.meta}>
          {[user?.employeeId, user?.department || session?.department].filter(Boolean).join(' · ') || 'Not signed in'}
        </Text>

        {session ? (
          <View style={styles.card}>
            <Row label="Role" value={session.role || user?.role || '—'} />
            <Row label="Access" value={session.permission || '—'} />
            <Row label="Upload" value={caps?.upload ? 'Yes' : 'No'} />
            <Row label="Delete" value={caps?.delete ? 'Yes' : 'No'} />
          </View>
        ) : null}

        <Text style={styles.api} selectable numberOfLines={1}>
          {API_BASE_URL.replace(/^https?:\/\//, '')}
        </Text>

        {user ? (
          <>
            <Pressable
              onPress={() => navigation.navigate('Home', { screen: 'UsersScreen' })}
              style={styles.btnSecondary}
            >
              <Text style={styles.btnSecondaryText}>Team</Text>
            </Pressable>
            <Pressable onPress={handleSignOut} style={styles.btnDanger}>
              <Text style={styles.btnDangerText}>Sign out</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.lightGrayBackground },
  scroll: { paddingHorizontal: spacing.cardPadding, paddingTop: 8, paddingBottom: 32 },
  name: { ...typography.headerLg, color: colors.heading, marginBottom: 4 },
  meta: { ...typography.body, color: colors.neutralGray, marginBottom: 16 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rowLabel: { ...typography.small, color: colors.neutralGray, fontWeight: '700' },
  rowValue: { ...typography.small, color: colors.heading, fontWeight: '800' },
  api: {
    ...typography.small,
    color: colors.neutralGray,
    marginBottom: 16,
  },
  btnSecondary: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondaryText: { color: colors.primaryBlue, fontWeight: '800', fontSize: 16 },
  btnDanger: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
  },
  btnDangerText: { color: '#b91c1c', fontWeight: '800', fontSize: 16 },
});
