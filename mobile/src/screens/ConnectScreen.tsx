/**
 * Connect Screen
 *
 * First screen — user enters the dashboard server address and verifies connectivity.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { setBaseUrl, getBaseUrl, checkConnection } from '../services/api';

interface Props {
  onConnected: () => void;
}

export function ConnectScreen({ onConnected }: Props) {
  const [serverUrl, setServerUrl] = useState(getBaseUrl());
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleConnect = async () => {
    setStatus('checking');
    setErrorMsg('');

    const url = serverUrl.startsWith('http') ? serverUrl : `http://${serverUrl}`;
    setBaseUrl(url);

    const ok = await checkConnection();
    if (ok) {
      setStatus('ok');
      setTimeout(onConnected, 500);
    } else {
      setStatus('error');
      setErrorMsg('Cannot reach server. Check the address and ensure the dashboard is running.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SCENSUS Companion</Text>
      <Text style={styles.subtitle}>Connect to Dashboard</Text>

      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://192.168.1.100:3000"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <TouchableOpacity
        style={[styles.button, status === 'checking' && styles.buttonDisabled]}
        onPress={handleConnect}
        disabled={status === 'checking'}
      >
        {status === 'checking' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Connect</Text>
        )}
      </TouchableOpacity>

      {status === 'ok' && (
        <Text style={styles.successText}>Connected</Text>
      )}
      {status === 'error' && (
        <Text style={styles.errorText}>{errorMsg}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e94560',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8888aa',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#16213e',
    color: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successText: {
    color: '#4ade80',
    textAlign: 'center',
    marginTop: 12,
  },
  errorText: {
    color: '#e94560',
    textAlign: 'center',
    marginTop: 12,
  },
});
