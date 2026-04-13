import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';

const TAB_META = {
  Home: { label: 'Home', icon: '🏠' },
  Departments: { label: 'Departments', icon: '📁' },
  Upload: { label: 'Upload', icon: '+' },
  Activity: { label: 'Quick access', icon: '🕘' },
  Profile: { label: 'Profile', icon: '👤' },
};

export default function BottomNavigation({ state, descriptors, navigation }) {
  const { isAuthenticated } = useAuth();
  return (
    <View style={styles.wrap}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name] || { label: route.name, icon: '•' };
        const isFocused = state.index === index;
        const isUpload = route.name === 'Upload';
        const requiresAuth = route.name === 'Upload' || route.name === 'Activity' || route.name === 'Profile';
        const disabled = requiresAuth && !isAuthenticated;

        const onPress = () => {
          if (disabled) {
            navigation.navigate('Departments');
            return;
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[styles.tabItem, isUpload && styles.uploadTabItem, disabled && styles.tabDisabled]}
          >
            {isUpload ? (
              <View style={styles.uploadButton}>
                <Text style={styles.uploadIcon}>{meta.icon}</Text>
              </View>
            ) : (
              <Text style={[styles.icon, isFocused && styles.iconActive]}>{meta.icon}</Text>
            )}

            <Text style={[styles.label, isFocused && styles.labelActive]}>{meta.label}</Text>

            {!isUpload && <View style={[styles.underline, isFocused && styles.underlineActive]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 78,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 58,
  },
  uploadTabItem: {
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
    color: colors.neutralGray,
    marginBottom: 4,
  },
  iconActive: {
    color: colors.primaryBlue,
  },
  label: {
    ...typography.small,
    color: colors.neutralGray,
  },
  labelActive: {
    color: colors.primaryBlue,
  },
  underline: {
    marginTop: 4,
    width: 22,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: colors.primaryBlue,
  },
  uploadButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    marginBottom: 2,
  },
  uploadIcon: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '700',
    marginTop: -2,
    lineHeight: 32,
  },
  tabDisabled: {
    opacity: 0.5,
  },
});
