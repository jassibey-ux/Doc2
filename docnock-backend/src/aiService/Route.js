import {
  summarizeConv,
  documentQuery,
  summarizeHandoff,
  generateFamilyUpdate,
  getAiTemplates,
  createAiTemplate,
  runAiTemplate,
  uploadChatDocument,
  listChatDocuments,
  deleteChatDocument,
  queryChatDocuments,
} from "./Controller";

export default (router) => {
  router.post("/ai/summarize-conversation", summarizeConv);
  router.post("/ai/document-query", documentQuery);
  router.post("/ai/summarize-handoff", summarizeHandoff);
  router.post("/ai/generate-family-update", generateFamilyUpdate);
  router.get("/ai/templates", getAiTemplates);
  router.post("/ai/templates", createAiTemplate);
  router.post("/ai/templates/:templateId/run", runAiTemplate);

  // Chat Document Panel
  router.post("/ai/chat-documents", uploadChatDocument);
  router.get("/ai/chat-documents", listChatDocuments);
  router.delete("/ai/chat-documents/:documentId", deleteChatDocument);
  router.post("/ai/chat-documents/query", queryChatDocuments);

  return router;
};
