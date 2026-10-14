export interface TikTokChatMessage {
  comment?: string;
  user?: {
    uniqueId?: string;
    nickname?: string;
  };
}

interface LiveConnection {
  on(event: string, listener: (message: TikTokChatMessage) => void): void;
  connect(): Promise<unknown>;
  disconnect?: () => Promise<void> | void;
}

interface TikTokConnectorModule {
  TikTokLiveConnection: new (uniqueId: string) => LiveConnection;
  WebcastEvent?: { CHAT?: string };
  ControlEvent?: { CONNECTED?: string; DISCONNECTED?: string; ERROR?: string };
}

type ConnectorLoader = () => Promise<TikTokConnectorModule>;

export class TikTokLiveAdapter {
  private connection: LiveConnection | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private creator: string | null = null;
  private connected = false;
  private connecting = false;
  private lastError: string | null = null;
  private generation = 0;

  constructor(
    private readonly onComment: (message: TikTokChatMessage) => Promise<void>,
    private readonly onError: (error: unknown) => void = console.error,
    private readonly loadConnector: ConnectorLoader = async () => {
      const dynamicImport = new Function("name", "return import(name)") as
        (name: string) => Promise<TikTokConnectorModule>;
      return dynamicImport("tiktok-live-connector");
    }
  ) {}

  get status(): { connected: boolean; connecting: boolean; creator: string | null; error: string | null } {
    return {
      connected: this.connected,
      connecting: this.connecting,
      creator: this.creator,
      error: this.lastError
    };
  }

  async connect(uniqueId: string): Promise<void> {
    const generation = ++this.generation;
    const previousConnection = this.connection;
    this.connection = null;
    this.clearConnectionTimeout();
    this.creator = null;
    this.connected = false;
    this.connecting = false;
    this.lastError = null;

    try {
      await previousConnection?.disconnect?.();
      if (generation !== this.generation) return;

      this.creator = uniqueId;
      this.connecting = true;
      const connector = await this.loadConnector();
      if (generation !== this.generation) return;

      const connection = new connector.TikTokLiveConnection(uniqueId);
      const chatEvent = connector.WebcastEvent?.CHAT ?? "chat";
      const connectedEvent = connector.ControlEvent?.CONNECTED ?? "connected";
      const disconnectedEvent = connector.ControlEvent?.DISCONNECTED ?? "disconnected";
      const errorEvent = connector.ControlEvent?.ERROR ?? "error";

      this.connection = connection;
      connection.on(chatEvent, (message) => {
        void this.onComment(message).catch(this.onError);
      });
      connection.on(connectedEvent, () => {
        if (this.connection !== connection) return;
        this.clearConnectionTimeout();
        this.connected = true;
        this.connecting = false;
        this.lastError = null;
      });
      connection.on(disconnectedEvent, (details) => {
        if (this.connection !== connection) return;
        const reason = details as { reason?: string; code?: number } | undefined;
        this.clearConnectionTimeout();
        this.connected = false;
        this.connecting = false;
        this.lastError = reason?.reason || (reason?.code ? `TikTok desconectou (código ${reason.code}).` : null);
        this.connection = null;
      });
      connection.on(errorEvent, (details) => {
        if (this.connection !== connection) return;
        const event = details as { info?: string; exception?: unknown } | undefined;
        const error = event?.exception ?? event?.info ?? details;
        this.lastError = error instanceof Error ? error.message : String(error ?? "Erro do conector TikTok.");
        this.onError(error);
      });

      this.connectionTimeout = setTimeout(() => {
        if (this.connection !== connection || !this.connecting) return;
        this.connection = null;
        this.connectionTimeout = null;
        this.creator = null;
        this.connected = false;
        this.connecting = false;
        this.lastError = "O TikTok não respondeu em 30 segundos. Confirme que a conta está ao vivo e com a live pública.";
        void Promise.resolve(connection.disconnect?.()).catch(this.onError);
      }, 30_000);

      void connection.connect().then(() => {
        if (this.connection !== connection) return;
        this.clearConnectionTimeout();
        this.connected = true;
        this.connecting = false;
        this.lastError = null;
      }).catch((error: unknown) => {
        if (this.connection !== connection) return;
        this.failConnection(connection, error);
      });
    } catch (error) {
      if (generation === this.generation) {
        this.connection = null;
        this.clearConnectionTimeout();
        this.creator = null;
        this.connected = false;
        this.connecting = false;
        this.lastError = this.errorMessage(error);
        this.onError(error);
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    const connection = this.connection;
    this.connection = null;
    this.creator = null;
    this.clearConnectionTimeout();
    this.connected = false;
    this.connecting = false;
    this.lastError = null;
    await connection?.disconnect?.();
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    this.connectionTimeout = null;
  }

  private failConnection(connection: LiveConnection, error: unknown): void {
    if (this.connection !== connection) return;
    this.connection = null;
    this.clearConnectionTimeout();
    this.creator = null;
    this.connected = false;
    this.connecting = false;
    this.lastError = this.errorMessage(error);
    this.onError(error);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
