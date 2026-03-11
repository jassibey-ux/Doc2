import { createNavigationContainerRef, useRoute } from '@react-navigation/native';
import { BottomTabNavigationOptions, BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RouteProp, useNavigation } from '@react-navigation/native';
import {
  NativeStackNavigationOptions,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type NavigateParams = Parameters<typeof navigationRef.navigate>;

class NavigationService {
  /**
   * Navigate to a route in the application
   * @param name Route name
   * @param params Route parameters
   */
  navigate(name: NavigateParams[0], params?: NavigateParams[1]) {
    if (navigationRef.isReady()) {
      navigationRef.navigate(name, params);
    } else {
      // Add logging here for debugging
      console.warn('Navigation attempted before navigator was ready');
    }
  }

  /**
   * Go back to the previous route
   */
  goBack() {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }

  /**
   * Reset the navigation state to the provided state
   * @param routes Array of routes to reset to
   */
  reset(routes: { name: keyof RootStackParamList; params?: never }[]) {
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: routes.length - 1,
        routes,
      });
    }
  }

  /**
   * Get the current route name
   */
  getCurrentRoute() {
    if (navigationRef.isReady()) {
      return navigationRef.getCurrentRoute()?.name;
    }
    return null;
  }

  /**
   * Get the current route params
   */
  getCurrentParams() {
    if (navigationRef.isReady()) {
      return navigationRef.getCurrentRoute()?.params;
    }
    return null;
  }
}

const navigationService = new NavigationService();

export { navigationService };

export const useCustomNavigation = <T extends keyof RootStackParamList>() => {
  type Props = BottomTabScreenProps<RootStackParamList, T> &
    NativeStackScreenProps<RootStackParamList, T>;
  type ScreenNavigationProp = Props['navigation'];

  return useNavigation<ScreenNavigationProp>();
};

export const useCustomRoute = <RouteName extends keyof RootStackParamList>() =>
  useRoute<RouteProp<RootStackParamList, RouteName>>();

export const defaultNavigationOptions: NativeStackNavigationOptions & BottomTabNavigationOptions = {
  headerShown: false,
};
