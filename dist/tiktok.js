export class TikTokLiveAdapter {
    onComment;
    onError;
    loadConnector;
    connection = null;
    connectionTimeout = null;
    creator = null;
    connected = false;
    connecting = false;
    lastError = null;
    generation = 0;
    constructor(onComment, onError = console.error, loadConnector = async () => {
        const dynamicImport = new Function("name", "return import(name)");
        return dynamicImport("tiktok-live-connector");
    }) {
        this.onComment = onComment;
        this.onError = onError;
        this.loadConnector = loadConnector;
    }
    get status() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            creator: this.creator,
            error: this.lastError
        };
    }
    async connect(uniqueId) {
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
            if (generation !== this.generation)
                return;
            this.creator = uniqueId;
            this.connecting = true;
            const connector = await this.loadConnector();
            if (generation !== this.generation)
                return;
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
                if (this.connection !== connection)
                    return;
                this.clearConnectionTimeout();
                this.connected = true;
                this.connecting = false;
                this.lastError = null;
            });
            connection.on(disconnectedEvent, (details) => {
                if (this.connection !== connection)
                    return;
                const reason = details;
                this.clearConnectionTimeout();
                this.connected = false;
                this.connecting = false;
                this.lastError = reason?.reason || (reason?.code ? `TikTok desconectou (código ${reason.code}).` : null);
                this.connection = null;
            });
            connection.on(errorEvent, (details) => {
                if (this.connection !== connection)
                    return;
                const event = details;
                const error = event?.exception ?? event?.info ?? details;
                this.lastError = error instanceof Error ? error.message : String(error ?? "Erro do conector TikTok.");
                this.onError(error);
            });
            this.connectionTimeout = setTimeout(() => {
                if (this.connection !== connection || !this.connecting)
                    return;
                this.connection = null;
                this.connectionTimeout = null;
                this.creator = null;
                this.connected = false;
                this.connecting = false;
                this.lastError = "O TikTok não respondeu em 30 segundos. Confirme que a conta está ao vivo e com a live pública.";
                void Promise.resolve(connection.disconnect?.()).catch(this.onError);
            }, 30_000);
            void connection.connect().then(() => {
                if (this.connection !== connection)
                    return;
                this.clearConnectionTimeout();
                this.connected = true;
                this.connecting = false;
                this.lastError = null;
            }).catch((error) => {
                if (this.connection !== connection)
                    return;
                this.failConnection(connection, error);
            });
        }
        catch (error) {
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
    async disconnect() {
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
    clearConnectionTimeout() {
        if (this.connectionTimeout)
            clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
    }
    failConnection(connection, error) {
        if (this.connection !== connection)
            return;
        this.connection = null;
        this.clearConnectionTimeout();
        this.creator = null;
        this.connected = false;
        this.connecting = false;
        this.lastError = this.errorMessage(error);
        this.onError(error);
    }
    errorMessage(error) {
        return error instanceof Error ? error.message : String(error);
    }
}
