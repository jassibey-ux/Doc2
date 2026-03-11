import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { axiosAuthClient } from '@api/client';
import { mScale, vscale } from '@utils';

interface PatientContextSheetProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
}

interface PatientLink {
  _id: string;
  pccPatientId: string;
  pccFacilityId?: string;
  patientName?: string;
}

interface PatientSummary {
  demographics?: {
    birthDate?: string;
    gender?: string;
    roomBed?: string;
    admissionDate?: string;
  };
  medications?: Array<{
    drugName?: string;
    description?: string;
    dosage?: string;
  }>;
  vitals?: Array<{
    type: string;
    value: string;
    unit?: string;
    recordedAt?: string;
  }>;
}

export const PatientContextSheet = ({
  visible,
  onClose,
  conversationId,
}: PatientContextSheetProps) => {
  const [loading, setLoading] = useState(false);
  const [patientLink, setPatientLink] = useState<PatientLink | null>(null);
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadPatientContext = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const linkRes = await axiosAuthClient.get(
        `pcc/patient-link/${conversationId}`
      );
      const link = (linkRes as any)?.data?.data;
      if (link) {
        setPatientLink(link);
        try {
          const summaryRes = await axiosAuthClient.get(
            `pcc/patient-summary/${conversationId}`
          );
          setSummary((summaryRes as any)?.data?.data ?? null);
        } catch {
          setSummary(null);
        }
      } else {
        setPatientLink(null);
        setSummary(null);
      }
    } catch {
      setPatientLink(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (visible) {
      loadPatientContext();
    }
  }, [visible, loadPatientContext]);

  const searchPatients = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await axiosAuthClient.get(
        `pcc/search-patients?q=${encodeURIComponent(searchQuery)}`
      );
      setSearchResults((res as any)?.data?.data ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const linkPatient = async (patient: any) => {
    try {
      await axiosAuthClient.post('pcc/link-patient', {
        conversationId,
        pccPatientId: patient.patientId || patient._id,
        pccFacilityId: patient.facilityId,
        patientName: patient.name || patient.fullName,
      });
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      loadPatientContext();
    } catch {}
  };

  const unlinkPatient = async () => {
    try {
      await axiosAuthClient.delete(`pcc/unlink-patient/${conversationId}`);
      setPatientLink(null);
      setSummary(null);
    } catch {}
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.handle} />
                <Text style={styles.headerTitle}>Patient Context</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>Done</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                {loading ? (
                  <ActivityIndicator
                    color="#005EB8"
                    size="large"
                    style={styles.loader}
                  />
                ) : !patientLink ? (
                  /* No linked patient */
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>🔗</Text>
                    <Text style={styles.emptyTitle}>No Patient Linked</Text>
                    <Text style={styles.emptySubtitle}>
                      Link a PointClickCare patient to see their clinical context
                    </Text>
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => setShowSearch(true)}
                    >
                      <Text style={styles.linkBtnText}>Link a Patient</Text>
                    </Pressable>
                  </View>
                ) : (
                  /* Patient linked */
                  <>
                    {/* Patient card */}
                    <View style={styles.patientCard}>
                      <Text style={styles.patientName}>
                        {patientLink.patientName || 'Unknown Patient'}
                      </Text>
                      <Text style={styles.patientId}>
                        PCC ID: {patientLink.pccPatientId}
                      </Text>
                      <TouchableOpacity onPress={unlinkPatient}>
                        <Text style={styles.unlinkText}>Unlink</Text>
                      </TouchableOpacity>
                    </View>

                    {summary ? (
                      <>
                        {/* Demographics */}
                        {summary.demographics && (
                          <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Demographics</Text>
                            {summary.demographics.birthDate && (
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>DOB</Text>
                                <Text style={styles.fieldValue}>
                                  {summary.demographics.birthDate}
                                </Text>
                              </View>
                            )}
                            {summary.demographics.gender && (
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>Gender</Text>
                                <Text style={styles.fieldValue}>
                                  {summary.demographics.gender}
                                </Text>
                              </View>
                            )}
                            {summary.demographics.roomBed && (
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>Room/Bed</Text>
                                <Text style={styles.fieldValue}>
                                  {summary.demographics.roomBed}
                                </Text>
                              </View>
                            )}
                            {summary.demographics.admissionDate && (
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>Admitted</Text>
                                <Text style={styles.fieldValue}>
                                  {summary.demographics.admissionDate}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Medications */}
                        {summary.medications && summary.medications.length > 0 && (
                          <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                              Active Medications
                            </Text>
                            {summary.medications.slice(0, 5).map((med, i) => (
                              <View key={i} style={styles.medItem}>
                                <Text style={styles.medName}>
                                  {med.drugName || med.description}
                                </Text>
                                {med.dosage && (
                                  <Text style={styles.medDose}>{med.dosage}</Text>
                                )}
                              </View>
                            ))}
                            {summary.medications.length > 5 && (
                              <Text style={styles.moreText}>
                                +{summary.medications.length - 5} more
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Vitals */}
                        {summary.vitals && summary.vitals.length > 0 && (
                          <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Recent Vitals</Text>
                            {summary.vitals.slice(0, 3).map((vital, i) => (
                              <View key={i} style={styles.vitalRow}>
                                <Text style={styles.vitalType}>{vital.type}</Text>
                                <Text style={styles.vitalValue}>
                                  {vital.value} {vital.unit}
                                </Text>
                                <Text style={styles.vitalDate}>
                                  {formatDate(vital.recordedAt)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.noSummary}>
                        <Text style={styles.noSummaryText}>
                          Summary unavailable from PointClickCare
                        </Text>
                        <Pressable style={styles.retryBtn} onPress={loadPatientContext}>
                          <Text style={styles.retryBtnText}>Retry</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Search modal */}
              {showSearch && (
                <View style={styles.searchOverlay}>
                  <View style={styles.searchHeader}>
                    <Text style={styles.searchTitle}>Search Patients</Text>
                    <TouchableOpacity onPress={() => setShowSearch(false)}>
                      <Text style={styles.closeBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Patient name..."
                      placeholderTextColor="#BDBDBD"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onSubmitEditing={searchPatients}
                      autoFocus
                    />
                    <Pressable
                      style={styles.searchBtn}
                      onPress={searchPatients}
                      disabled={searchLoading}
                    >
                      {searchLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.searchBtnText}>Search</Text>
                      )}
                    </Pressable>
                  </View>
                  <ScrollView style={styles.searchResults}>
                    {searchResults.map((patient, i) => (
                      <Pressable
                        key={i}
                        style={styles.searchResultItem}
                        onPress={() => linkPatient(patient)}
                      >
                        <Text style={styles.searchResultName}>
                          {patient.name || patient.fullName}
                        </Text>
                        <Text style={styles.searchResultMeta}>
                          {patient.birthDate ? `DOB: ${patient.birthDate}` : ''}
                          {patient.patientId
                            ? ` · ID: ${patient.patientId}`
                            : ''}
                        </Text>
                      </Pressable>
                    ))}
                    {searchResults.length === 0 &&
                      searchQuery.trim() &&
                      !searchLoading && (
                        <Text style={styles.noResults}>No patients found</Text>
                      )}
                  </ScrollView>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: mScale(16),
    borderTopRightRadius: mScale(16),
    maxHeight: '75%',
    minHeight: '40%',
  },
  header: {
    alignItems: 'center',
    paddingVertical: mScale(12),
    paddingHorizontal: mScale(16),
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginBottom: mScale(8),
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  closeBtn: {
    position: 'absolute',
    right: mScale(16),
    top: mScale(16),
  },
  closeBtnText: {
    fontSize: 14,
    color: '#005EB8',
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: mScale(16),
    paddingTop: mScale(16),
    paddingBottom: mScale(32),
  },
  loader: {
    marginTop: vscale(40),
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: vscale(24),
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: mScale(12),
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: mScale(6),
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: mScale(16),
    paddingHorizontal: mScale(16),
  },
  linkBtn: {
    backgroundColor: '#005EB8',
    borderRadius: 8,
    paddingHorizontal: mScale(24),
    paddingVertical: mScale(12),
  },
  linkBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Patient card
  patientCard: {
    backgroundColor: '#E3F0FF',
    borderRadius: 8,
    padding: mScale(14),
    marginBottom: mScale(16),
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  patientId: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  unlinkText: {
    fontSize: 12,
    color: '#D5281B',
    marginTop: mScale(8),
  },

  // Sections
  section: {
    marginBottom: mScale(16),
    paddingBottom: mScale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F5',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#757575',
    marginBottom: mScale(8),
    letterSpacing: 0.5,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#757575',
  },
  fieldValue: {
    fontSize: 13,
    color: '#212121',
    fontWeight: '500',
  },
  medItem: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  medName: {
    fontSize: 13,
    color: '#212121',
    fontWeight: '500',
  },
  medDose: {
    fontSize: 12,
    color: '#757575',
  },
  moreText: {
    fontSize: 12,
    color: '#005EB8',
    marginTop: 4,
  },
  vitalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  vitalType: {
    fontSize: 13,
    color: '#757575',
    minWidth: 60,
  },
  vitalValue: {
    fontSize: 13,
    color: '#212121',
    fontWeight: '500',
    flex: 1,
  },
  vitalDate: {
    fontSize: 11,
    color: '#BDBDBD',
  },
  noSummary: {
    alignItems: 'center',
    paddingVertical: mScale(16),
  },
  noSummaryText: {
    fontSize: 13,
    color: '#757575',
    marginBottom: mScale(8),
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: '#005EB8',
    borderRadius: 8,
    paddingHorizontal: mScale(16),
    paddingVertical: mScale(8),
  },
  retryBtnText: {
    fontSize: 13,
    color: '#005EB8',
    fontWeight: '500',
  },

  // Search overlay
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: mScale(16),
    borderTopRightRadius: mScale(16),
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: mScale(16),
    paddingVertical: mScale(14),
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: mScale(16),
    paddingVertical: mScale(12),
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#AAAAAA',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#212121',
  },
  searchBtn: {
    width: 72,
    height: 44,
    backgroundColor: '#005EB8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  searchResults: {
    flex: 1,
    paddingHorizontal: mScale(16),
  },
  searchResultItem: {
    paddingVertical: mScale(12),
    paddingHorizontal: mScale(12),
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    marginBottom: 8,
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  searchResultMeta: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  noResults: {
    textAlign: 'center',
    paddingVertical: mScale(24),
    color: '#757575',
    fontSize: 14,
  },
});
