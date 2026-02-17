/**
 * Session Screen
 *
 * Displays active session info, operator position tracking toggle,
 * and navigation to geotag and SDR screens.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { apiFetch } from '../services/api';
import { isTracking, startTracking, stopTracking, requestPermissions, setPositionCallback, PositionUpdate } from '../services/location';
import { queueSize, flushQueue } from '../services/offline-queue';

interface Session {
  id: string;
  name: string;
  status: string;
  site_name?: string;
}

interface Props {
  onSelectSession: (sessionId: string) => void;
}

export function SessionScreen({ onSelectSession }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tracking, setTracking] = useState(isTracking());
  const [position, setPosition] = useState<PositionUpdate | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch<Session[]>('/api/v2/sessions?limit=20');
      setSessions(data);
    } catch {
      // Offline — show cached or empty
    }
  }, []);

  const loadQueueSize = useCallback(async () => {
    const count = await queueSize();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    loadSessions();
    loadQueueSize();
    const interval = setInterval(loadQueueSize, 5000);
    return () => clearInterval(interval);
  }, [loadSessions, loadQueueSize]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    await loadQueueSize();
    setRefreshing(false);
  };

  const handleToggleTracking = async (sessionId: string) => {
    if (tracking) {
      await stopTracking();
      setTracking(false);
      setPosition(null);
      setActiveSessionId(null);
      setPositionCallback(null);
    } else {
      const granted = await requestPermissions();
      if (!granted) return;

      setPositionCallback((pos) => setPosition(pos));
      // TODO: actor ID should come from session actor assignment
      await startTracking(sessionId, 'mobile-operator', 2000);
      setTracking(true);
      setActiveSessionId(sessionId);
    }
  };

  const handleFlushQueue = async () => {
    const synced = await flushQueue();
    await loadQueueSize();
    if (synced > 0) {
      // Could show a toast here
    }
  };

  const renderSession = ({ item }: { item: Session }) => {
    const isActive = item.status === 'active';
    const isTrackingThis = tracking && activeSessionId === item.id;

    return (
      <View style={styles.sessionCard}>
        <TouchableOpacity
          style={styles.sessionInfo}
          onPress={() => onSelectSession(item.id)}
        >
          <Text style={styles.sessionName}>{item.name}</Text>
          <Text style={styles.sessionMeta}>
            {item.site_name || 'No site'} — {item.status}
          </Text>
        </TouchableOpacity>

        {isActive && (
          <TouchableOpacity
            style={[styles.trackButton, isTrackingThis && styles.trackButtonActive]}
            onPress={() => handleToggleTracking(item.id)}
          >
            <Text style={styles.trackButtonText}>
              {isTrackingThis ? 'Stop' : 'Track'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sessions</Text>
        {pendingCount > 0 && (
          <TouchableOpacity style={styles.syncBadge} onPress={handleFlushQueue}>
            <Text style={styles.syncText}>{pendingCount} pending</Text>
          </TouchableOpacity>
        )}
      </View>

      {tracking && position && (
        <View style={styles.positionBar}>
          <Text style={styles.positionText}>
            {position.lat.toFixed(6)}, {position.lon.toFixed(6)}
            {position.gps_accuracy_m ? ` (${position.gps_accuracy_m.toFixed(0)}m)` : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#e94560" />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  syncBadge: {
    backgroundColor: '#e9456033',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  syncText: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
  },
  positionBar: {
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  positionText: {
    color: '#4ade80',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  list: {
    padding: 16,
  },
  sessionCard: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionMeta: {
    color: '#8888aa',
    fontSize: 12,
    marginTop: 2,
  },
  trackButton: {
    backgroundColor: '#e94560',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  trackButtonActive: {
    backgroundColor: '#4ade80',
  },
  trackButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});
