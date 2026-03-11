import multer from "multer";
import {
  inboundFaxWebhook,
  getFaxInbox,
  markFaxRead,
  sendFax,
  forwardFaxToChat,
  getFaxNumber,
} from "./Controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export default (router) => {
  // ─── Fax Endpoints ─────────────────────────────────────────────────────────

  // Phaxio inbound webhook (unauthenticated — uses Phaxio signature verification)
  router.post("/fax/inbound", inboundFaxWebhook);

  // Authenticated endpoints
  router.get("/fax/inbox", getFaxInbox);
  router.put("/fax/:id/read", markFaxRead);
  router.post("/fax/send", upload.single("file"), sendFax);
  router.post("/fax/forward-to-chat", forwardFaxToChat);
  router.get("/fax/assign-number", getFaxNumber);

  return router;
};
