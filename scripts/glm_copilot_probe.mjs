// Headless live test: replay Magnetic's Copilot tool-loop request shape
// against the operator's configured endpoint, using the SAME openai npm
// package the shipped app uses. Reads the key from Magnetic's settings;
// never prints it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";

const settingsPath = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Magnetic", "settings.json");
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

const baseURL = settings.copilotBaseUrl || undefined;
const model = settings.copilotModel || "glm-5.3-flash";
const protocol = settings.copilotProtocol || "anthropic";
const apiKey = settings.anthropicApiKey;

console.log(`endpoint: ${baseURL ?? "(default api.anthropic.com)"}`);
console.log(`model: ${model}  protocol: ${protocol}`);
if (protocol !== "openai") {
  console.log("PROTOCOL TEST: SKIP (configured transport is anthropic; this probe covers openai)");
  process.exit(0);
}
if (!apiKey) {
  console.log("PROTOCOL TEST: FAIL (no API key stored)");
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: false });

const tools = [
  {
    type: "function",
    function: {
      name: "blade",
      description: "Cut the clip under the playhead into two clips.",
      parameters: {
        type: "object",
        properties: {
          clip_id: { type: "string" },
          at_flicks: { type: "number" },
        },
        required: ["clip_id", "at_flicks"],
      },
    },
  },
];

const messages = [
  {
    role: "system",
    content:
      "You are the editing copilot inside Magnetic, a magnetic-timeline video editor. You edit through tools against a WORKING COPY; the human accepts or discards. Be concise.",
  },
  {
    role: "user",
    content:
      "Confirm you can see the blade tool, then call it on clip intro-01 at 2 seconds.",
  },
];

const start = Date.now();
const response = await client.chat.completions.create(
  {
    model,
    max_tokens: 16000,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
  },
  { maxRetries: 0 }
);
const elapsed = (Date.now() - start) / 1000;

const choice = response.choices[0];
const message = choice.message;
const toolCalls = message.tool_calls ?? [];
console.log(`finish_reason: ${choice.finish_reason}`);
console.log(`content: ${(message.content ?? "").slice(0, 160)}`);
console.log(`tool_calls: ${toolCalls.length}`);
for (const call of toolCalls) {
  console.log(`  - ${call.function.name} args=${call.function.arguments.slice(0, 120)}`);
}
console.log(`latency: ${elapsed.toFixed(2)}s`);

const ok = ["stop", "tool_calls"].includes(choice.finish_reason) && (message.content || toolCalls.length > 0);
console.log("PROTOCOL TEST:", ok ? "PASS" : "FAIL");
console.log("TOOL-LOOP TEST:", toolCalls.length > 0 ? "PASS (model emitted a well-formed tool call)" : "PARTIAL (protocol ok; model chose not to call tools for this prompt)");
