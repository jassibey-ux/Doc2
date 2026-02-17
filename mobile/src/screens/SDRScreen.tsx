/**
 * SDR Screen
 *
 * Manual SDR reading entry for HackRF captures.
 * Records center frequency, readings, and GPS position.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { apiFetch, checkConnection } from '../services/api';
import { enqueue } from '../services/offline-queue';

interface Props {
  sessionId: string;
}

export function SDRScreen({ sessionId }: Props) {
  const [centerFreq, setCenterFreq] = useState('2437');
  const [bandwidth, setBandwidth] = useState('20');
  const [gain, setGain] = useState('40');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!centerFreq) {
      Alert.alert('Required', 'Center frequency is required');
      return;
    }

    setSubmitting(true);

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const payload = {
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        alt_m: location.coords.altitude,
        gps_accuracy_m: location.coords.accuracy,
        center_frequency_mhz: parseFloat(centerFreq),
        bandwidth_mhz: bandwidth ? parseFloat(bandwidth) : null,
        gain_db: gain ? parseFloat(gain) : null,
        notes: notes || null,
        device_info: { type: 'HackRF', app: 'scensus-companion' },
      };

      const online = await checkConnection();
      if (online) {
        await apiFetch(`/api/v2/sessions/${sessionId}/sdr-readings`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        Alert.alert('Saved', 'SDR reading recorded');
      } else {
        await enqueue('sdr_reading', payload);
        Alert.alert('Queued', 'SDR reading queued for sync');
      }

      setNotes('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>SDR Capture</Text>
      <Text style={styles.subtitle}>Record HackRF spectrum reading with GPS position</Text>

      <Text style={styles.label}>Center Frequency (MHz)</Text>
      <TextInput
        style={styles.input}
        value={centerFreq}
        onChangeText={setCenterFreq}
        keyboardType="decimal-pad"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Bandwidth (MHz)</Text>
      <TextInput
        style={styles.input}
        value={bandwidth}
        onChangeText={setBandwidth}
        keyboardType="decimal-pad"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Gain (dB)</Text>
      <TextInput
        style={styles.input}
        value={gain}
        onChangeText={setGain}
        keyboardType="decimal-pad"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Location description, antenna orientation, etc."
        placeholderTextColor="#666"
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? 'Saving...' : 'Record Reading'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 16,
    paddingTop: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    color: '#8888aa',
    fontSize: 13,
    marginBottom: 24,
  },
  label: {
    color: '#8888aa',
    fontSize: 13,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#16213e',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
