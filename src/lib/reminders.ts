import { getTasksNeedingReminder, updateLastRemindedAt, type TaskRecord } from "./tasks.js";
import { sendDirectMessage } from "./slack-api.js";
import { formatSlackUser } from "./slack.js";

const DAYS_BEFORE_FIRST_REMINDER = 3;
const DAYS_BETWEEN_REMINDERS = 3;

function getDaysAgo(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildReminderBlocks(task: TaskRecord) {
  const daysAgo = getDaysAgo(task.createdAt);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "Hey! Just a reminder that you have an open task:",
          "",
          `*${task.title}*`,
          `Created ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago by ${formatSlackUser(task.createdBySlackId)}`,
          "",
          `<${task.notionUrl}|Open in Notion>`
        ].join("\n")
      }
    }
  ];
}

export type ReminderResult = {
  taskId: string;
  taskTitle: string;
  userId: string;
  success: boolean;
  error?: string;
};

export async function processReminders(): Promise<ReminderResult[]> {
  const tasks = await getTasksNeedingReminder(
    DAYS_BEFORE_FIRST_REMINDER,
    DAYS_BETWEEN_REMINDERS
  );

  const results: ReminderResult[] = [];

  for (const task of tasks) {
    const result: ReminderResult = {
      taskId: task.id,
      taskTitle: task.title,
      userId: task.assigneeSlackId,
      success: false
    };

    try {
      const blocks = buildReminderBlocks(task);
      const text = `Reminder: "${task.title}" is still open`;

      await sendDirectMessage(task.assigneeSlackId, text, blocks);
      await updateLastRemindedAt(task.id);

      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Unknown error";
    }

    results.push(result);

    // Small delay between messages to avoid rate limits
    if (tasks.indexOf(task) < tasks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
