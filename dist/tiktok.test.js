import assert from "node:assert/strict";
import test from "node:test";
import { TikTokLiveAdapter } from "./tiktok.js";
test("limpa o estado quando o conector não pode ser carregado", async () => {
    const adapter = new TikTokLiveAdapter(async () => { }, () => { }, async () => {
        throw new Error("Módulo TikTok indisponível");
    });
    await assert.rejects(adapter.connect("criador"), /Módulo TikTok indisponível/);
    assert.deepEqual(adapter.status, {
        connected: false,
        connecting: false,
        creator: null,
        error: "Módulo TikTok indisponível"
    });
});
test("encerra o estado de conexão quando o TikTok rejeita a conexão", async () => {
    const connectionError = new Error("Live não encontrada");
    const adapter = new TikTokLiveAdapter(async () => { }, () => { }, async () => ({
        TikTokLiveConnection: class {
            on(_event, _listener) { }
            connect() {
                return Promise.reject(connectionError);
            }
        }
    }));
    await adapter.connect("criador");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(adapter.status, {
        connected: false,
        connecting: false,
        creator: null,
        error: "Live não encontrada"
    });
});
test("ignora uma conexão antiga quando uma tentativa mais recente já começou", async () => {
    const successfulConnector = {
        TikTokLiveConnection: class {
            on(_event, _listener) { }
            connect() {
                return Promise.resolve();
            }
        }
    };
    let resolveFirstLoad;
    const firstLoad = new Promise((resolve) => {
        resolveFirstLoad = resolve;
    });
    let loadCount = 0;
    const adapter = new TikTokLiveAdapter(async () => { }, () => { }, async () => loadCount++ === 0 ? firstLoad : successfulConnector);
    const firstAttempt = adapter.connect("primeiro");
    await Promise.resolve();
    await adapter.connect("segundo");
    await new Promise((resolve) => setImmediate(resolve));
    resolveFirstLoad(successfulConnector);
    await firstAttempt;
    assert.deepEqual(adapter.status, {
        connected: true,
        connecting: false,
        creator: "segundo",
        error: null
    });
});
