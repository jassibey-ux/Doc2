import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { axiosAuthClient } from '@api/client';
import { API_ENDPOINTS } from '@api/endpoints';
import { BaseText, BottomTabScreenWrapper } from '@components';
import { mScale, vscale } from '@utils';

interface FaxItem {
  _id: string;
  direction: 'inbound' | 'outbound';
  faxNumber: string;
  facilityId?: { fullName: string };
  pageCount: number;
  status: 'received' | 'read' | 'forwarded' | 'sent' | 'failed';
  pdfPath: string;
  createdAt: string;
}

export const EFax = () => {
  const [faxes, setFaxes] = useState<FaxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadFaxes = useCallback(async (pageNum = 1, append = false) => {
    if (!append) setLoading(true);
    try {
      const res = await axiosAuthClient.get(
        `fax/inbox?page=${pageNum}&limit=20`
      );
      const data = (res as any)?.data?.data ?? {};
      const items: FaxItem[] = data?.data ?? [];
      setFaxes(prev => (append ? [...prev, ...items] : items));
      setUnreadCount(data?.unreadCount ?? 0);
      setHasMore(pageNum < (data?.totalPages ?? 1));
    } catch (_e) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPage(1);
      loadFaxes(1);
    }, [loadFaxes])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadFaxes(1);
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      const next = page + 1;
      setPage(next);
      loadFaxes(next, true);
    }
  };

  const markAsRead = async (fax: FaxItem) => {
    if (fax.status !== 'received') return;
    try {
      await axiosAuthClient.put(`fax/${fax._id}/read`);
      setFaxes(prev =>
        prev.map(f => (f._id === fax._id ? { ...f, status: 'read' } : f))
      );
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (_e) {}
  };

  const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
    received: { label: 'New', bg: '#E3F0FF', color: '#005EB8' },
    read: { label: 'Read', bg: '#F0F4F5', color: '#757575' },
    forwarded: { label: 'Fwd', bg: '#E8F5E9', color: '#007F3B' },
    sent: { label: 'Sent', bg: '#E8F5E9', color: '#007F3B' },
    failed: { label: 'Failed', bg: '#FFEBEE', color: '#D5281B' },
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderFax = ({ item }: { item: FaxItem }) => {
    const cfg = statusConfig[item.status] ?? statusConfig.read;
    return (
      <Pressable
        style={[styles.faxRow, item.status === 'received' && styles.faxRowUnread]}
        onPress={() => markAsRead(item)}
        accessibilityLabel={`Fax from ${item.faxNumber}, ${cfg.label}`}
      >
        <View style={styles.directionIcon}>
          <Text style={styles.directionText}>
            {item.direction === 'inbound' ? '↙' : '↗'}
          </Text>
        </View>
        <View style={styles.faxInfo}>
          <Text
            style={[styles.faxNumber, item.status === 'received' && styles.faxNumberBold]}
          >
            {item.faxNumber || 'Unknown'}
          </Text>
          <Text style={styles.faxMeta}>
            {item.pageCount} page{item.pageCount !== 1 ? 's' : ''} ·{' '}
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <BottomTabScreenWrapper title="eFax">
      {/* Unread banner */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadText}>
            {unreadCount} new fax{unreadCount > 1 ? 'es' : ''}
          </Text>
        </View>
      )}

      {loading && faxes.length === 0 ? (
        <ActivityIndicator style={styles.loader} color="#005EB8" size="large" />
      ) : (
        <FlatList
          data={faxes}
          keyExtractor={item => item._id}
          renderItem={renderFax}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📠</Text>
              <Text style={styles.emptyTitle}>No faxes yet</Text>
              <Text style={styles.emptySubtitle}>
                Inbound faxes from your facility will appear here
              </Text>
            </View>
          }
        />
      )}
    </BottomTabScreenWrapper>
  );
};

const styles = StyleSheet.create({
  loader: { marginTop: vscale(60) },
  listContent: { paddingBottom: vscale(24) },

  unreadBanner: {
    backgroundColor: '#005EB8',
    paddingVertical: mScale(8),
    paddingHorizontal: mScale(16),
    marginHorizontal: mScale(16),
    marginTop: mScale(12),
    borderRadius: mScale(8),
    alignItems: 'center',
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  faxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: mScale(14),
    paddingHorizontal: mScale(16),
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  faxRowUnread: {
    backgroundColor: '#FAFCFF',
  },
  directionIcon: {
    width: mScale(32),
    height: mScale(32),
    borderRadius: mScale(16),
    backgroundColor: '#F0F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: mScale(12),
  },
  directionText: {
    fontSize: 16,
    color: '#757575',
  },
  faxInfo: {
    flex: 1,
  },
  faxNumber: {
    fontSize: 14,
    color: '#212121',
  },
  faxNumberBold: {
    fontWeight: '600',
  },
  faxMeta: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: mScale(8),
    paddingVertical: mScale(2),
    borderRadius: mScale(10),
    marginLeft: mScale(8),
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: vscale(80),
    paddingHorizontal: mScale(32),
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: mScale(16),
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#212121',
    marginBottom: mScale(8),
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
});
