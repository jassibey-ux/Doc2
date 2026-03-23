import { uploadSingleProfileImage } from "../middleware/userUploads";
import { addUser, login,resetPassword,listLoginRecords,forgotPassword,logoutUser, resendOTP,listUsers, updateUser, changeStatusAndDelete, getUserById, sendPasswordResetEmail, createPermission, getPermissionsByUserId, countUsersByRole ,changePassword,verifyOTP, getUnreadCountByReceiver, fcm_token_save, verify_link, encryption_conversion, getGraphData, getAnalyticsDashboard, refreshAccessToken, logoutAllDevices, listAuditLogs, setupMfa, verifyMfaSetup, verifyMfa, disableMfa, checkMobileExists, getMyActiveSessions, revokeMySession, revokeAllOtherSessions, requestEmailChange, confirmEmailChange, updateNotificationPreferences, getUserAuditTrail, requestAccountDeletion} from "./Controller";
import { requireRole, ROLES } from "../middleware/rbacMiddleware";

export default (router) => {
  // ==========================
  // Public Routes
  // ==========================
  router.post("/login", login);
  router.post("/forgotPassword", forgotPassword);
  router.post("/refresh-token", refreshAccessToken);

  // ==========================
  // Admin-Only Routes (create/delete users, permissions, analytics)
  // ==========================
  const adminOnly = requireRole(...ROLES.ADMIN);

  router.post("/addUser", adminOnly, uploadSingleProfileImage("profileImage"), addUser);
  router.post("/changeStatusAndDelete", adminOnly, changeStatusAndDelete);
  router.post("/sendPasswordResetEmail", adminOnly, sendPasswordResetEmail);
  router.post("/createPermission", adminOnly, createPermission);
  router.get("/getPermissionsByUserId", adminOnly, getPermissionsByUserId);
  router.post("/countUsersByRole", adminOnly, countUsersByRole);
  router.get("/listLoginRecords", adminOnly, listLoginRecords);
  router.get('/get_graph', adminOnly, getGraphData);
  router.get('/analytics/dashboard', adminOnly, getAnalyticsDashboard);
  router.post("/logout-all-devices", adminOnly, logoutAllDevices);
  router.get("/audit-logs", adminOnly, listAuditLogs);
  router.get("/users/:userId/audit-trail", adminOnly, getUserAuditTrail);

  // ==========================
  // Authenticated Routes (any logged-in user)
  // ==========================
  router.post("/updateUser", uploadSingleProfileImage("profileImage"), updateUser);
  router.get("/listUsers", listUsers);
  router.get("/getUserById", getUserById);
  router.get("/checkMobileExists", checkMobileExists);
  router.post("/changePassword", changePassword);
  router.post("/verifyOTP", verifyOTP);
  router.post("/resendOTP", resendOTP);
  router.get("/logoutUser", logoutUser);
  router.post("/resetPassword", resetPassword);
  router.get("/getUnreadCountByReceiver",getUnreadCountByReceiver);
  router.post("/fcm_token_save",fcm_token_save);
  router.post("/verify-link",verify_link)
  router.post("/convertion",encryption_conversion);

  // MFA routes
  router.post("/setup-mfa", setupMfa);
  router.post("/verify-mfa-setup", verifyMfaSetup);
  router.post("/verify-mfa", verifyMfa);       // Public (uses mfaSessionToken)
  router.post("/disable-mfa", disableMfa);

  // Session management (user self-service)
  router.get("/sessions/active", getMyActiveSessions);
  router.delete("/sessions/:sessionId", revokeMySession);
  router.delete("/sessions/revoke-all-others", revokeAllOtherSessions);

  // Email change with verification
  router.post("/users/request-email-change", requestEmailChange);
  router.post("/users/confirm-email-change", confirmEmailChange);

  // Notification preferences
  router.put("/users/notification-preferences", updateNotificationPreferences);

  // Account deletion
  router.post("/users/request-deletion", requestAccountDeletion);

  return router;
};
