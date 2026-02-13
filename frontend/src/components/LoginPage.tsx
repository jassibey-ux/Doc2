/**
 * Login Page for cloud deployments.
 *
 * Shown when VITE_API_URL is set and user is not authenticated.
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const { login, error, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a0a',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 32,
          width: 360,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ color: '#f97316', fontSize: 24, margin: 0 }}>SCENSUS</h1>
          <p style={{ color: '#888', fontSize: 14, margin: '4px 0 0' }}>
            Counter-UAS Testing Dashboard
          </p>
        </div>

        {error && (
          <div
            style={{
              background: '#7f1d1d',
              border: '1px solid #ef4444',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 16,
              color: '#fca5a5',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '10px 0',
            background: isLoading ? '#666' : '#f97316',
            border: 'none',
            borderRadius: 6,
            color: '#000',
            fontSize: 15,
            fontWeight: 'bold',
            cursor: isLoading ? 'wait' : 'pointer',
          }}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
