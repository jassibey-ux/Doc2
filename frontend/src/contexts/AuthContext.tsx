/**
 * Authentication Context
 *
 * Provides login/logout state and token management for cloud deployments.
 * In local Electron mode, auth is bypassed (always authenticated).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setApiConfig, clearApiConfig, getApiConfig, apiFetch } from '../services/api';

type UserRole = 'admin' | 'operator' | 'observer' | 'analyst';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  observer: 0,
  analyst: 1,
  operator: 2,
  admin: 3,
};

interface AuthUser {
  email: string;
  organization_id: string;
  role: UserRole;
  name?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isCloudMode: boolean;
  hasRole: (requiredRole: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  const config = getApiConfig();
  const isCloudMode = !!config.baseUrl;

  // Check if we have a valid stored token
  useEffect(() => {
    if (!isCloudMode) {
      // Local mode — always authenticated
      setState({ isAuthenticated: true, isLoading: false, user: null, error: null });
      return;
    }

    if (config.authToken) {
      // Validate existing token
      apiFetch('/api/v2/auth/me')
        .then(async (res) => {
          if (res.ok) {
            const user = await res.json();
            setState({
              isAuthenticated: true,
              isLoading: false,
              user: {
                email: user.email,
                organization_id: user.organization_id,
                role: user.role || 'observer',
                name: user.name,
              },
              error: null,
            });
          } else {
            setState({ isAuthenticated: false, isLoading: false, user: null, error: null });
          }
        })
        .catch(() => {
          setState({ isAuthenticated: false, isLoading: false, user: null, error: null });
        });
    } else {
      setState({ isAuthenticated: false, isLoading: false, user: null, error: null });
    }
  }, [isCloudMode, config.authToken]);

  // Listen for 401 events
  useEffect(() => {
    const handler = () => {
      setState((prev) => ({ ...prev, isAuthenticated: false, user: null }));
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const res = await apiFetch('/api/v2/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setApiConfig({
          authToken: data.token,
          organizationId: data.organization_id,
        });
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: {
            email: data.email,
            organization_id: data.organization_id,
            role: data.role || 'observer',
            name: data.name,
          },
          error: null,
        });
        return true;
      }

      const errorData = await res.json().catch(() => ({ detail: 'Login failed' }));
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorData.detail || 'Login failed',
      }));
      return false;
    } catch (e: any) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: e.message || 'Network error',
      }));
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    clearApiConfig();
    setState({ isAuthenticated: false, isLoading: false, user: null, error: null });
  }, []);

  const hasRole = useCallback((requiredRole: UserRole): boolean => {
    if (!isCloudMode) return true; // Local mode has full access
    if (!state.user) return false;
    const userLevel = ROLE_HIERARCHY[state.user.role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 99;
    return userLevel >= requiredLevel;
  }, [isCloudMode, state.user]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isCloudMode, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};
