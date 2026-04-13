import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, fileIconColors } from '../styles/theme';
import { fetchRecentFileVisits } from '../services/portalApi';
import { useAuth } from '../context/AuthContext';

function iconMeta(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return { icon: 'P', color: fileIconColors.pdf };
  if (lower.match(/\.(doc|docx)$/)) return { icon: 'W', color: fileIconColors.word };
  if (lower.match(/\.(xls|xlsx)$/)) return { icon: 'X', color: fileIconColors.excel };
  if (lower.match(/\.(ppt|pptx)$/)) return { icon: 'P', color: fileIconColors.powerpoint };
  return { icon: 'F', color: fileIconColors.pdf };
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function QuickAccessFiles({ onOpenFile, onFilePress }) {
  const openHandler = onOpenFile || onFilePress;
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const load = async () => {
    if (!token) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchRecentFileVisits(token, 8);
      setItems(rows || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handlePress = (entry) => {
    if (typeof openHandler !== 'function') return;
    const fileId = entry.fileId;
    const fileName = entry.fileName;
    if (!fileId || !fileName) return;
    openHandler({
      fileId,
      fileName,
      departmentId: entry.departmentId,
      departmentName: entry.department,
      project: entry.project,
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Recent</Text>
      {!token ? (
        <Text style={styles.hint}>Sign in to see activity.</Text>
      ) : loading ? (
        <View style={styles.centerRow}>
          <ActivityIndicator color={colors.primaryBlue} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : !items.length ? (
        <Text style={styles.hint}>No activity yet.</Text>
      ) : (
        items.map((entry, idx) => {
          const name = entry.fileName || 'File';
          const { icon, color } = iconMeta(name);
          const who = entry.visitorName || entry.employeeId || '';
          return (
            <View key={entry.id || `${name}-${idx}`}>
              <Pressable style={styles.row} onPress={() => handlePress(entry)}>
                <View style={styles.left}>
                  <View style={[styles.iconWrap, { backgroundColor: color }]}>
                    <Text style={styles.iconText}>{icon}</Text>
                  </View>
                  <View style={styles.textWrap}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.fileMeta} numberOfLines={1}>
                      {[who, entry.project, entry.timestamp ? formatWhen(entry.timestamp) : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
              {idx < items.length - 1 ? <View style={styles.separator} /> : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.cardPadding,
  },
  header: {
    ...typography.small,
    color: colors.neutralGray,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  hint: {
    ...typography.body,
    color: colors.neutralGray,
  },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  muted: { ...typography.body, color: colors.neutralGray },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  textWrap: {
    flexShrink: 1,
    flex: 1,
  },
  fileName: {
    ...typography.body,
    color: colors.primaryBlue,
    fontWeight: '700',
  },
  fileMeta: {
    ...typography.small,
    color: colors.neutralGray,
    marginTop: 2,
  },
  arrow: {
    color: colors.neutralGray,
    fontSize: 20,
    fontWeight: '300',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f1f5f9',
  },
});
