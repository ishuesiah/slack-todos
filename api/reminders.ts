import { getEnv } from "../src/lib/env.js";
import { processReminders } from "../src/lib/reminders.js";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function GET(request: Request) {
  const env = getEnv();

  // Verify cron secret if configured (Vercel sends this automatically for cron jobs)
  if (env.cronSecret) {
    const authHeader = request.headers.get("Authorization");
    const expectedAuth = `Bearer ${env.cronSecret}`;

    if (authHeader !== expectedAuth) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  try {
    const results = await processReminders();

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return jsonResponse({
      message: `Processed ${results.length} reminder(s)`,
      successful,
      failed,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

export async function POST() {
  return jsonResponse({ error: "Method not allowed" }, 405);
}

export default {
  GET,
  POST
};
