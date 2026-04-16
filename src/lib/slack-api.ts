import { getEnv } from "./env.js";

type SlackApiResponse<T> = {
  ok: boolean;
  error?: string;
} & T;

type ConversationsOpenResponse = SlackApiResponse<{
  channel?: {
    id: string;
  };
}>;

type ChatPostMessageResponse = SlackApiResponse<{
  ts?: string;
  channel?: string;
}>;

async function slackApiRequest<T>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const { slackBotToken } = getEnv();

  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${slackBotToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Slack API request failed: ${response.status}`);
  }

  const data = (await response.json()) as T;
  return data;
}

async function openDirectMessage(userId: string): Promise<string> {
  const response = await slackApiRequest<ConversationsOpenResponse>(
    "conversations.open",
    { users: userId }
  );

  if (!response.ok || !response.channel?.id) {
    throw new Error(`Failed to open DM channel: ${response.error ?? "Unknown error"}`);
  }

  return response.channel.id;
}

export async function sendDirectMessage(
  userId: string,
  text: string,
  blocks?: Array<Record<string, unknown>>
): Promise<void> {
  const channelId = await openDirectMessage(userId);

  const response = await slackApiRequest<ChatPostMessageResponse>(
    "chat.postMessage",
    {
      channel: channelId,
      text,
      blocks
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.error ?? "Unknown error"}`);
  }
}
