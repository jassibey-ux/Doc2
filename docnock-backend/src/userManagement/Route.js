import { uploadSingleProfileImage } from "../middleware/userUploads";
import { addUser, login,resetPassword,listLoginRecords,forgotPassword,logoutUser, resendOTP,listUsers, updateUser, changeStatusAndDelete, getUserById, sendPasswordResetEmail, createPermission, getPermissionsByUserId, countUsersByRole ,changePassword,verifyOTP, getUnreadCountByReceiver, fcm_token_save, verify_link, encryption_conversion, getGraphData, getAnalyticsDashboard, refreshAccessToken, logoutAllDevices, listAuditLogs, setupMfa, verifyMfaSetup, verifyMfa, disableMfa} from "./Controller";

export default (router) => {
  // ==========================
  // Public Routes
  // ==========================
  router.post("/login", login);
  router.post("/forgotPassword", forgotPassword);
  router.post("/refresh-token", refreshAccessToken);

  // ==========================
  // Private Routes (Authentication Required)
  // ==========================
  router.post("/addUser", uploadSingleProfileImage("profileImage"), addUser);
  router.post("/updateUser", uploadSingleProfileImage("profileImage"), updateUser);
  router.get("/listUsers", listUsers);
  router.get("/getUserById", getUserById);
  router.post("/changeStatusAndDelete", changeStatusAndDelete);
  router.post("/sendPasswordResetEmail", sendPasswordResetEmail);
  router.post("/createPermission", createPermission);
  router.get("/getPermissionsByUserId", getPermissionsByUserId);
  router.post("/countUsersByRole", countUsersByRole);
  router.post("/changePassword", changePassword);
  router.post("/verifyOTP", verifyOTP);
  router.post("/resendOTP", resendOTP);
  router.get("/logoutUser", logoutUser);
  router.post("/resetPassword", resetPassword);
  router.get("/listLoginRecords", listLoginRecords);
  router.get("/getUnreadCountByReceiver",getUnreadCountByReceiver);
  router.post("/fcm_token_save",fcm_token_save);
  router.post("/verify-link",verify_link)
  router.post("/convertion",encryption_conversion);
  router.get('/get_graph', getGraphData);
  router.get('/analytics/dashboard', getAnalyticsDashboard);
  router.post("/logout-all-devices", logoutAllDevices);
  router.get("/audit-logs", listAuditLogs);

  // MFA routes
  router.post("/setup-mfa", setupMfa);
  router.post("/verify-mfa-setup", verifyMfaSetup);
  router.post("/verify-mfa", verifyMfa);       // Public (uses mfaSessionToken)
  router.post("/disable-mfa", disableMfa);

  return router;
};
