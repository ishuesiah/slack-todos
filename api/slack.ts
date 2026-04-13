import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createTask,
  getRecommendedNotionSchema,
  getTask,
  listTasks,
  markTaskDone,
  validateDatabaseAccess,
  type TaskRecord
} from "../src/lib/tasks.js";
import { getEnv } from "../src/lib/env.js";
import {
  extractMentionedUserId,
  formatSlackUser,
  parseInteractivePayload,
  parseSlashCommand,
  type SlackActionPayload,
  type SlackMessageResponse,
  type SlashCommandPayload,
  verifySlackSignature
} from "../src/lib/slack.js";

async function readRawBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: SlackMessageResponse | Record<string, unknown>
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function buildHelpResponse(): SlackMessageResponse {
  return {
    response_type: "ephemeral",
    text: "Task Bot commands",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "*Task Bot commands*",
            "`/task add Finish quarterly report`",
            "`/task add @teammate Prepare launch checklist`",
            "`/task list`",
            "`/task list @teammate`",
            "`/task list all`",
            "",
            "Tasks are stored in Notion and can be marked done from Slack."
          ].join("\n")
        }
      }
    ]
  };
}

function buildTaskBlocks(tasks: TaskRecord[], title: string): SlackMessageResponse {
  if (tasks.length === 0) {
    return {
      response_type: "ephemeral",
      text: `${title}: no matching tasks found.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${title}*\nNo matching tasks found.`
          }
        }
      ]
    };
  }

  const blocks = tasks.flatMap((task) => {
    const details = [
      `*${task.title}*`,
      `Assigned to ${formatSlackUser(task.assigneeSlackId)}`,
      `Created by ${formatSlackUser(task.createdBySlackId)}`,
      task.status === "Done" ? "*Status:* Done" : "*Status:* Open",
      `<${task.notionUrl}|Open in Notion>`
    ].join("\n");

    const sectionBlock = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: details
      }
    } satisfies Record<string, unknown>;

    if (task.status === "Done") {
      return [
        sectionBlock,
        {
          type: "divider"
        }
      ];
    }

    return [
      sectionBlock,
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Mark done"
            },
            style: "primary",
            action_id: "task_complete",
            value: task.id
          }
        ]
      },
      {
        type: "divider"
      }
    ];
  });

  return {
    response_type: "ephemeral",
    text: title,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title
        }
      },
      ...blocks.slice(0, -1)
    ]
  };
}

async function handleAddCommand(command: SlashCommandPayload) {
  const assigneeSlackId = extractMentionedUserId(command.text) ?? command.user_id;
  const title = command.text.replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/gi, "").trim();

  if (!title) {
    return {
      response_type: "ephemeral",
      text: "Please include a task title. Example: /task add Write onboarding doc"
    } satisfies SlackMessageResponse;
  }

  const task = await createTask({
    title,
    assigneeSlackId,
    assigneeDisplayName:
      assigneeSlackId === command.user_id ? command.user_name : assigneeSlackId,
    createdBySlackId: command.user_id,
    createdByName: command.user_name,
    channelId: command.channel_id
  });

  return {
    response_type: "in_channel",
    text: `Created task "${task.title}" for ${formatSlackUser(task.assigneeSlackId)}.`
  } satisfies SlackMessageResponse;
}

async function handleListCommand(command: SlashCommandPayload) {
  const normalizedText = command.text.trim();
  const mention = extractMentionedUserId(normalizedText);
  const includeDone = normalizedText.toLowerCase() === "list all";

  if (includeDone) {
    const tasks = await listTasks({ includeDone: true });
    return buildTaskBlocks(tasks, "All tasks");
  }

  if (mention) {
    const tasks = await listTasks({ assigneeSlackId: mention });
    return buildTaskBlocks(tasks, `Open tasks for ${formatSlackUser(mention)}`);
  }

  const tasks = await listTasks({ assigneeSlackId: command.user_id });
  return buildTaskBlocks(tasks, "Your open tasks");
}

async function handleSlashCommand(command: SlashCommandPayload) {
  const trimmedText = command.text.trim();
  const [subcommand] = trimmedText.split(/\s+/, 1);
  const normalizedSubcommand = (subcommand ?? "help").toLowerCase();

  if (!trimmedText || normalizedSubcommand === "help") {
    return buildHelpResponse();
  }

  if (normalizedSubcommand === "add") {
    return handleAddCommand({
      ...command,
      text: trimmedText.slice(3).trim()
    });
  }

  if (normalizedSubcommand === "list") {
    return handleListCommand(command);
  }

  return {
    response_type: "ephemeral",
    text: `I don't recognize "${normalizedSubcommand}". Try \`/task help\`.`
  };
}

async function handleAction(payload: SlackActionPayload) {
  const action = payload.actions[0];

  if (!action) {
    return {
      response_type: "ephemeral",
      text: "No action received."
    } satisfies SlackMessageResponse;
  }

  if (action.action_id !== "task_complete" || !action.value) {
    return {
      response_type: "ephemeral",
      text: "That action is not supported yet."
    } satisfies SlackMessageResponse;
  }

  const currentTask = await getTask(action.value);

  if (currentTask.status === "Done") {
    return {
      response_type: "ephemeral",
      text: `"${currentTask.title}" is already marked done.`
    } satisfies SlackMessageResponse;
  }

  const updatedTask = await markTaskDone(action.value);

  return {
    response_type: "ephemeral",
    replace_original: true,
    text: `Completed "${updatedTask.title}".`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `:white_check_mark: *${updatedTask.title}*`,
            `Assigned to ${formatSlackUser(updatedTask.assigneeSlackId)}`,
            `<${updatedTask.notionUrl}|Open in Notion>`
          ].join("\n")
        }
      }
    ]
  };
}

function buildErrorResponse(error: unknown): SlackMessageResponse {
  const schema = getRecommendedNotionSchema()
    .map((property) => {
      if ("options" in property && Array.isArray(property.options)) {
        return `- ${property.name}: ${property.type} (${property.options.join(", ")})`;
      }

      return `- ${property.name}: ${property.type}`;
    })
    .join("\n");

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  return {
    response_type: "ephemeral",
    text: `Task Bot hit an error: ${message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*Task Bot hit an error*`,
            message,
            "",
            "*Expected Notion database schema*",
            schema
          ].join("\n")
        }
      }
    ]
  };
}

export default async function handler(
  req: IncomingMessage & { method?: string; headers: IncomingMessage["headers"] },
  res: ServerResponse
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const rawBody = await readRawBody(req);
  const env = getEnv();

  if (
    !verifySlackSignature({
      rawBody,
      slackSignature: req.headers["x-slack-signature"] as string | undefined,
      slackTimestamp: req.headers["x-slack-request-timestamp"] as
        | string
        | undefined,
      signingSecret: env.slackSigningSecret
    })
  ) {
    sendJson(res, 401, { error: "Invalid Slack signature" });
    return;
  }

  try {
    await validateDatabaseAccess();

    if (rawBody.includes("payload=")) {
      const payload = parseInteractivePayload(rawBody);
      const response = await handleAction(payload);
      sendJson(res, 200, response);
      return;
    }

    const command = parseSlashCommand(rawBody);
    const response = await handleSlashCommand(command);
    sendJson(res, 200, response);
  } catch (error) {
    sendJson(res, 200, buildErrorResponse(error));
  }
}
