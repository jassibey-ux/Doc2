import { auditMiddleware } from "./middleware/auditMiddleware";

export default function (express) {
  let router = express.Router();

  // HIPAA audit middleware — logs all PHI-relevant API access
  router.use(auditMiddleware);

  /* User Management */
  require("./userManagement/Route").default(router);
  require("./chatManagment/Route").default(router);
  /* Schedule & Escalation */
  require("./scheduleManagement/Route").default(router);
  /* Fax Management */
  require("./faxManagement/Route").default(router);
  /* EHR / PointClickCare Integration */
  require("./ehrIntegration/Route").default(router);
  /* Clinical Forms Engine */
  require("./formManagement/Route").default(router);
  /* AI Services */
  require("./aiService/Route").default(router);
  /* Family Communication Portal */
  require("./familyPortal/Route").default(router);

  return router;
}
