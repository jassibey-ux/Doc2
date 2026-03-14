/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Usage in routes:
 *   router.get("/admin-only", requireRole("superadmin"), controller.method);
 *   router.get("/staff", requireRole("superadmin", "physician", "nurse"), controller.method);
 */

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const userRole = req.user.role || req.user.userType;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

/**
 * Convenience role groups
 */
export const ROLES = {
  ALL_STAFF: ["superadmin", "sub_admin", "physician", "nurse"],
  ADMIN: ["superadmin", "sub_admin"],
  CLINICAL: ["physician", "nurse"],
  SUPERADMIN_ONLY: ["superadmin"],
};
