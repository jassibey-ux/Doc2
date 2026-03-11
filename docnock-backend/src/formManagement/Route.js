import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  sendForm,
  submitForm,
  getSubmission,
  listSubmissions,
} from "./Controller";

export default (router) => {
  // ─── Form Templates ───────────────────────────────────────────────────────
  router.post("/forms/templates", createTemplate);
  router.get("/forms/templates", listTemplates);
  router.get("/forms/templates/:id", getTemplate);
  router.put("/forms/templates/:id", updateTemplate);
  router.delete("/forms/templates/:id", deleteTemplate);

  // ─── Form Submissions ─────────────────────────────────────────────────────
  router.post("/forms/send", sendForm);
  router.put("/forms/submissions/:id/submit", submitForm);
  router.get("/forms/submissions/:id", getSubmission);
  router.get("/forms/submissions", listSubmissions);

  return router;
};
