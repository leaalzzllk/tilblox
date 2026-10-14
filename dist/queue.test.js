import assert from "node:assert/strict";
import test from "node:test";
import { parseRobloxUsername, RequestQueue } from "./queue.js";
const profile = { userId: 123, name: "Example_User", displayName: "Example" };
test("aceita apenas nome Roblox simples ou comando join", () => {
    assert.equal(parseRobloxUsername("Example_User"), "Example_User");
    assert.equal(parseRobloxUsername("!join Example_User"), "Example_User");
    assert.equal(parseRobloxUsername("oi, Example_User"), null);
    assert.equal(parseRobloxUsername("ab"), null);
});
test("enfileira, entrega uma vez e conclui o pedido", async () => {
    const queue = new RequestQueue(async () => profile, 30_000);
    const item = await queue.enqueue("Example_User", "Teste");
    assert.equal(queue.snapshot()[0]?.id, item.id);
    assert.equal(queue.claimNext()?.id, item.id);
    assert.equal(queue.claimNext(), null);
    assert.equal(queue.complete(item.id), true);
    assert.deepEqual(queue.snapshot(), []);
});
test("bloqueia pedidos repetidos e usernames inválidos", async () => {
    const queue = new RequestQueue(async () => profile, 30_000);
    await queue.enqueue("Example_User", "Teste");
    await assert.rejects(queue.enqueue("Example_User", "Teste"), /recentemente/);
    await assert.rejects(queue.enqueue("x!", "Teste"), /válido/);
});
