import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import FlashMessage from 'react-native-flash-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AndroidSoftInputModes,
  KeyboardController,
  KeyboardProvider,
} from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { InitialProcessWrapperState } from './InitialProcessWrapper';
import { ReduxWrapper } from './ReduxWrapper';
import { GlobalLoaderWrapper } from './GlobalLoaderWrapper';
import { PersonDetailPopup } from '../PersonDetailPopup';
import { CallContextProvider } from '@context';
import { CallRibbon } from '../CallRibbon';
import { AudioCallRibbon } from '../AudioCallRibbon';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CallRingerPopup } from '../call';

const queryClient = new QueryClient();

export const AppWrapper = ({ children }: React.PropsWithChildren) => {
  useEffect(() => {
    KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE);

    return () => {
      KeyboardController.setDefaultMode();
    };
  }, []);

  return (
    <ReduxWrapper>
      <QueryClientProvider client={queryClient}>
        <CallContextProvider>
          <SafeAreaProvider>
            <GlobalLoaderWrapper>
              <InitialProcessWrapperState>
                <GestureHandlerRootView>
                  <CallRibbon />
                  <AudioCallRibbon />
                  <KeyboardProvider>{children}</KeyboardProvider>
                  <PersonDetailPopup />
                  <CallRingerPopup />
                </GestureHandlerRootView>
                <FlashMessage
                  position="top"
                  statusBarHeight={StatusBar.currentHeight}
                  duration={5000}
                />
              </InitialProcessWrapperState>
            </GlobalLoaderWrapper>
          </SafeAreaProvider>
        </CallContextProvider>
      </QueryClientProvider>
    </ReduxWrapper>
  );
};
