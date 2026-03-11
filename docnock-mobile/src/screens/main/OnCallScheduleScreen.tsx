import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { axiosAuthClient } from '@api/client';
import { API_ENDPOINTS } from '@api/endpoints';
import { BottomTabScreenWrapper } from '@components';
import { useCustomNavigation } from '@navigation';
import { mScale, vscale } from '@utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnCallEntry {
  _id: string;
  role: string;
  userId: string;
  userDetails?: { fullName: string; profileImage?: string };
  startTime: string;
  endTime: string;
  timezone: string;
  isBackup: boolean;
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLES: Record<string, string> = {
  physician: 'Physician',
  nurse: 'Nurse',
  charge_nurse: 'Charge Nurse',
  specialist: 'Specialist',
};

const ROLE_ORDER = ['physician', 'charge_nurse', 'nurse', 'specialist'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isNow(entry: OnCallEntry): boolean {
  const now = Date.now();
  return new Date(entry.startTime).getTime() <= now && new Date(entry.endTime).getTime() >= now;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const OnCallScheduleScreen = () => {
  const navigation = useCustomNavigation();

  const [entries, setEntries] = useState<OnCallEntry[]>([]);
  const [onCallNow, setOnCallNow] = useState<OnCallEntry | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // For demo: load the first facility from listUsers
  useEffect(() => {
    axiosAuthClient
      .get(`${API_ENDPOINTS.LIST_USERS}?role=facility_center&limit=50`)
      .then((res: any) => {
        const list = res?.data?.data ?? [];
        setFacilities(list);
        if (list.length > 0) setFacilityId(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    try {
      const [scheduleRes, onCallRes] = await Promise.all([
        axiosAuthClient.get(
          `${API_ENDPOINTS.SCHEDULE_FACILITY}/${facilityId}?from=${new Date().toISOString()}`
        ),
        axiosAuthClient.get(
          `${API_ENDPOINTS.SCHEDULE_ONCALL_NOW}?facilityId=${facilityId}`
        ),
      ]);
      setEntries((scheduleRes as any)?.data?.data ?? []);
      setOnCallNow((onCallRes as any)?.data?.data ?? null);
    } catch (_e) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [facilityId]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadSchedule();
  };

  // Group entries by role
  const byRole = ROLE_ORDER.reduce<Record<string, OnCallEntry[]>>((acc, role) => {
    acc[role] = entries.filter(e => e.role === role);
    return acc;
  }, {});

  const navigateToChat = (userId: string) => {
    // Navigate to the chat screen with the on-call user
    (navigation as any).navigate('ChatScreen', { userId });
  };

  return (
    <BottomTabScreenWrapper title="On-Call Schedule">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Facility Selector */}
        {facilities.length > 1 && (
          <View style={styles.facilityRow}>
            <Text style={styles.sectionLabel}>Facility</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {facilities.map(f => (
                <Pressable
                  key={f._id}
                  style={[styles.facilityChip, facilityId === f._id && styles.facilityChipActive]}
                  onPress={() => setFacilityId(f._id)}
                >
                  <Text
                    style={[
                      styles.facilityChipText,
                      facilityId === f._id && styles.facilityChipTextActive,
                    ]}
                  >
                    {f.fullName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* On-Call Now Banner */}
        {onCallNow ? (
          <Pressable
            style={styles.onCallBanner}
            onPress={() => navigateToChat(onCallNow.userId)}
            accessibilityLabel={`On-call now: ${onCallNow.userDetails?.fullName ?? onCallNow.userId}`}
          >
            <View style={styles.onCallBannerLeft}>
              <View style={styles.onCallDot} />
              <View>
                <Text style={styles.onCallLabel}>On-Call Now</Text>
                <Text style={styles.onCallName}>
                  {onCallNow.userDetails?.fullName ?? onCallNow.userId}
                </Text>
                <Text style={styles.onCallMeta}>
                  {ROLES[onCallNow.role] ?? onCallNow.role} ·{' '}
                  until {formatTime(onCallNow.endTime)}
                  {onCallNow.isBackup ? ' (backup)' : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.onCallCta}>Message →</Text>
          </Pressable>
        ) : (
          facilityId && (
            <View style={styles.noCoverageBanner}>
              <Text style={styles.noCoverageText}>⚠ No on-call coverage right now</Text>
            </View>
          )
        )}

        {/* Loading state */}
        {loading && !refreshing && (
          <ActivityIndicator style={styles.loader} color="#005EB8" />
        )}

        {/* Schedule by role */}
        {ROLE_ORDER.map(role => {
          const roleEntries = byRole[role] ?? [];
          return (
            <View key={role} style={styles.roleSection}>
              <Text style={styles.roleHeading}>{ROLES[role]}</Text>
              {roleEntries.length === 0 ? (
                <Text style={styles.noEntryText}>No upcoming shifts</Text>
              ) : (
                roleEntries.map(entry => (
                  <Pressable
                    key={entry._id}
                    style={[styles.shiftCard, isNow(entry) && styles.shiftCardActive]}
                    onPress={() => navigateToChat(entry.userId)}
                    accessibilityLabel={`${ROLES[entry.role]} shift: ${entry.userDetails?.fullName ?? entry.userId}`}
                  >
                    {isNow(entry) && (
                      <View style={styles.activeIndicator} />
                    )}
                    <View style={styles.shiftInfo}>
                      <Text style={styles.shiftName}>
                        {entry.userDetails?.fullName ?? entry.userId}
                        {entry.isBackup && (
                          <Text style={styles.backupTag}> BKP</Text>
                        )}
                      </Text>
                      <Text style={styles.shiftTime}>
                        {formatDateShort(entry.startTime)} · {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                      </Text>
                      {entry.notes ? (
                        <Text style={styles.shiftNotes}>{entry.notes}</Text>
                      ) : null}
                    </View>
                    {isNow(entry) && (
                      <Text style={styles.messageHint}>Message</Text>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </BottomTabScreenWrapper>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: mScale(16),
    paddingBottom: vscale(32),
  },
  loader: {
    marginVertical: vscale(24),
  },

  // Facility chips
  facilityRow: {
    marginBottom: mScale(16),
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#757575',
    marginBottom: mScale(6),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  facilityChip: {
    paddingHorizontal: mScale(14),
    paddingVertical: mScale(8),
    borderRadius: mScale(20),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: mScale(8),
  },
  facilityChipActive: {
    backgroundColor: '#005EB8',
    borderColor: '#005EB8',
  },
  facilityChipText: {
    fontSize: 14,
    color: '#212121',
  },
  facilityChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },

  // On-call banner
  onCallBanner: {
    backgroundColor: '#005EB8',
    borderRadius: mScale(12),
    padding: mScale(16),
    marginBottom: mScale(20),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onCallBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mScale(12),
    flex: 1,
  },
  onCallDot: {
    width: mScale(10),
    height: mScale(10),
    borderRadius: mScale(5),
    backgroundColor: '#4CAF50',
    marginRight: mScale(4),
  },
  onCallLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  onCallName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  onCallMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  onCallCta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: mScale(8),
  },

  noCoverageBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius: mScale(8),
    padding: mScale(12),
    marginBottom: mScale(16),
    borderLeftWidth: 4,
    borderLeftColor: '#D5600A',
  },
  noCoverageText: {
    fontSize: 14,
    color: '#D5600A',
    fontWeight: '500',
  },

  // Role sections
  roleSection: {
    marginBottom: mScale(24),
  },
  roleHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: mScale(8),
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noEntryText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    marginLeft: mScale(4),
  },

  // Shift cards
  shiftCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: mScale(10),
    padding: mScale(14),
    marginBottom: mScale(8),
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  shiftCardActive: {
    borderColor: '#005EB8',
    backgroundColor: '#F7FBFF',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#005EB8',
    borderTopLeftRadius: mScale(10),
    borderBottomLeftRadius: mScale(10),
  },
  shiftInfo: {
    flex: 1,
    paddingLeft: mScale(4),
  },
  shiftName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
    marginBottom: 2,
  },
  backupTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#757575',
  },
  shiftTime: {
    fontSize: 13,
    color: '#757575',
  },
  shiftNotes: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 2,
    fontStyle: 'italic',
  },
  messageHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#005EB8',
    marginLeft: mScale(8),
  },
});
