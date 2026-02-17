/**
 * Geotag Screen
 *
 * Allows operators to geotag CUAS placements from the field.
 * Takes a photo and GPS position, sends to the backend.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, checkConnection } from '../services/api';
import { enqueue } from '../services/offline-queue';

interface CUASPlacement {
  id: string;
  cuas_profile_name?: string;
  lat?: number;
  lon?: number;
  geotagged_at?: string;
}

interface Props {
  sessionId: string;
}

export function GeotagScreen({ sessionId }: Props) {
  const [placements, setPlacements] = useState<CUASPlacement[]>([]);
  const [geotagging, setGeotagging] = useState<string | null>(null);

  useEffect(() => {
    loadPlacements();
  }, [sessionId]);

  const loadPlacements = async () => {
    try {
      const session = await apiFetch<any>(`/api/v2/sessions/${sessionId}`);
      const cps = session.cuas_placements || [];
      setPlacements(
        cps.map((cp: any) => ({
          id: cp.id,
          cuas_profile_name: cp.cuas_profile?.name || cp.cuas_profile_id,
          lat: cp.lat,
          lon: cp.lon,
          geotagged_at: cp.geotagged_at,
        })),
      );
    } catch {
      // Offline
    }
  };

  const handleGeotag = async (placementId: string) => {
    setGeotagging(placementId);

    try {
      // Get current GPS position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      // Optionally take a photo
      const photoResult = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });

      const payload: Record<string, unknown> = {
        placement_id: placementId,
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        alt_m: location.coords.altitude,
        gps_accuracy_m: location.coords.accuracy,
        method: 'gps',
      };

      if (!photoResult.canceled && photoResult.assets[0]) {
        payload.photo_url = photoResult.assets[0].uri;
      }

      const online = await checkConnection();
      if (online) {
        await apiFetch(`/api/v2/cuas-placements/${placementId}/geotag`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await enqueue('cuas_geotag', payload);
      }

      await loadPlacements();
    } catch (err: any) {
      Alert.alert('Geotag Failed', err.message);
    } finally {
      setGeotagging(null);
    }
  };

  const renderPlacement = ({ item }: { item: CUASPlacement }) => (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{item.cuas_profile_name || 'CUAS'}</Text>
        {item.lat && item.lon ? (
          <Text style={styles.coords}>
            {item.lat.toFixed(6)}, {item.lon.toFixed(6)}
          </Text>
        ) : (
          <Text style={styles.noCoords}>No position set</Text>
        )}
        {item.geotagged_at && (
          <Text style={styles.geotagged}>Geotagged</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.geotagButton, geotagging === item.id && styles.geotagButtonActive]}
        onPress={() => handleGeotag(item.id)}
        disabled={geotagging !== null}
      >
        <Text style={styles.geotagButtonText}>
          {geotagging === item.id ? '...' : 'Geotag'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CUAS Geotag</Text>
      <Text style={styles.subtitle}>Tap to update position from your current GPS location</Text>

      <FlatList
        data={placements}
        keyExtractor={(item) => item.id}
        renderItem={renderPlacement}
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
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    padding: 16,
    paddingTop: 60,
  },
  subtitle: {
    color: '#8888aa',
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  coords: {
    color: '#8888aa',
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  noCoords: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  geotagged: {
    color: '#4ade80',
    fontSize: 11,
    marginTop: 2,
  },
  geotagButton: {
    backgroundColor: '#e94560',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  geotagButtonActive: {
    opacity: 0.6,
  },
  geotagButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});
