/**
 * SCENSUS Companion — Mobile App Entry Point
 *
 * Simple navigation: Connect → Session List → Session Detail (Geotag / SDR)
 */

import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { GeotagScreen } from './src/screens/GeotagScreen';
import { SDRScreen } from './src/screens/SDRScreen';

type Screen =
  | { name: 'connect' }
  | { name: 'sessions' }
  | { name: 'geotag'; sessionId: string }
  | { name: 'sdr'; sessionId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'connect' });

  const renderScreen = () => {
    switch (screen.name) {
      case 'connect':
        return <ConnectScreen onConnected={() => setScreen({ name: 'sessions' })} />;
      case 'sessions':
        return (
          <SessionScreen
            onSelectSession={(id) => setScreen({ name: 'geotag', sessionId: id })}
          />
        );
      case 'geotag':
        return <GeotagScreen sessionId={screen.sessionId} />;
      case 'sdr':
        return <SDRScreen sessionId={screen.sessionId} />;
    }
  };

  return (
    <>
      <StatusBar style="light" />
      {renderScreen()}
    </>
  );
}
