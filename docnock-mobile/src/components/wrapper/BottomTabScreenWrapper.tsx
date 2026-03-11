import React, { useCallback, useState } from 'react';
import { ScreenWrapper } from './ScreenWrapper';
import { commonStyles } from '@styles';
import { useAppSelector, useTheme } from '@hooks';
import { scale } from 'react-native-size-matters/extend';
import { FontSizes, FontWeights } from '@theme';
import { mScale } from '@utils';
import { DashBoardHeader, DashBoardHeaderProps } from '../header';
import { View } from 'react-native';
import { BaseText } from '../BaseText';
import { SearchInput, SearchInputProps } from '../input';
import { ScrollViewContentStyles } from '@types';
import { CenterLoader } from '../loader';
import { SvgIconButton } from '../button';

export type BottomTabScreenWrapperProps = {
  children?: React.ReactNode;
  dashboard?: boolean;
  onSearchCallBack?: SearchInputProps['onSearchCallBack'];
  onClearSearch?: SearchInputProps['onClearSearch'];
  title?: string;
  containerStyle?: ScrollViewContentStyles;
  searchPlaceholder?: string;
  isLoading?: boolean;
  isSearching?: boolean;
  headerProps?: DashBoardHeaderProps;
  enablePlusButton?: boolean;
  onPressPlusButton?: () => void;
  renderSearchTopComponent?: () => JSX.Element;
};

export const BottomTabScreenWrapper = ({
  children,
  dashboard,
  onSearchCallBack,
  title,
  containerStyle,
  searchPlaceholder = 'Search...',
  isLoading,
  onClearSearch = () => {},
  isSearching = false,
  headerProps = {},
  enablePlusButton = false,
  onPressPlusButton,
  renderSearchTopComponent,
}: BottomTabScreenWrapperProps) => {
  const { loginDetails } = useAppSelector(state => state.auth);
  const [searchText, setSearchText] = useState('');

  const styles = BottomTabScreenWrapperStyles();

  const renderCenterComponent = useCallback(() => {
    return (
      <View style={styles.centerComponentContainer}>
        <BaseText style={styles.centerComponentHeader} numberOfLines={1}>
          {loginDetails?.profile?.fullName ?? `N/A`}
        </BaseText>
        <BaseText style={styles.centerComponentSubHeader} numberOfLines={2}>
          {loginDetails?.profile?.address?.toString() ?? `N/A`}
        </BaseText>
      </View>
    );
  }, [
    loginDetails?.profile?.address,
    loginDetails?.profile?.fullName,
    styles.centerComponentContainer,
    styles.centerComponentHeader,
    styles.centerComponentSubHeader,
  ]);

  return (
    <ScreenWrapper
      enableBottomSafeArea={false}
      style={[commonStyles.flex, styles.container]}
      enableTopSafeArea={false}
    >
      {isLoading && <CenterLoader visible={isLoading} />}
      <DashBoardHeader
        headerText={title}
        renderCenterComponent={dashboard ? renderCenterComponent : undefined}
        {...headerProps}
      />
      {renderSearchTopComponent && renderSearchTopComponent()}
      <View style={[commonStyles.rowItemsCenter, styles.searchBarContainer]}>
        <SearchInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder={searchPlaceholder}
          loading={isSearching}
          {...{ onSearchCallBack, onClearSearch }}
          {...(enablePlusButton ? { containerStyle: commonStyles.flex } : {})}
        />
        {enablePlusButton && <SvgIconButton icon="PlusRoundGreenBg" onPress={onPressPlusButton} />}
      </View>
      <View style={[commonStyles.flex, containerStyle]}>{children}</View>
    </ScreenWrapper>
  );
};

export const BottomTabScreenWrapperStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      flex: 1,
      backgroundColor: colors.primary,
      paddingHorizontal: scale(16),
    },
    centerComponentContainer: {
      flex: 1,
      maxWidth: '68%',
      gap: mScale(3),
    },
    centerComponentHeader: {
      fontWeight: FontWeights.bold,
      fontSize: FontSizes.size_16,
      color: colors.text,
      letterSpacing: 0.2,
    },
    centerComponentSubHeader: {
      fontWeight: FontWeights.regular,
      fontSize: FontSizes.size_12,
      color: colors.text,
      opacity: 0.55,
      lineHeight: mScale(16),
    },
    searchBarContainer: {
      marginBottom: mScale(14),
      width: '100%',
      gap: mScale(12),
    },
  }));
