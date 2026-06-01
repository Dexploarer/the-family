// AgentMail REST client for operator invite emails (https://docs.agentmail.to).

const API_BASE = "https://api.agentmail.to/v0";

type AgentMailInbox = { inbox_id: string; email?: string };

type SendMessageBody = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

/** Idempotent inbox for Nancy operator invites (display name only; address is assigned by AgentMail). */
export async function ensureOperatorInviteInbox(apiKey: string, inboxId?: string): Promise<string> {
  if (inboxId !== undefined && inboxId.trim().length > 0) {
    return inboxId.trim();
  }
  const response = await fetch(`${API_BASE}/inboxes`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      client_id: "nancy-operator-invites",
      display_name: "Nancy Operator"
    })
  });
  if (!response.ok) {
    throw new Error(`AgentMail inbox create failed: ${await parseError(response)}`);
  }
  const inbox = (await response.json()) as AgentMailInbox;
  if (!inbox.inbox_id) {
    throw new Error("AgentMail inbox create returned no inbox_id");
  }
  return inbox.inbox_id;
}

export async function sendAgentMailMessage(
  apiKey: string,
  inboxId: string,
  message: SendMessageBody
): Promise<boolean> {
  const response = await fetch(
    `${API_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
    {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html })
      })
    }
  );
  return response.ok;
}
