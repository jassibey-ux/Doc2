import messaging from '@react-native-firebase/messaging';
import { AppRegistry, Text } from 'react-native';
import RNVoipCall from 'react-native-voips-calls';
import { name as appName } from './app.json';
import App from './src/App';
import { clearIncomingCallData, resetCall, setIncomingCallData, store } from './src/store/index';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage.data);
  const toBoolean = value => value === 'true';
  const normalizeType = value => (value || '').toString().trim().toLowerCase();
  let data = { ...remoteMessage?.data };
  data.audio = toBoolean(data.audio);
  data.isGroup = toBoolean(data.isGroup);
  const messageType = normalizeType(data.type || data.event || data.action);
  if (data?.activegrouuserids) {
    try {
      data.activegrouuserids = JSON.parse(data.activegrouuserids);
    } catch (e) {
      console.log('❌ Error parsing activegrouuserids', e);
      data.activegrouuserids = [];
    }
  }
  if (data && messageType === 'incoming_call' && data.uuid) {
    let callOptions = {
      callerId: data.uuid,
      ios: {
        phoneNumber: '12344',
        name: data.callerName,
        hasVideo: !data.audio ,
        PriorityType: 'high'
      },
      android: {
        ringtuneSound: true,
        ringtune: 'ringtune',
        duration: 30000,
        vibration: true,
        channel_name: 'call',
        notificationId: 1123,
        notificationTitle: 'Incoming Call',
        notificationBody: `${data.callerName} is calling...`,
        answerActionTitle: 'Answer',
        declineActionTitle: 'Decline',
        PriorityType: 'high',
      },
    };

    // Store the call data for when app becomes active
    try {
      store.dispatch(resetCall());
      store.dispatch(setIncomingCallData({ uuid: data.uuid, data }));
    } catch (error) {
      console.log('Error dispatching call data:', error);
    }

    RNVoipCall.displayIncomingCall(callOptions)
      .then(() => {
        console.log('✅ Incoming voip call displayed successfully');
      })
      .catch(e => {
        console.error('❌ Error in displaying voip call:', e);
      });
    return;
  }

  // Handle cancellation while app is backgrounded/killed.
  const cancelTypes = ['callcancelled', 'call_cancelled', 'callcancel', 'cancelcall'];
  if (data && cancelTypes.includes(messageType)) {
    try {
      if (data.uuid) {
        await RNVoipCall.endCall(data.uuid);
      }
      await RNVoipCall.endAllCalls();
      store.dispatch(resetCall());
      store.dispatch(clearIncomingCallData());
      console.log('✅ Incoming voip call cleared from cancel push');
    } catch (e) {
      console.error('❌ Error while clearing voip call from cancel push:', e);
    }
  }
});

// Disable font scaling
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.allowFontScaling = false;

AppRegistry.registerComponent(appName, () => App);
