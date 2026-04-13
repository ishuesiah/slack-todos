import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { getEnv } from "./env.js";

const notion = new Client({ auth: getEnv().notionToken });

export type TaskRecord = {
  id: string;
  title: string;
  status: "Open" | "Done";
  assigneeSlackId: string;
  assigneeDisplayName: string;
  createdBySlackId: string;
  createdByName: string;
  channelId: string;
  createdAt: string;
  notionUrl: string;
};

type CreateTaskInput = {
  title: string;
  assigneeSlackId: string;
  assigneeDisplayName: string;
  createdBySlackId: string;
  createdByName: string;
  channelId: string;
};

type ListTasksInput = {
  assigneeSlackId?: string;
  includeDone?: boolean;
};

function getPlainTextFromRichText(
  richText: Array<{ plain_text?: string }> | undefined,
  fallback = ""
) {
  if (!richText || richText.length === 0) {
    return fallback;
  }

  return richText
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
}

function isPageObjectResponse(value: unknown): value is PageObjectResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "properties" in value &&
    "url" in value &&
    "id" in value
  );
}

function parseTask(page: unknown): TaskRecord {
  if (!isPageObjectResponse(page)) {
    throw new Error("Expected a full Notion page");
  }

  const properties = page.properties;

  const title = properties.Title;
  const status = properties.Status;
  const assigneeSlackId = properties.AssigneeSlackId;
  const assigneeDisplayName = properties.AssigneeDisplayName;
  const createdBySlackId = properties.CreatedBySlackId;
  const createdByName = properties.CreatedByName;
  const channelId = properties.ChannelId;
  const createdAt = properties.CreatedAt;

  if (
    title?.type !== "title" ||
    status?.type !== "select" ||
    assigneeSlackId?.type !== "rich_text" ||
    assigneeDisplayName?.type !== "rich_text" ||
    createdBySlackId?.type !== "rich_text" ||
    createdByName?.type !== "rich_text" ||
    channelId?.type !== "rich_text" ||
    createdAt?.type !== "date"
  ) {
    throw new Error("Notion database properties do not match expected schema");
  }

  return {
    id: page.id,
    title: title.title.map((item) => item.plain_text).join("").trim(),
    status: status.select?.name === "Done" ? "Done" : "Open",
    assigneeSlackId: getPlainTextFromRichText(assigneeSlackId.rich_text),
    assigneeDisplayName: getPlainTextFromRichText(assigneeDisplayName.rich_text),
    createdBySlackId: getPlainTextFromRichText(createdBySlackId.rich_text),
    createdByName: getPlainTextFromRichText(createdByName.rich_text),
    channelId: getPlainTextFromRichText(channelId.rich_text),
    createdAt: createdAt.date?.start ?? "",
    notionUrl: page.url
  };
}

export async function createTask(input: CreateTaskInput) {
  const { notionDatabaseId } = getEnv();
  const now = new Date().toISOString();

  const page = await notion.pages.create({
    parent: { database_id: notionDatabaseId },
    properties: {
      Title: {
        title: [
          {
            text: {
              content: input.title
            }
          }
        ]
      },
      Status: {
        select: {
          name: "Open"
        }
      },
      AssigneeSlackId: {
        rich_text: [
          {
            text: {
              content: input.assigneeSlackId
            }
          }
        ]
      },
      AssigneeDisplayName: {
        rich_text: [
          {
            text: {
              content: input.assigneeDisplayName
            }
          }
        ]
      },
      CreatedBySlackId: {
        rich_text: [
          {
            text: {
              content: input.createdBySlackId
            }
          }
        ]
      },
      CreatedByName: {
        rich_text: [
          {
            text: {
              content: input.createdByName
            }
          }
        ]
      },
      ChannelId: {
        rich_text: [
          {
            text: {
              content: input.channelId
            }
          }
        ]
      },
      CreatedAt: {
        date: {
          start: now
        }
      }
    }
  });

  return parseTask(page);
}

export async function listTasks(input: ListTasksInput) {
  const { notionDatabaseId } = getEnv();
  const filter: Array<Record<string, unknown>> = [];

  if (!input.includeDone) {
    filter.push({
      property: "Status",
      select: {
        equals: "Open"
      }
    });
  }

  if (input.assigneeSlackId) {
    filter.push({
      property: "AssigneeSlackId",
      rich_text: {
        equals: input.assigneeSlackId
      }
    });
  }

  const response = await notion.databases.query({
    database_id: notionDatabaseId,
    filter:
      filter.length === 0
        ? undefined
        : filter.length === 1
          ? (filter[0] as never)
          : {
              and: filter
            } as never,
    sorts: [
      {
        property: "CreatedAt",
        direction: "descending"
      }
    ],
    page_size: 20
  });

  return response.results.map(parseTask);
}

export async function markTaskDone(taskId: string) {
  const page = await notion.pages.update({
    page_id: taskId,
    properties: {
      Status: {
        select: {
          name: "Done"
        }
      }
    }
  });

  return parseTask(page);
}

export async function getTask(taskId: string) {
  const page = await notion.pages.retrieve({ page_id: taskId });
  return parseTask(page);
}

export async function validateDatabaseAccess() {
  const { notionDatabaseId } = getEnv();
  await notion.databases.retrieve({ database_id: notionDatabaseId });
}

export function getRecommendedNotionSchema() {
  return [
    { name: "Title", type: "Title" },
    { name: "Status", type: "Select", options: ["Open", "Done"] },
    { name: "AssigneeSlackId", type: "Text" },
    { name: "AssigneeDisplayName", type: "Text" },
    { name: "CreatedBySlackId", type: "Text" },
    { name: "CreatedByName", type: "Text" },
    { name: "ChannelId", type: "Text" },
    { name: "CreatedAt", type: "Date" }
  ];
}
