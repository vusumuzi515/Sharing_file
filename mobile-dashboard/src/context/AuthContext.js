import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMeSession } from '../services/portalApi';

const STORAGE_TOKEN = 'inyatsi.mobile.token';
const STORAGE_USER = 'inyatsi.mobile.user';

const AuthContext = createContext(null);

function parseUser(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    let storedToken = '';
    try {
      storedToken = (await AsyncStorage.getItem(STORAGE_TOKEN)) || '';
      const u = parseUser((await AsyncStorage.getItem(STORAGE_USER)) || '');
      setToken(storedToken);
      setUser(u);
      if (!storedToken) setSession(null);
    } finally {
      setLoading(false);
    }

    if (!storedToken) return;

    (async () => {
      try {
        const s = await fetchMeSession(storedToken);
        setSession(s);
        const u = parseUser((await AsyncStorage.getItem(STORAGE_USER)) || '');
        if (u && s) {
          const merged = {
            ...u,
            permission: s.permission ?? u.permission,
            role: s.role ?? u.role,
            isAdmin: s.isAdmin ?? u.isAdmin,
          };
          setUser(merged);
          await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(merged));
        }
      } catch {
        setSession(null);
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signIn = useCallback(async ({ token: nextToken, user: nextUser }) => {
    setToken(nextToken || '');
    await AsyncStorage.setItem(STORAGE_TOKEN, nextToken || '');
    const s = nextToken ? await fetchMeSession(nextToken).catch(() => null) : null;
    setSession(s);
    const merged = nextUser
      ? {
          ...nextUser,
          permission: s?.permission ?? nextUser.permission,
          role: s?.role ?? nextUser.role,
          isAdmin: s?.isAdmin ?? nextUser.isAdmin,
        }
      : null;
    setUser(merged);
    await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(merged || null));
  }, []);

  const signOut = useCallback(async () => {
    setToken('');
    setUser(null);
    setSession(null);
    await AsyncStorage.removeItem(STORAGE_TOKEN);
    await AsyncStorage.removeItem(STORAGE_USER);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token) return null;
    const s = await fetchMeSession(token).catch(() => null);
    setSession(s);
    return s;
  }, [token]);

  const value = useMemo(
    () => ({
      loading,
      token,
      user,
      session,
      isAuthenticated: Boolean(token),
      signIn,
      signOut,
      refreshSession,
      reloadFromStorage: load,
    }),
    [loading, token, user, session, signIn, signOut, refreshSession, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
