import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getAccessToken, setAccessToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const bootstrapSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const existingToken = getAccessToken();
      if (existingToken) {
        const res = await api.get('/auth/me');
        setUser(res.data.data.user);
        return;
      }

      const refreshRes = await api.post('/auth/refresh');
      const newToken = refreshRes.data?.data?.accessToken;
      const refreshedUser = refreshRes.data?.data?.user;
      if (newToken && refreshedUser) {
        setAccessToken(newToken);
        setUser(refreshedUser);
      }
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: nextUser, accessToken } = res.data.data;
    setAccessToken(accessToken);
    setUser(nextUser);
    return nextUser;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    const { user: nextUser, accessToken } = res.data.data;
    setAccessToken(accessToken);
    setUser(nextUser);
    return nextUser;
  }, []);

  const loginWithSocial = useCallback(async (provider, payload) => {
    const res = await api.post(`/auth/${provider}`, payload);
    const { user: nextUser, accessToken } = res.data.data;
    setAccessToken(accessToken);
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors during logout
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.data.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        register,
        loginWithSocial,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
