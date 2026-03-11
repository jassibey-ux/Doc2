import { summarizeConv } from "./Controller";

export default (router) => {
  router.post("/ai/summarize-conversation", summarizeConv);

  return router;
};
