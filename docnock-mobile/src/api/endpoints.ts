export const BASE_URL = 'https://api.doc-nock.com';
export const LOCAL_BASE_URL = 'https://api.doc-nock.com/api/v1/';
export const SOCKET_URL = 'wss://socketapi.doc-nock.com';
export const BASE_USER_UPLOAD_URL = 'https://api.doc-nock.com/user-uploads/';


// local ip
// export const BASE_URL = 'https://api.doc-nock.com';
// export const LOCAL_BASE_URL = 'https://api.docnock.in/api/v1/';
// export const SOCKET_URL = 'ws://104.236.40.124:8056';
// export const BASE_USER_UPLOAD_URL = 'https://api.docnock.in/user-uploads/';

// --------
export const BASE_USER_UPLOAD_PROFILE_URL = BASE_USER_UPLOAD_URL + 'profiles/';

export const API_ENDPOINTS = {
  LOGIN: `login`,
  FCM_TOKEN_SAVE: `fcm_token_save`,
  VERIFY_OTP: 'verifyOTP',
  FORGOT_PASSWORD: `forgotPassword`,
  RESET_PASSWORD: `resetPassword`,
  SETUP_PROFILE: `updateUser`,
  GET_USER_BY_ID: `getUserById`,
  UPDATE_USER: 'updateUser',
  LIST_USERS: 'listUsers',
  CHANGE_PASSWORD: 'changePassword',
  LOGOUT: 'logoutUser',
  GET_PERMISSION_BY_USER_ID: 'getPermissionsByUserId',
  NOTIFICATION_LIST: 'notificationlist',
  NOTIFICATION_UNREAD_COUNT: 'getUnreadCountByReceiver',
  READ_NOTIFICATION: 'read/notification',

  // Chats
  GROUP_LIST: 'group-list',
  CREATE_GROUP: 'create-group',
  UPDATE_GROUP_NAME: 'update-group-name',
  UPDATE_GROUP_MEMBERS: 'update-group-members',
  GENERATE_AGORA_TOKEN: 'generate-agora-token',
  EXPORT_CHATS: 'export',

  //Old APIS
  GET_LAT_LONG: `/get-latlang`,
  SIGNUP: `profileUpdate`,
  VERIFY_TOKEN: `/verify-token`,
  REMOVE_TOKEN: `/remove-tokens`,
  IMAGE_UPLOAD:'/upload-image',

  // On-Call Schedule
  SCHEDULE_CREATE: 'schedule/create',
  SCHEDULE_FACILITY: 'schedule/facility',
  SCHEDULE_ONCALL_NOW: 'schedule/oncall-now',

  // eFax
  FAX_INBOX: 'fax/inbox',
  FAX_SEND: 'fax/send',
  FAX_FORWARD: 'fax/forward-to-chat',

  // PCC / EHR Integration
  PCC_LINK_PATIENT: 'pcc/link-patient',
  PCC_UNLINK_PATIENT: 'pcc/unlink-patient',
  PCC_PATIENT_LINK: 'pcc/patient-link',
  PCC_PATIENT_SUMMARY: 'pcc/patient-summary',
  PCC_SEARCH_PATIENTS: 'pcc/search-patients',
  PCC_FACILITIES: 'pcc/facilities',

  // Clinical Forms
  FORM_TEMPLATES: 'forms/templates',
  FORM_SEND: 'forms/send',
  FORM_SUBMISSIONS: 'forms/submissions',

  // Analytics
  ANALYTICS_DASHBOARD: 'analytics/dashboard',

  // AI Services
  AI_SUMMARIZE: 'ai/summarize-conversation',
};
