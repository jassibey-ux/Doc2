import Anthropic from "@anthropic-ai/sdk";

let client = null;

const getClient = () => {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
};

/**
 * Send a prompt to Claude and return the text response.
 * Uses claude-haiku-4-5 for cost efficiency on summarization tasks.
 */
export const callClaude = async (systemPrompt, userPrompt, { model = "claude-haiku-4-5-20251001", maxTokens = 1024 } = {}) => {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0]?.text || "";
};

export default { callClaude };
