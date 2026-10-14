export interface RobloxProfile {
  userId: number;
  name: string;
  displayName: string;
}

export interface DanceRequest extends RobloxProfile {
  id: string;
  source: string;
  createdAt: string;
  status: "queued" | "playing";
}

export type ProfileResolver = (username: string) => Promise<RobloxProfile | null>;

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function parseRobloxUsername(message: string): string | null {
  const match = message.trim().match(/^(?:!?(?:roblox|join)\s+)?([A-Za-z0-9_]{3,20})$/i);
  return match?.[1] ?? null;
}

export async function lookupRobloxUser(username: string): Promise<RobloxProfile | null> {
  if (!USERNAME_PATTERN.test(username)) return null;

  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });

  if (!response.ok) {
    throw new Error(`A consulta ao Roblox falhou (HTTP ${response.status}).`);
  }

  const result = await response.json() as {
    data?: Array<{ id: number; name: string; displayName: string }>;
  };
  const profile = result.data?.[0];
  return profile ? { userId: profile.id, name: profile.name, displayName: profile.displayName } : null;
}

export class RequestQueue {
  private readonly entries = new Map<string, DanceRequest>();
  private readonly pendingIds: string[] = [];
  private readonly lastRequestByUser = new Map<number, number>();

  constructor(
    private readonly resolveProfile: ProfileResolver = lookupRobloxUser,
    private readonly cooldownMs = 30_000,
    private readonly maxPending = 100
  ) {}

  async enqueue(username: string, source: string): Promise<DanceRequest> {
    if (!USERNAME_PATTERN.test(username)) {
      throw new Error("Use um nome de usuário Roblox válido, com 3 a 20 letras, números ou _.");
    }

    const profile = await this.resolveProfile(username);
    if (!profile) throw new Error(`Não encontrei o usuário Roblox "${username}".`);

    const lastRequest = this.lastRequestByUser.get(profile.userId) ?? 0;
    if (Date.now() - lastRequest < this.cooldownMs) {
      throw new Error("Esse jogador já pediu uma dança recentemente. Tente de novo em alguns segundos.");
    }
    if (this.pendingIds.length >= this.maxPending) {
      throw new Error("A fila está cheia. Tente novamente daqui a pouco.");
    }

    const request: DanceRequest = {
      ...profile,
      id: crypto.randomUUID(),
      source,
      createdAt: new Date().toISOString(),
      status: "queued"
    };
    this.entries.set(request.id, request);
    this.pendingIds.push(request.id);
    this.lastRequestByUser.set(profile.userId, Date.now());
    return request;
  }

  claimNext(): DanceRequest | null {
    const id = this.pendingIds.shift();
    if (!id) return null;

    const request = this.entries.get(id);
    if (!request) return null;
    request.status = "playing";
    return request;
  }

  complete(id: string): boolean {
    return this.entries.delete(id);
  }

  snapshot(): DanceRequest[] {
    return [...this.entries.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }
}
