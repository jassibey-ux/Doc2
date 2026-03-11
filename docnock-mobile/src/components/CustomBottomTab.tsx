import React from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { NavigationRoute, ParamListBase } from '@react-navigation/native';
import { Svg, Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SvgIcons } from '@assets';
import { BottomTabParamList } from '@navigation';
import { mScale, vscale } from '@utils';
import { commonStyles } from '@styles';
import { useAppSelector } from '@hooks';
import { store } from '@store';
import { BaseTouchable, SvgIconButton } from './button';

const { width } = Dimensions.get('screen');
const CIRCLE_RADIUS = mScale(36);

const BOTTOM_TAB_ICON_MAP: Record<keyof BottomTabParamList, keyof typeof SvgIcons> = {
  Dashboard: 'Dashboard',
  Chats: 'Chats',
  Nurses: 'Nurses',
  Physicians: 'Physicians',
  EFax: 'EFax',
};

const CroppedTabBar = ({ borderRadius = 22, hasBottomInset = false }) => {
  // Calculate the center point
  const centerX = width / 2 - 0.5;

  // Calculate circle position
  const circleWidth = CIRCLE_RADIUS * 2;
  const circleStartX = centerX - CIRCLE_RADIUS;
  const { colors } = useAppSelector(state => state.theme);

  const generatePath = () => {
    return `
      M${centerX} ${CIRCLE_RADIUS}
      C${centerX + CIRCLE_RADIUS} ${CIRCLE_RADIUS} 
        ${circleStartX + circleWidth} 0 
        ${circleStartX + circleWidth} 0
      H${width - borderRadius}
      C${width - borderRadius / 2} 0 ${width} ${borderRadius / 2} ${width} ${borderRadius}
      V${mScale(90)}
      H0
      V${borderRadius}
      C0 ${borderRadius / 2} ${borderRadius / 2} 0 ${borderRadius} 0
      H${circleStartX}
      C${circleStartX} 0 ${centerX - CIRCLE_RADIUS} ${CIRCLE_RADIUS} ${centerX} ${CIRCLE_RADIUS}
      Z
    `;
  };

  return (
    <View
      style={[styles.croppedBarContainer, hasBottomInset ? styles.croppedBarContainerInset : {}]}
    >
      <Svg width={width} height={hasBottomInset ? mScale(90) : mScale(70)}>
        <Path
          d={generatePath()}
          fill={colors?.inputBackground}
          fillRule="evenodd"
          clipRule="evenodd"
        />
      </Svg>
    </View>
  );
};

const NurseTabBar = ({ hasBottomInset = false }) => {
  const { colors } = useAppSelector(state => state.theme);

  return (
    <View
      style={[
        styles.croppedBarContainer,
        hasBottomInset ? styles.croppedBarContainerInset : {},
        styles.nurseBarContainer,
        {
          backgroundColor: colors.inputBackground,
        },
      ]}
    />
  );
};

export const renderCustomBottomTab = ({ state, navigation, insets }: BottomTabBarProps) => {
  const bottomInset = insets.bottom;
  const hasBottomInset = !!insets.bottom;
  const role = store.getState().auth.loginDetails?.role;
  const isNurse = role === 'nurse';

  const renderRoutes = (route: NavigationRoute<ParamListBase, string>, index: number) => {
    const onPress = () => {
      navigation.navigate('BottomTabNavigator', {
        screen: route.name,
      });
    };

    const white = store.getState().theme.colors.white;
    const selectedTabTint = store.getState().theme.colors.tint;
    const nonSelectedTabTint = store.getState().theme.colors.secondary;
    const nonSelectedDashBoardBg = store.getState().theme.colors.inputBackground;

    if (isNurse && ['Dashboard'].includes(route.name)) {
      return null;
    }

    return (
      <BaseTouchable
        style={[
          styles.platformPressableStyle,
          hasBottomInset ? styles.insetPlatformPressableStyle : {},
          route.name === 'Dashboard'
            ? [
                styles.dashBoardPressableStyle,
                hasBottomInset ? styles.insetDashBoardPressableStyle : {},
              ]
            : {},
        ]}
        onPress={onPress}
        key={'BottomTab' + route.name}
      >
        <SvgIconButton
          icon={BOTTOM_TAB_ICON_MAP[route.name as keyof typeof BOTTOM_TAB_ICON_MAP]}
          style={
            route.name === 'Dashboard'
              ? [
                  styles.dashBoardIconStyle,
                  {
                    backgroundColor:
                      state.index === index ? selectedTabTint : nonSelectedDashBoardBg,
                  },
                ]
              : {}
          }
          iconProps={{
            color:
              state.index === index
                ? route.name === 'Dashboard'
                  ? white
                  : selectedTabTint
                : nonSelectedTabTint,
          }}
        />
      </BaseTouchable>
    );
  };

  const routes = state?.routes;

  return (
    <View style={styles.container}>
      {isNurse ? (
        <NurseTabBar hasBottomInset={hasBottomInset} />
      ) : (
        <CroppedTabBar hasBottomInset={hasBottomInset} />
      )}
      <View
        style={[
          commonStyles.row,
          styles.bottomTabItemRowContainer,
          {
            paddingBottom: bottomInset,
          },
        ]}
      >
        {(routes ?? []).map(renderRoutes)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  croppedBarContainer: {
    width,
    height: mScale(70),
    position: 'absolute',
    zIndex: 1,
    bottom: -mScale(1),
  },
  croppedBarContainerInset: {
    height: mScale(90),
  },
  nurseBarContainer: {
    borderTopLeftRadius: mScale(22),
    borderTopRightRadius: mScale(22),
  },
  bottomTabItemRowContainer: {
    zIndex: 2,
    alignItems: 'flex-end',
    paddingHorizontal: mScale(6),
  },
  platformPressableStyle: {
    flex: 1,
    alignItems: 'center',
    marginBottom: vscale(24),
  },
  insetPlatformPressableStyle: {
    marginBottom: vscale(8),
  },
  dashBoardPressableStyle: {
    paddingTop: 0,
    marginBottom: Platform.OS === 'android' ? mScale(38) : vscale(46),
  },
  insetDashBoardPressableStyle: {
    marginBottom: vscale(26),
  },
  dashBoardIconStyle: {
    height: mScale(61),
    width: mScale(61),
    borderRadius: mScale(61),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
