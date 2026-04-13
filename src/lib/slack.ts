import crypto from "node:crypto";

export type SlashCommandPayload = {
  channel_id: string;
  channel_name: string;
  command: string;
  response_url: string;
  team_id: string;
  team_domain: string;
  text: string;
  trigger_id: string;
  user_id: string;
  user_name: string;
};

export type SlackActionPayload = {
  actions: Array<{
    action_id: string;
    value?: string;
  }>;
  channel?: {
    id: string;
    name?: string;
  };
  response_url: string;
  user: {
    id: string;
    username?: string;
    name?: string;
  };
};

export type SlackMessageResponse = {
  response_type?: "ephemeral" | "in_channel";
  replace_original?: boolean;
  delete_original?: boolean;
  text?: string;
  blocks?: Array<Record<string, unknown>>;
};

export function verifySlackSignature(params: {
  rawBody: string;
  slackSignature: string | undefined;
  slackTimestamp: string | undefined;
  signingSecret: string;
}) {
  const { rawBody, slackSignature, slackTimestamp, signingSecret } = params;

  if (!slackSignature || !slackTimestamp) {
    return false;
  }

  const timestampMs = Number(slackTimestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const ageMs = Math.abs(Date.now() - timestampMs);
  if (ageMs > 1000 * 60 * 5) {
    return false;
  }

  const baseString = `v0:${slackTimestamp}:${rawBody}`;
  const digest = crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const expectedSignature = `v0=${digest}`;

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(slackSignature)
  );
}

export function parseFormEncoded(body: string) {
  return new URLSearchParams(body);
}

export function parseSlashCommand(body: string): SlashCommandPayload {
  const params = parseFormEncoded(body);

  return {
    channel_id: params.get("channel_id") ?? "",
    channel_name: params.get("channel_name") ?? "",
    command: params.get("command") ?? "",
    response_url: params.get("response_url") ?? "",
    team_id: params.get("team_id") ?? "",
    team_domain: params.get("team_domain") ?? "",
    text: params.get("text") ?? "",
    trigger_id: params.get("trigger_id") ?? "",
    user_id: params.get("user_id") ?? "",
    user_name: params.get("user_name") ?? ""
  };
}

export function parseInteractivePayload(body: string): SlackActionPayload {
  const params = parseFormEncoded(body);
  const payload = params.get("payload");

  if (!payload) {
    throw new Error("Missing interactive payload");
  }

  return JSON.parse(payload) as SlackActionPayload;
}

export function extractMentionedUserId(text: string) {
  const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/i);
  return match?.[1] ?? null;
}

export function formatSlackUser(userId: string) {
  return `<@${userId}>`;
}
