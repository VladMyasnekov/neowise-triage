import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { server } from "./server.mjs";

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
});
after(() => new Promise(resolve => server.close(resolve)));

function post(body) {
  return fetch(`http://127.0.0.1:${server.address().port}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

test("Неверный ввод возвращает 400", async () => {
  for (const body of ["{", "null", "{}", '{"text":false}', '{"text":"  "}', '{"text":""}']) {
    const reply = await post(body);
    assert.equal(reply.status, 400);
    assert.deepEqual(await reply.json(), { status: "invalid_input" });
  }
});

for (const [text, topic] of [["Доставка", "delivery"], ["Цена", "pricing"], ["Здравствуйте", "other"]]) {
  test(text, async () => {
    const reply = await post(JSON.stringify({ text }));
    const data = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(data.status, "ready");
    assert.equal(data.topic, topic);
    assert.match(data.draft, /\S/);
  });
}

for (const text of ["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(text, async () => {
    const start = performance.now();
    const reply = await post(JSON.stringify({ text }));
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { status: "manual_review", topic: null, draft: null });
    if (text === "[timeout]") assert.ok(performance.now() - start < 1000, "Должны прервать ожидание имитатора");
  });
}
