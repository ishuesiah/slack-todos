const requiredEnvVars = [
  "SLACK_SIGNING_SECRET",
  "SLACK_BOT_TOKEN",
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID"
] as const;

type RequiredEnvVar = (typeof requiredEnvVars)[number];

function readEnvVar(name: RequiredEnvVar): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getEnv() {
  return {
    slackSigningSecret: readEnvVar("SLACK_SIGNING_SECRET"),
    slackBotToken: readEnvVar("SLACK_BOT_TOKEN"),
    notionToken: readEnvVar("NOTION_TOKEN"),
    notionDatabaseId: readEnvVar("NOTION_DATABASE_ID"),
    cronSecret: process.env.CRON_SECRET
  };
}
