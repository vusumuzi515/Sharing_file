import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { login } from '../services/portalApi';
import { useAuth } from '../context/AuthContext';
import ScreenHeader from '../components/ScreenHeader';

export default function DepartmentAuthScreen({ route, navigation }) {
  const { signIn } = useAuth();
  const department = route?.params?.department || null;
  const departmentId = department?.id || '';
  const deptLabel = department?.label || department?.department || department?.name || departmentId || 'Department';

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => Boolean(departmentId && employeeId.trim() && password.trim()), [departmentId, employeeId, password]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await login({ employeeId: employeeId.trim(), password: password.trim(), departmentId });
      await signIn({ token: res?.token, user: res?.user });
      navigation.replace('MainTabs', {
        screen: 'Home',
        params: {
          screen: 'DepartmentDetailScreen',
          params: { department },
        },
      });
    } catch (e) {
      setError(e?.message || 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Sign in" subtitle={deptLabel} />
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            value={employeeId}
            onChangeText={setEmployeeId}
            placeholder="Username"
            autoCapitalize="none"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            style={[styles.btn, (!canSubmit || submitting) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{submitting ? '…' : 'Continue'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.lightGrayBackground },
  container: { flex: 1, paddingHorizontal: spacing.cardPadding, paddingTop: 12 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.cardPadding,
  },
  label: { ...typography.small, color: colors.neutralGray, fontWeight: '800' },
  input: {
    marginTop: 8,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.white,
    color: colors.heading,
    fontSize: 16,
  },
  error: { marginTop: 12, color: '#b91c1c', ...typography.small, fontWeight: '700' },
  btn: {
    marginTop: 20,
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
