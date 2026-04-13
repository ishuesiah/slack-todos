# Slack Todos

A small Slack slash-command bot that stores tasks in Notion and is ready to deploy on Vercel.

## What it does

- `/task add Finish launch checklist`
- `/task add @teammate Review homepage copy`
- `/task list`
- `/task list @teammate`
- `/task list all`
- Mark tasks done from a Slack button

## Project structure

- `api/slack.ts`: Vercel serverless function that handles Slack requests
- `src/lib/slack.ts`: Slack request parsing and signature verification
- `src/lib/tasks.ts`: Notion database reads and writes
- `src/lib/env.ts`: required environment variable loading
- `slack-manifest.yml`: Slack app manifest

## Environment variables

Create a local `.env` from `.env.example` with:

- `SLACK_SIGNING_SECRET`
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

## Notion setup

Create a Notion database and share it with your integration. Use these properties:

- `Title`: Title
- `Status`: Select with options `Open` and `Done`
- `AssigneeSlackId`: Text
- `AssigneeDisplayName`: Text
- `CreatedBySlackId`: Text
- `CreatedByName`: Text
- `ChannelId`: Text
- `CreatedAt`: Date

## Slack setup

1. Create a Slack app from `slack-manifest.yml`.
2. Replace `https://your-app.vercel.app/api/slack` in the manifest with your real deployment URL.
3. Install the app to your workspace.
4. Copy the Slack signing secret into `SLACK_SIGNING_SECRET`.

## Deploy

1. Push this project to GitHub.
2. Import it into Vercel.
3. Add the environment variables in Vercel project settings.
4. Deploy.
5. Update the Slack manifest URLs to the deployed endpoint if needed.

## Local validation

Install dependencies and run:

```bash
npm run check
```

If you want local HTTP testing, use `vercel dev` and point Slack to the public tunnel URL that forwards to your local server.
