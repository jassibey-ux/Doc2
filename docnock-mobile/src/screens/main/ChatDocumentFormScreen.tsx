import React, { useState } from 'react';
import { View } from 'react-native';
import {
  BaseButton,
  FormInput,
  BaseText,
  BaseTouchable,
  DashBoardHeader,
  KeyboardAwareWrapper,
  ScreenWrapper,
  SvgIconButton,
  FormDateInput
} from '@components';
import { useTheme } from '@hooks';
import { CommunicationFormHTML, getPDF, mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { commonStyles } from '@styles';
import { renderLeftComponent } from './AllNurseList';
import { ImagesPreviewScreenStyles } from './ImagesPreviewScreen';
import { useCustomNavigation, useCustomRoute } from '@navigation';
import { setLoader } from '@store';

/* ================= OPTIONS ================= */

export type OptionType = {
  value: string;
  title?: string;
};

export const REASON_FOR_MESSAGE_OPTIONS: OptionType[] = [
  { value: 'changeInCondition', title: 'Change in condition' },
  { value: 'abnormalVitalSigns', title: 'Abnormal vital signs' },
  { value: 'pain', title: 'Pain' },
  { value: 'fall', title: 'Fall' },
  { value: 'newSymptom', title: 'New symptom' },
  { value: 'woundIssue', title: 'Wound issue' },
  { value: 'medicationRelated', title: 'Medication-related' },
  { value: 'labResultConcern', title: 'Lab/result concern' },
  { value: 'otherReason', title: 'Other' },
];

export const REQUEST_ACTION_OPTIONS: OptionType[] = [
  { value: 'provideOrders', title: 'Provide orders' },
  { value: 'reviewLabsResults', title: 'Review labs/results' },
  { value: 'callBack', title: 'Call back' },
  { value: 'other', title: 'Other' },
];

/* ================= SCREEN ================= */

export const ChatDocumentFormScreen = () => {
  const navigation = useCustomNavigation();
  const route = useCustomRoute<'ChatDocumentFormScreen'>();
  const chatId = route?.params?.chatId;

  const [selectedReason, setSelectedReason] = useState<OptionType[]>([]);
  const [selectedAction, setSelectedAction] = useState<OptionType[]>([]);
  const [data, setData] = useState<any>({});
  const [errors, setErrors] = useState<any>({});

  const styles = Styles();
  const imagesPreviewStyles = ImagesPreviewScreenStyles();

  /* ================= INPUT ================= */
  const handleDobChange = (text: string) => {
    console.log('onChangeTexttext', text)
    let cleaned = text.replace(/\D/g, "");

    let mm = cleaned.slice(0, 2);
    let dd = cleaned.slice(2, 4);
    let yyyy = cleaned.slice(4, 8);

    // Clamp month
    if (mm.length === 2) {
      const month = parseInt(mm, 10);
      if (month > 12) mm = "12";
      if (month === 0) mm = "01";
    }

    // Clamp day
    if (dd.length === 2) {
      const day = parseInt(dd, 10);
      if (day > 31) dd = "31";
      if (day === 0) dd = "01";
    }

    const formatted =
      mm +
      (dd ? "/" + dd : "") +
      (yyyy ? "/" + yyyy : "");
    setData((p: any) => ({ ...p, dob: formatted }));
    setErrors((p: any) => ({ ...p, dob: '' }));
  };

  const renderInput = (
    field: string,
    title?: string,
    prefix?: string,
    suffix?: string,
    outerRightText?: string,
    multiline?: boolean,
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad',
  ) => {
    const InputComponent = title === 'DOB' ? FormDateInput : FormInput;
    return (
      <>
        <InputComponent
          title={title}
          prefix={prefix}
          suffix={suffix}
          multiline={multiline}
          containerStyle={[
            styles.inputContainer,
            commonStyles.flex,
            title === 'O2' ? styles.leftSpacing : {},
          ]}
          {...(outerRightText
            ? {
                renderOuterRightComponent: () => (
                  <BaseText style={styles.outerRightText}>{outerRightText}</BaseText>
                ),
              }
            : {})}
          value={field === 'dob' ? data.dob : data[field]}
          onChangeText={field === 'dob' ? handleDobChange : (text: string) => {
            setData((p: any) => ({ ...p, [field]: text }));
            setErrors((p: any) => ({ ...p, [field]: '' }));
          }}
          keyboardType={keyboardType}
          placeholder={field === 'dob' ? 'MM/DD/YYYY' : undefined}
        />
        {!!errors[field] && <BaseText style={styles.errorText}>{errors[field]}</BaseText>}
      </>
    );
  };

  /* ================= OPTIONS ================= */

  const toggleOption = (
    option: OptionType,
    list: OptionType[],
    setter: Function,
    errorKey: string,
  ) => {
    setter((prev: OptionType[]) =>
      prev.find(i => i.value === option.value)
        ? prev.filter(i => i.value !== option.value)
        : [...prev, option],
    );
    setErrors((p: any) => ({ ...p, [errorKey]: '' }));
  };

  const renderOption = (type: 'reason' | 'action', option: OptionType) => {
    const list = type === 'reason' ? selectedReason : selectedAction;
    const isSelected = list.some(i => i.value === option.value);

    return (
      <BaseTouchable
        key={option.value}
        style={[commonStyles.rowItemCenterJustifyStart, styles.optionContainer]}
        onPress={() =>
          toggleOption(
            option,
            list,
            type === 'reason' ? setSelectedReason : setSelectedAction,
            type,
          )
        }
      >
        <SvgIconButton icon={isSelected ? 'SelectFilledGreen' : 'SelectOutline'} />
        <BaseText style={styles.optionTitle}>{option.title}</BaseText>
      </BaseTouchable>
    );
  };

  const isOtherReasonSelected = selectedReason.some(i => i.value === 'otherReason');
  const isOtherActionSelected = selectedAction.some(i => i.value === 'other');

  /* ================= VALIDATION ================= */

  const validate = () => {
    const temp: any = {};

    if (!data?.name) temp.name = 'Name is required';
    if (!data?.room) temp.room = 'Room is required';
    if (!data?.dob) temp.dob = 'DOB is required';

    if (!selectedReason.length) temp.reason = 'Please select at least one reason';

    if (isOtherReasonSelected && !data?.otherReasonString)
      temp.otherReasonString = 'Other reason is required';

    if (!data?.summaryOfConcern) temp.summaryOfConcern = 'Summary of concern is required';

    if (!selectedAction.length) temp.action = 'Please select at least one action';

    if (isOtherActionSelected && !data?.otherActionString)
      temp.otherActionString = 'Other action is required';

    setErrors(temp);
    return Object.keys(temp).length === 0;
  };

  /* ================= SUBMIT ================= */

  const onSubmitPdf = async () => {
    if (!validate()) return;

    setLoader(true);
    let html = `${CommunicationFormHTML}`;

    Object.entries(data).forEach(([key, value]: any) => {
      if (!value) return;
      if (['summaryOfConcern', 'providerResponse'].includes(key)) {
        html = html.replace(`id="${key}">`, `id="${key}">${value}`);
      } else {
        html = html.replace(`id="${key}"`, `id="${key}" value="${value}"`);
      }
    });

    selectedReason.forEach(item => {
      html = html.replace(`id="checkbox_${item.value}"`, `id="checkbox_${item.value}" checked`);
    });

    selectedAction.forEach(item => {
      html = html.replace(`id="checkbox_${item.value}"`, `id="checkbox_${item.value}" checked`);
    });

    const file = await getPDF(html);
    setLoader(false);

    if (file) {
      navigation.navigate('DocumentPreviewScreen', {
        documents: [
          {
            fileName: `form_${Date.now()}.pdf`,
            uri: file,
            type: 'application/pdf',
          },
        ],
        chatId,
        showChatInput: true,
        isForm: true,
      });
    }
  };

  /* ================= UI ================= */

  return (
    <ScreenWrapper enableBottomSafeArea={false} enableTopSafeArea={false} style={commonStyles.flex}>
      <DashBoardHeader
        headerText="Communication Form"
        disableRightComponent
        renderLeftComponent={renderLeftComponent}
        containerStyle={[imagesPreviewStyles.headerContainerStyle, styles.headerContainerStyle]}
      />

      <KeyboardAwareWrapper style={[styles.container, commonStyles.flex]}>
        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>1. Patient Info</BaseText>
          {renderInput('name', 'Name')}
          {renderInput('room', 'Room', '#')}
          {renderInput('dob', 'DOB')}
        </View>

        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>2. Reason for Message</BaseText>
          {REASON_FOR_MESSAGE_OPTIONS.map(o => renderOption('reason', o))}
          {!!errors.reason && <BaseText style={styles.errorText}>{errors.reason}</BaseText>}
          {isOtherReasonSelected && renderInput('otherReasonString', 'Other Reason')}
        </View>

        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>3. Summary of Concern</BaseText>
          {renderInput('summaryOfConcern', undefined, undefined, undefined, undefined, true)}
        </View>

        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>4. Most Recent Vital Signs (if applicable)</BaseText>
          {renderInput('bp', 'BP', undefined, 'mmHg', undefined, false, 'numeric')}
          {renderInput('hr', 'HR', undefined, 'bpm', undefined, false, 'numeric')}
          {renderInput('rr', 'RR', undefined, '', undefined, false, 'numeric')}
          {renderInput('temp', 'Temp', undefined, '°F', undefined, false, 'numeric')}
          <View style={commonStyles.rowItemsCenter}>
            {renderInput('spo2', 'SpO2', undefined, '%', ' on ', false, 'numeric')}
            {renderInput('o2', 'O2', undefined, 'L/min', undefined, false, 'numeric')}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>5. Actions Already Taken</BaseText>
          {renderInput('actionAlreadyTaken')}
        </View>

        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>6. Requested Action from Provider</BaseText>
          {REQUEST_ACTION_OPTIONS.map(o => renderOption('action', o))}
          {!!errors.action && <BaseText style={styles.errorText}>{errors.action}</BaseText>}
          {isOtherActionSelected && renderInput('otherActionString', 'Other Action')}
        </View>

        <View style={styles.sectionCard}>
          <BaseText style={styles.sectionTitle}>7. Provider Response</BaseText>
          {renderInput('providerResponse', undefined, undefined, undefined, undefined, true)}
        </View>

        <BaseButton title="Submit" style={styles.submitButton} onPress={onSubmitPdf} />
      </KeyboardAwareWrapper>
    </ScreenWrapper>
  );
};

/* ================= STYLES ================= */

const Styles = () =>
  useTheme(({ colors, theme }) => ({
    container: {
      marginHorizontal: mScale(18),
    },
    headerContainerStyle: {
      marginBottom: mScale(6),
    },
    sectionCard: {
      backgroundColor: theme === 'light' ? colors.white : colors.inputBackground,
      borderRadius: mScale(18),
      paddingHorizontal: mScale(14),
      paddingVertical: mScale(12),
      marginBottom: mScale(12),
      borderWidth: theme === 'light' ? 1 : 0,
      borderColor: theme === 'light' ? colors.searchInputBackground : 'transparent',
    },
    sectionTitle: {
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_18,
      marginTop: mScale(2),
      marginBottom: mScale(10),
      color: colors.text,
    },
    inputContainer: {
      marginVertical: mScale(3),
    },
    outerRightText: {
      fontSize: FontSizes.size_14,
      marginHorizontal: mScale(8),
      color: colors.inputPlaceHolder,
    },
    leftSpacing: {
      flex: 0.8,
    },
    optionContainer: {
      gap: mScale(10),
      marginVertical: mScale(3),
      alignSelf: 'stretch',
      paddingHorizontal: mScale(6),
      paddingVertical: mScale(8),
      borderRadius: mScale(12),
      backgroundColor: theme === 'light' ? colors.searchInputBackground : colors.iconButtonBackground,
    },
    optionTitle: {
      fontSize: FontSizes.size_16,
      color: colors.text,
    },
    submitButton: {
      alignSelf: 'center',
      marginTop: mScale(8),
      marginBottom: mScale(24),
      minWidth: mScale(170),
    },
    errorText: {
      color: colors.redOrange,
      fontSize: FontSizes.size_12,
      marginBottom: mScale(6),
    },
  }));
