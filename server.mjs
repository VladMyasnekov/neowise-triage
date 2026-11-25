import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let text;
  try {
    text = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.text;
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }
  if (typeof text !== "string" || !text.trim()) {
    return json(response, 400, { status: "invalid_input" });
  }

  const manual = { status: "manual_review", topic: null, draft: null };
  try {
    const raw = await classify(text.trim(), { signal: AbortSignal.timeout(300) });
    const { topic, draft } = JSON.parse(raw);
    if (["delivery", "pricing", "other"].includes(topic) &&
        typeof draft === "string" && draft.trim()) {
      return json(response, 200, { status: "ready", topic, draft: draft.trim() });
    }
  } catch {
    // Ошибка провайдера, отмена и битый JSON требуют ручного разбора.
  }
  return json(response, 200, manual);
}

export const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/triage") {
    return json(response, 404, { status: "not_found" });
  }
  try {
    await handleTriage(request, response);
  } catch {
    json(response, 500, { status: "server_error" });
  }
});
if (import.meta.url === pathToFileURL(process.argv[1]).href) server.listen(Number(process.env.PORT || 3000), "127.0.0.1");
