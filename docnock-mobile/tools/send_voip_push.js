/*
Simple APNs VoIP push sender using `apn`.
Usage:
  1. Install dependency: `npm install apn`
  2. Edit the constants below (KEY_PATH, KEY_ID, TEAM_ID, BUNDLE_ID, DEVICE_TOKEN)
  3. Run: `node tools/send_voip_push.js`

This sends a VoIP push with a `data` object matching the iOS AppDelegate expectations
(contains `uuid`, `name`, `handle`, `handleType`, `hasVideo`).
*/

const apn = require('apn');

// --- CONFIGURE THESE ---
const KEY_PATH = './AuthKey_XXXXXXXX.p8'; // path to your .p8 file
const KEY_ID = 'YOUR_KEY_ID';
const TEAM_ID = 'YOUR_TEAM_ID';
const BUNDLE_ID = 'com.yourcompany.DocNock'; // your app bundle id
const DEVICE_TOKEN = 'DEVICE_PUSHKIT_TOKEN'; // target device VoIP token (from console logs)
const PRODUCTION = false; // true => api.push.apple.com, false => api.sandbox.push.apple.com
// -----------------------

if (!KEY_PATH || !KEY_ID || !TEAM_ID || !BUNDLE_ID || !DEVICE_TOKEN) {
  console.error('Please configure KEY_PATH, KEY_ID, TEAM_ID, BUNDLE_ID, and DEVICE_TOKEN in the script.');
  process.exit(1);
}

const options = {
  token: {
    key: KEY_PATH,
    keyId: KEY_ID,
    teamId: TEAM_ID,
  },
  production: PRODUCTION,
};

const apnProvider = new apn.Provider(options);

const uuid = '6f1a5b3e-0000-4000-8000-000000000000'; // example UUID

const notification = new apn.Notification();
notification.pushType = 'voip';
notification.topic = `${BUNDLE_ID}.voip`;
notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

// Put payload under `data` so AppDelegate picks it up (payload.dictionaryPayload[@"data"])
notification.payload = {
  data: {
    type: 'ring',
    uuid,
    name: 'Test Caller',
    handle: '1234567890',
    handleType: 'generic',
    hasVideo: false,
  },
};

(async () => {
  try {
    const result = await apnProvider.send(notification, DEVICE_TOKEN);
    console.log('APNs result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error sending voip push:', err);
  } finally {
    apnProvider.shutdown();
  }
})();
