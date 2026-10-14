import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RequestQueue, parseRobloxUsername } from "./queue.js";
import { TikTokLiveAdapter, type TikTokChatMessage } from "./tiktok.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const bridgeToken = process.env.ROBLOX_BRIDGE_TOKEN;
const queue = new RequestQueue();
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestCounts = new Map<string, { count: number; startedAt: number }>();

app.use(express.json({ limit: "16kb" }));
app.use(express.static(resolve(projectRoot, "public")));

function requireRobloxToken(request: Request, response: Response, next: NextFunction): void {
  if (!bridgeToken) {
    response.status(503).json({ error: "Configure ROBLOX_BRIDGE_TOKEN no arquivo .env." });
    return;
  }
  if (request.header("x-bridge-token") !== bridgeToken) {
    response.status(401).json({ error: "Token da ponte inválido." });
    return;
  }
  next();
}

function limitTestRequests(request: Request, response: Response, next: NextFunction): void {
  const key = request.ip ?? "unknown";
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    requestCounts.set(key, { count: 1, startedAt: now });
    next();
    return;
  }
  if (current.count >= 10) {
    response.status(429).json({ error: "Muitos pedidos de teste. Aguarde um minuto." });
    return;
  }
  current.count += 1;
  next();
}

async function handleTikTokComment(message: TikTokChatMessage): Promise<void> {
  const username = parseRobloxUsername(message.comment ?? "");
  if (!username) return;

  const sender = message.user?.uniqueId ?? message.user?.nickname ?? "TikTok";
  try {
    const request = await queue.enqueue(username, `TikTok @${sender}`);
    console.info(`Pedido na fila: ${request.name} (@${sender})`);
  } catch (error) {
    console.info(`Pedido ignorado de @${sender}: ${error instanceof Error ? error.message : error}`);
  }
}

const tiktok = new TikTokLiveAdapter(handleTikTokComment);

app.get("/api/status", (_request, response) => {
  response.json({ ...tiktok.status, bridgeConfigured: Boolean(bridgeToken) });
});

app.get("/api/queue", (_request, response) => {
  response.json({ items: queue.snapshot() });
});

app.post("/api/test", limitTestRequests, async (request, response) => {
  const username = String(request.body?.username ?? "").trim();
  try {
    const item = await queue.enqueue(username, "Teste do painel");
    response.status(201).json({ item });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível criar o pedido." });
  }
});

app.post("/api/tiktok/connect", async (request, response) => {
  const uniqueId = String(request.body?.uniqueId ?? "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,24}$/.test(uniqueId)) {
    response.status(400).json({ error: "Informe o @ da conta que está transmitindo." });
    return;
  }
  try {
    await tiktok.connect(uniqueId);
    response.status(202).json({ ...tiktok.status, message: "Tentando conectar ao chat da live." });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Não foi possível conectar à live."
    });
  }
});

app.post("/api/tiktok/disconnect", async (_request, response) => {
  try {
    await tiktok.disconnect();
    response.json({ ...tiktok.status });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Falha ao desconectar." });
  }
});

app.get("/api/roblox/next", requireRobloxToken, (_request, response) => {
  response.json({ item: queue.claimNext() });
});

app.post("/api/roblox/complete", requireRobloxToken, (request, response) => {
  const id = String(request.body?.id ?? "");
  if (!id) {
    response.status(400).json({ error: "ID do pedido é obrigatório." });
    return;
  }
  response.json({ completed: queue.complete(id) });
});

app.get("*", (_request, response) => {
  response.sendFile(resolve(projectRoot, "public", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.info(`TikBlox disponível em http://localhost:${port}`);
  if (!bridgeToken) console.warn("A ponte Roblox está desativada até ROBLOX_BRIDGE_TOKEN ser configurado.");
});
