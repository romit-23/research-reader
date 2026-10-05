import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import {
  apiLogin,
  apiSignup,
  apiGetMe,
  getStoredToken,
  clearStoredToken,
} from '../api/client';

const GUEST_MODE_KEY = 'research_reader_guest_mode';

function getStoredGuestMode(): boolean {
  if (typeof window === 'undefined') return true;
  const token = getStoredToken();
  if (token) return false;
  return true;
}

function setStoredGuestMode(isGuest: boolean): void {
  if (isGuest) {
    localStorage.setItem(GUEST_MODE_KEY, 'true');
  } else {
    localStorage.removeItem(GUEST_MODE_KEY);
  }
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isGuest: boolean;
  login: (data: { email: string; password: string }) => Promise<void>;
  signup: (data: { email: string; username: string; password: string }) => Promise<void>;
  logout: () => void;
  continueAsGuest: () => void;
  exitGuestMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isGuest, setIsGuest] = useState<boolean>(getStoredGuestMode());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initAuth() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        setIsGuest(true);
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await apiGetMe();
        setUser(currentUser);
        setToken(storedToken);
        setIsGuest(false);
      } catch (err) {
        console.warn('Session restoration failed:', err);
        clearStoredToken();
        setUser(null);
        setToken(null);
        setIsGuest(true);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = async (data: { email: string; password: string }) => {
    const res = await apiLogin(data);
    setUser(res.user);
    setToken(res.access_token);
    setIsGuest(false);
    setStoredGuestMode(false);
  };

  const signup = async (data: { email: string; username: string; password: string }) => {
    const res = await apiSignup(data);
    setUser(res.user);
    setToken(res.access_token);
    setIsGuest(false);
    setStoredGuestMode(false);
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
    setToken(null);
    setIsGuest(true);
    setStoredGuestMode(true);
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    setStoredGuestMode(true);
  };

  const exitGuestMode = () => {
    setIsGuest(false);
    setStoredGuestMode(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isGuest,
        login,
        signup,
        logout,
        continueAsGuest,
        exitGuestMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
