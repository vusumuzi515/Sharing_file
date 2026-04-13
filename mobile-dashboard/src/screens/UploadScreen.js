import React, { useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import { refreshServerCaches, invalidateCachedFiles } from '../services/portalApi';
import EmptyState from '../components/EmptyState';
import TabScreenHeader from '../components/TabScreenHeader';

export default function UploadScreen() {
  const { token, user, session } = useAuth();
  const [uploading, setUploading] = useState(false);

  const canUpload = Boolean(token && session?.capabilities?.upload && String(user?.permission || '').toLowerCase() !== 'view');
  const deptId = user?.departmentId || '';

  const handlePickAndUpload = async () => {
    if (!token || !deptId) return;
    setUploading(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file?.uri || !file?.name) throw new Error('Invalid file');
      const form = new FormData();
      form.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      });
      form.append('department', deptId);
      form.append('project', 'General');
      await apiRequest('/api/upload', {
        token,
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: form,
      });
      await invalidateCachedFiles(deptId).catch(() => null);
      await refreshServerCaches(token).catch(() => null);
      Alert.alert('Done', 'Uploaded.');
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'Try again');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TabScreenHeader title="Upload" />
      <View style={styles.container}>
        {!token ? (
          <EmptyState title="Sign in" message="Required to upload." />
        ) : !canUpload ? (
          <EmptyState title="View only" message="Upload disabled." />
        ) : (
          <View style={styles.card}>
            <Text style={styles.dept}>{user?.department || deptId}</Text>
            <Pressable onPress={handlePickAndUpload} disabled={uploading} style={[styles.btn, uploading && styles.btnDisabled]}>
              <Text style={styles.btnText}>{uploading ? '…' : 'Choose file'}</Text>
            </Pressable>
          </View>
        )}
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
  dept: { ...typography.headerSm, color: colors.heading, marginBottom: 16, fontWeight: '800' },
  btn: {
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
