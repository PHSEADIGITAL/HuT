import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client";

const TOKEN_STORAGE_KEY = "hut.mobile.authToken";
const USER_STORAGE_KEY = "hut.mobile.user";

const AuthContext = createContext(null);

async function persistAuthSession({ token, user }) {
  await AsyncStorage.multiSet([
    [TOKEN_STORAGE_KEY, token],
    [USER_STORAGE_KEY, JSON.stringify(user)]
  ]);
}

async function clearAuthSession() {
  await AsyncStorage.multiRemove([TOKEN_STORAGE_KEY, USER_STORAGE_KEY]);
}

export function AuthProvider({ children }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);

  const refreshProfile = useCallback(
    async (tokenOverride) => {
      const activeToken = tokenOverride || token;
      if (!activeToken) {
        return null;
      }
      const payload = await apiRequest("/api/auth/me", {
        token: activeToken
      });
      setUser(payload.user);
      await persistAuthSession({
        token: activeToken,
        user: payload.user
      });
      return payload.user;
    },
    [token]
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        const [[, storedToken], [, storedUserRaw]] = await AsyncStorage.multiGet([
          TOKEN_STORAGE_KEY,
          USER_STORAGE_KEY
        ]);
        if (!storedToken) {
          return;
        }
        setToken(storedToken);
        if (storedUserRaw) {
          setUser(JSON.parse(storedUserRaw));
        }
        await refreshProfile(storedToken);
      } catch (_error) {
        await clearAuthSession();
      } finally {
        setBootstrapping(false);
      }
    }
    bootstrap();
  }, [refreshProfile]);

  const login = useCallback(async ({ email, password }) => {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email,
        password
      }
    });
    setToken(payload.token);
    setUser(payload.user);
    await persistAuthSession({
      token: payload.token,
      user: payload.user
    });
    return payload.user;
  }, []);

  const register = useCallback(
    async ({ name, email, phone, password, confirmPassword, marketplaceAccountType }) => {
      const payload = await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
          name,
          email,
          phone,
          password,
          confirmPassword,
          marketplaceAccountType
        }
      });
      setToken(payload.token);
      setUser(payload.user);
      await persistAuthSession({
        token: payload.token,
        user: payload.user
      });
      return payload.user;
    },
    []
  );

  const logout = useCallback(async () => {
    const activeToken = token;
    try {
      if (activeToken) {
        await apiRequest("/api/auth/logout", {
          method: "POST",
          token: activeToken
        });
      }
    } catch (_error) {
      // Ignore remote logout failure and clear local session.
    } finally {
      setToken("");
      setUser(null);
      await clearAuthSession();
    }
  }, [token]);

  const value = useMemo(
    () => ({
      bootstrapping,
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      refreshProfile
    }),
    [bootstrapping, token, user, login, register, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
