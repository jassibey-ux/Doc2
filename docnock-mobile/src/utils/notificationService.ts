import { navigationRef } from '@navigation';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { resetCall, setFcmToken, store } from '@store';
import { PermissionsAndroid, Platform, AppState } from 'react-native';

const { dispatch } = store;
let pendingNotificationData: any = null;
let badgeCount = 0;

/**
 * Priority notification channel IDs
 */
const CHANNEL_CRITICAL = 'critical_alerts';
const CHANNEL_URGENT = 'urgent_alerts';
const CHANNEL_ROUTINE = 'default';

/**
 * Create priority-based notification channels (Android)
 */
export async function createNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: CHANNEL_CRITICAL,
    name: 'Critical Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    bypassDnd: true,
  });

  await notifee.createChannel({
    id: CHANNEL_URGENT,
    name: 'Urgent Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });

  await notifee.createChannel({
    id: CHANNEL_ROUTINE,
    name: 'Messages',
    importance: AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * 🔹 Get FCM Token
 */
const getFcmToken = async () => {
  try {
    const fcmToken = await messaging().getToken();
    console.log(fcmToken, 'token.....');
    if (fcmToken) {
      dispatch(setFcmToken(fcmToken));
    }
  } catch (error) {
    console.log(error, 'error in fcmToken');
  }
};

/**
 * 🔹 Request User Notification Permission (iOS + Android 13+)
 */
export async function requestUserNotificationPermission(callback = (_value: boolean) => {}) {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: 'Notification Permission',
          message: 'Allow this app to post notifications?',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        getFcmToken();
        callback(false);
      } else {
        callback(true);
      }
    } catch (err) {
      console.log(err);
    }
  } else {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    console.log(enabled, 'Enable status');
    if (enabled) {
      getFcmToken();
      callback(false);
    } else callback(true);
  }
}

/**
 * 🔹 Display Local Notification
 */
async function onDisplayNotification(data: any) {
  if (Platform.OS === 'ios') {
    await notifee.requestPermission({
      alert: true,
      badge: true,
      sound: true,
    });
  }

  // Determine priority from notification data
  const priority: string = data?.data?.priority || 'ROUTINE';
  const channelId = priority === 'CRITICAL' ? CHANNEL_CRITICAL
    : priority === 'URGENT' ? CHANNEL_URGENT
    : CHANNEL_ROUTINE;

  // Ensure channel exists
  await notifee.createChannel({
    id: channelId,
    name: channelId === CHANNEL_CRITICAL ? 'Critical Alerts'
      : channelId === CHANNEL_URGENT ? 'Urgent Alerts'
      : 'Messages',
    importance: priority === 'CRITICAL' || priority === 'URGENT'
      ? AndroidImportance.HIGH
      : AndroidImportance.DEFAULT,
    sound: 'default',
    ...(priority === 'CRITICAL' ? { bypassDnd: true, vibrationPattern: [0, 500, 200, 500, 200, 500] } : {}),
  });

  await notifee.displayNotification({
    title: data?.notification?.title ?? data?.data?.callerName,
    body: data?.notification?.body,
    data: data?.data,
    android: {
      channelId,
      sound: 'default',
      smallIcon: 'ic_launcher',
      ...(priority === 'CRITICAL' ? { color: '#D5281B' } : {}),
      ...(priority === 'URGENT' ? { color: '#D5600A' } : {}),
    },
    ios: {
      sound: 'default',
      badgeCount: badgeCount,
      foregroundPresentationOptions: {
        badge: true,
        sound: true,
        banner: true,
        list: true,
      },
      ...(priority === 'CRITICAL' ? { interruptionLevel: 'critical' as any } : {}),
      ...(priority === 'URGENT' ? { interruptionLevel: 'timeSensitive' as any } : {}),
    },
  });
}

/**
 * 🔹 Increase badge count and update UI
 */
async function increaseBadgeCount() {
  console.log("increaseBadgeCount------------------>")
  badgeCount += 1;
  await notifee.setBadgeCount(badgeCount);
}

/**
 * 🔹 Clear badge count (called when user opens app or chat)
 */
export async function clearBadgeCount() {
  badgeCount = 0;
  await notifee.setBadgeCount(0);
}

/**
 * 🔹 Notification Listener
 */
export const notificationListener = async () => {
  // Foreground notification
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    dispatch(resetCall());
    // Check if chat is open (compare groupId/conversationId in chat state)
    const openChatId = store?.getState()?.chats?.chatGroupId;
    const currentUserId = store?.getState()?.auth?.loginDetails?.profile?._id;
    const data = remoteMessage?.data || {};
    const notificationChatId = data?.groupId || data?.conversationId || data?.chatId || '';
    // For one-to-one messages some servers send senderId; if app stores conversationId as senderId, include that
    const senderId = data?.senderID || data?.senderId || data?.senderid || data?.userId || data?.userid || '';

    if (currentUserId && senderId && String(currentUserId) === String(senderId)) {
      return;
    }

    if (openChatId) {
      if (notificationChatId && openChatId === notificationChatId) {
        return; // same chat open
      }
      if (!notificationChatId && senderId && openChatId === senderId) {
        return; // one-to-one chat open with this sender
      }
    }
    await increaseBadgeCount(); // 🔹 increment badge
    await onDisplayNotification(remoteMessage);
    console.log('Foreground remote notification:', remoteMessage);
  });

  // Background (app in background but not killed)
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('Background notification opened:', remoteMessage);
    if (remoteMessage) {
      clearBadgeCount(); // 🔹 clear badge when opened
      handleNotificationTap(remoteMessage);
    }
  });

  // Killed / Inactive
  messaging()
    .getInitialNotification()
    .then((remoteMessage: any) => {
      console.log("remoteMessage1",remoteMessage)
      if (remoteMessage) {
        clearBadgeCount(); // 🔹 clear badge when app opens
        handleNotificationTap(remoteMessage);
      }
    });

  // Also clear badge when app becomes active
  AppState.addEventListener('change', async state => {
    if (state === 'active') {
      await clearBadgeCount();
    }
  });

  return unsubscribe;
};

/**
 * 🔹 Handle Foreground Notification Tap
 */
export const handleForegroundNotifications = () => {
  return notifee.onForegroundEvent(async ({ type, detail }) => {
    console.log('Foreground Notification Event:', detail);
    switch (type) {
      case EventType.PRESS:
        handleNotificationNavigation(detail?.notification?.data);
        break;

      case EventType.DISMISSED:
        console.log('User dismissed the notification:', detail.notification);
        break;

      default:
        break;
    }
  });
};

/**
 * 🔹 Handle notification tap (background/killed)
 */
export const handleNotificationTap = (remoteMessage: any) => {
  const updateData = {
    title: remoteMessage?.data?.callerName,
    groupId: remoteMessage?.data?.groupId,
    userIds: [{userid: remoteMessage?.data?.userIds}]
  };

  pendingNotificationData = updateData;
  console.log('Tapped Notification Data:', updateData);

  if (navigationRef.isReady()) {
    navigateToChat();
  }
};

/**
 * 🔹 Navigate user when they tap notification
 */
const handleNotificationNavigation = (data: any) => {
  if (!data) return;

  const updateData = {
    title: data?.callerName ?? '',
    groupId: data?.groupId ?? '',
  };

  if (navigationRef.isReady()) {
    navigationRef.navigate('ChatScreen', {
      isEFax: false,
      isGroup: false,
      data: updateData,
    });
  }
};

/**
 * 🔹 Navigate to chat if notification was pending
 */
export const navigateToChat = async () => {
  if (!pendingNotificationData || !navigationRef.isReady()) return;

  await clearBadgeCount(); // 🔹 clear badge when entering chat  
  // Load cached chat (if any) so ChatScreen shows messages immediately,
  // then navigate and trigger a fresh fetch from server on mount.
  try {
    const chatId = pendingNotificationData?.groupId;
    if (chatId) {
      store.dispatch({ type: 'chats/loadChatFromStorage', payload: chatId });
      // small delay to allow state to hydrate
      await new Promise(res => setTimeout(res, 120));
    }
  } catch (e) {
    console.warn('navigateToChat: failed to preload chat', e);
  }

  navigationRef.navigate('ChatScreen', {
    isEFax: false,
    isGroup: false,
    data: pendingNotificationData,
  });

  pendingNotificationData = null;
};
