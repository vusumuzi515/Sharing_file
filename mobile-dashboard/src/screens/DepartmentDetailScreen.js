import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors } from '../styles/theme';
import DepartmentFilesContent from '../components/DepartmentFilesContent';
import ScreenHeader from '../components/ScreenHeader';

export default function DepartmentDetailScreen({ route, navigation }) {
  const department = route?.params?.department || { id: '', label: 'Department', folders: [] };
  const deptLabel = department?.label || department?.department || department?.name || department?.id || 'Files';

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title={deptLabel} />
      <View style={styles.body}>
        <DepartmentFilesContent
          embedded
          department={department}
          navigation={navigation}
          onNeedAuth={() => navigation.navigate('DepartmentAuth', { department })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.lightGrayBackground,
  },
  body: {
    flex: 1,
  },
});
