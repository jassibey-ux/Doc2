import React, { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { commonStyles } from '@styles';
import { mScale } from '@utils';
import { useTheme } from '@hooks';
import { useCustomNavigation } from '@navigation';
import { BaseTouchable, SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import { PhotosItemChatStyles } from './PhotosItemChat';
import { ChatItemAttachmentType } from '@store';

// Helper to extract filename from URL or data
const getAttachmentDisplayName = (attachment?: ChatItemAttachmentType): string => {
  // If name is already set and meaningful, use it
  if (attachment?.name && attachment.name.length > 0) {
    // But skip generic names like "attachment.png" from URL
    if (!attachment.name.toLowerCase().startsWith('attachment.')) {
      return attachment.name;
    }
  }
  
  // Try to extract from data URL
  const dataUrl = attachment?.data || '';
  if (dataUrl) {
    // Try to get filename from URL path
    const urlParts = dataUrl.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    
    // Remove query params if any
    const cleanName = lastPart?.split('?')[0];
    
    // Check if it's a meaningful name (not just generic)
    if (cleanName && cleanName.length > 0 && !cleanName.toLowerCase().startsWith('attachment.')) {
      return decodeURIComponent(cleanName);
    }
  }
  
  // Get extension from type
  const type = attachment?.type || '';
  const ext = type.includes('/') ? type.split('/')[1] : type;
  const extDisplay = ext ? `.${ext}` : '';
  
  return `Document${extDisplay}`;
};

export const DocumentItemChat = ({
  documents,
  self,
}: {
  documents: ChatItemAttachmentType[];
  self: boolean;
}) => {
  const styles = DocumentItemChatStyles();
  const imageStyles = PhotosItemChatStyles();
  const isSingle = documents.length === 1;
  const navigation = useCustomNavigation();

  const remainingCounts = (documents?.length ?? 0) - 4;
  const showImagesArray =
    remainingCounts > 0 ? [...documents.slice(0, 3), { isFillIn: true }] : documents;

  const onPressItem = (index: number) => {
    navigation.navigate('DocumentPreviewScreen', {
      documents,
      isEdit: true,
      initialIndex: index,
    });
  };

  const renderDoc = ({
    item: { isFillIn },
    index,
  }: {
    item: ChatItemAttachmentType & { isFillIn?: boolean };
    index: number;
  }) => {
    return !isFillIn ? (
      <SvgIconButton
        icon="ChatAttachments"
        style={[
          commonStyles.centerCenter,
          imageStyles.image,
          self ? styles.attachmentBackground : styles.otherAttachmentBackground,
        ]}
        onPress={onPressItem.bind(this, index)}
      />
    ) : (
      <BaseTouchable
        onPress={onPressItem.bind(this, index)}
        style={[imageStyles.image, commonStyles.centerCenter, imageStyles.remainingCountBackground]}
      >
        <BaseText style={imageStyles.remainingCount}>+{remainingCounts + 1}</BaseText>
      </BaseTouchable>
    );
  };

  const singleDoc = documents?.[0];
  const displayName = useMemo(() => getAttachmentDisplayName(singleDoc), [singleDoc]);

  return isSingle ? (
    <BaseTouchable
      style={[commonStyles.rowItemsCenter, styles?.container, !self ? styles.otherStyle : {}]}
      onPress={onPressItem.bind(this, 0)}
    >
      <SvgIconButton icon="ChatAttachments" />
      <BaseText style={styles.name} numberOfLines={1}>
        {displayName}
      </BaseText>
      {/* <BaseText>.pdf</BaseText> */}
    </BaseTouchable>
  ) : (
    <View style={[commonStyles.rowItemCenterJustifyCenter]}>
      <FlatList data={showImagesArray} numColumns={2} renderItem={renderDoc} />
    </View>
  );
};

export const DocumentItemChatStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.inputBackground,
      gap: mScale(8),
      padding: mScale(15),
      paddingHorizontal: mScale(16),
      borderRadius: mScale(12),
      flexShrink: 1,
    },
    otherStyle: {
      backgroundColor: colors.primary,
    },
    name: {
      flexShrink: 1,
    },
    otherAttachmentBackground: {
      backgroundColor: colors.searchInputBackground,
    },
    attachmentBackground: {
      backgroundColor: colors.inputBackground,
    },
  }));
