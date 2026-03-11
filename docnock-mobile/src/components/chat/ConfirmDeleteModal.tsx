import React from 'react';
import {
    Modal,
    View,
    Pressable,
} from 'react-native';
import { BaseText } from '../BaseText';
import { commonStyles } from '@styles';
import { BaseButton } from '../button';
import { mScale, scale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { useTheme } from '@hooks';
import { PersonDetailPopupStyles } from '../PersonDetailPopup';

type ConfirmDeleteModalProps = {
    modalVisible: boolean;
    onDeleteForEveryone?: () => void;
    onDeleteForMe: () => void;
    onCancel: () => void;
    headingTxt?:string;
    subHeadingTxt?:string;
    hasTwoButton?: boolean;
    deleteBtnTxt?:string
};

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
    modalVisible,
    onDeleteForEveryone,
    onDeleteForMe,
    onCancel,
    headingTxt = 'Delete Message?',
    subHeadingTxt = 'Do you want to delete this message?',
    hasTwoButton = false,
    deleteBtnTxt = 'Delete for Me'
}) => {
    const styles = ConfirmDeleteModalStyles();
    const personDetailPopupStyles = PersonDetailPopupStyles();
    return (
        <Modal
            animationType="fade"
            transparent
            visible={modalVisible}
            onRequestClose={onCancel}
        >
            <Pressable
                style={styles.backdrop}
                onPress={onCancel}
            >
                <View style={[personDetailPopupStyles.container]}>
                    <View style={[
                        personDetailPopupStyles.detailContainer,
                        styles.modalInnerContainer
                    ]}>
                        <BaseText
                            style={[styles.centerText, styles.boldText]}
                            numberOfLines={1}
                        >
                            {headingTxt}
                        </BaseText>
                        <BaseText
                            style={[styles.centerText, styles.detailText, styles.halfOpacity]}
                            // numberOfLines={1}
                        >
                            {subHeadingTxt}
                        </BaseText>
                    </View>
                    <View style={styles.buttonContainer}>
                        {!hasTwoButton &&
                            <BaseButton
                                title={`Delete for Everyone`}
                                style={[
                                    styles.buttonStyle,
                                    styles.deleteEveryoneButton,
                                ]}
                                titleStyle={[
                                    styles.buttonTitleStyle,
                                    styles.deleteEveryoneText
                                ]}
                                onPress={onDeleteForEveryone}
                            />
                        }
                        <BaseButton
                            title={deleteBtnTxt}
                            style={[
                                styles.buttonStyle,
                                styles.deleteMeButton,
                            ]}
                            titleStyle={[
                                styles.buttonTitleStyle,
                                styles.deleteMeText
                            ]}
                            onPress={onDeleteForMe}
                        />
                        <BaseButton
                            title={`Cancel`}
                            style={[
                                styles.buttonStyle,
                                styles.cancelButton
                            ]}
                            titleStyle={[
                                styles.buttonTitleStyle,
                                styles.cancelText
                            ]}
                            onPress={onCancel}
                        />
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
};

export const ConfirmDeleteModalStyles = () =>
    useTheme(({ colors }) => ({
        backdrop: {
            ...commonStyles.flex,
            ...commonStyles.centerCenter,
            backgroundColor: colors.blackOpacity05,
        },
        centerText: {
            textAlign: 'center',
        },
        boldText: {
            fontWeight: FontWeights.bold,
            fontSize: FontSizes.size_16,
        },
        detailText: {
            width:'90%',
            fontWeight: FontWeights.regular,
            fontSize: FontSizes.size_14,
        },
        halfOpacity: {
            opacity: 0.7,
            paddingTop: mScale(8),
        },
        modalInnerContainer: {
            paddingTop: mScale(18),
        },
        buttonContainer: {
            gap: mScale(10),
            marginTop: mScale(18),
            ...commonStyles.rowItemCenterJustifyCenter,
        },
        buttonStyle: {
            width: mScale(100),
            height: mScale(45),
            ...commonStyles.centerCenter,
            borderRadius: scale(10),
            paddingHorizontal: mScale(8),
        },
        buttonTitleStyle: {
            fontWeight: FontWeights.semibold,
            fontSize: FontSizes.size_14,
            textTransform: 'capitalize',
            textAlign: 'center',
        },
        deleteEveryoneButton: {
            backgroundColor: colors.redOrange,
        },
        deleteMeButton: {
            backgroundColor: colors.lavender,
            borderColor: colors.redOrange,
            borderWidth: scale(1),
        },
        cancelButton: {
            backgroundColor: colors.loginGraphicTintColor,
        },
        deleteEveryoneText: {
            color: colors.white,
        },
        deleteMeText: {
            color: colors.redOrange,
        },
        cancelText: {
            color: colors.secondary,
        },
    }));

export default ConfirmDeleteModal;
