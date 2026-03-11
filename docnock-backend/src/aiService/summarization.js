import { callClaude } from "./claude";

const SYSTEM_PROMPT = `You are a clinical communication assistant for a healthcare messaging platform used by physicians, nurses, and nursing facility staff. Your role is to summarize conversations accurately.

Rules:
- Summarize in 3-5 concise bullet points
- Focus on: clinical decisions made, action items assigned, pending follow-ups, and status changes
- Use role labels (Physician, Nurse, Staff) instead of personal names
- Do NOT fabricate medical information
- If the conversation is too short or non-clinical, say so honestly
- Keep each bullet point to 1-2 sentences maximum
- Use present tense for current status, past tense for completed actions`;

/**
 * Summarize an array of message objects into bullet points.
 * Messages are de-identified before sending to the LLM.
 */
export const summarizeConversation = async (messages, participantMap = {}) => {
  if (!messages || messages.length < 3) {
    return "Not enough messages to generate a meaningful summary.";
  }

  // De-identify: replace user IDs/names with role labels
  const deidentified = messages.map((msg) => {
    const sender = participantMap[msg.senderID?.toString()] || { role: "Staff" };
    const roleLabel = sender.role
      ? sender.role.charAt(0).toUpperCase() + sender.role.slice(1)
      : "Staff";
    return `${roleLabel}: ${msg.message || "[attachment]"}`;
  });

  const transcript = deidentified.join("\n");

  const userPrompt = `Summarize the following clinical conversation in 3-5 bullet points. Focus on clinical decisions, action items, and pending follow-ups.\n\n--- Conversation ---\n${transcript}\n--- End ---`;

  const summary = await callClaude(SYSTEM_PROMPT, userPrompt);
  return summary;
};

export default { summarizeConversation };
