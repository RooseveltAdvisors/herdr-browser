type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type CdpResponse = {
  id?: number;
  result?: unknown;
  error?: {
    message: string;
    data?: string;
  };
  method?: string;
  params?: unknown;
  sessionId?: string;
};

export class CdpClient {
  private nextId = 1;
  private pending = new Map<number, PendingCommand>();
  private listeners = new Map<string, Set<(params: unknown) => void>>();
  private closeListeners = new Set<(error: Error | null) => void>();
  private closed = false;

  private constructor(private readonly socket: WebSocket) {}

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    const client = new CdpClient(socket);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")), {
        once: true,
      });
    });

    socket.addEventListener("message", (event) => client.handleMessage(event.data));
    socket.addEventListener("close", () => client.markClosed(new Error("CDP WebSocket closed")));
    socket.addEventListener("error", () => client.rejectAll(new Error("CDP WebSocket error")));

    return client;
  }

  send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 10_000,
  ): Promise<T> {
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for CDP ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
    });

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return promise;
  }

  on(method: string, listener: (params: unknown) => void): () => void {
    let listeners = this.listeners.get(method);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(method, listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  }

  waitFor(method: string, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(params);
      });
    });
  }

  onClose(listener: (error: Error | null) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.socket.close();
    this.notifyClose(null);
  }

  private handleMessage(data: unknown) {
    const text = typeof data === "string" ? data : String(data);
    const message = JSON.parse(text) as CdpResponse;

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ""}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const method = message.sessionId
        ? `${message.sessionId}:${message.method}`
        : message.method;
      this.listeners.get(method)?.forEach((listener) => listener(message.params));
      this.listeners.get(message.method)?.forEach((listener) => listener(message.params));
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private markClosed(error: Error) {
    this.rejectAll(error);
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.notifyClose(error);
  }

  private notifyClose(error: Error | null) {
    const listeners = [...this.closeListeners];
    this.closeListeners.clear();
    for (const listener of listeners) {
      listener(error);
    }
  }
}
