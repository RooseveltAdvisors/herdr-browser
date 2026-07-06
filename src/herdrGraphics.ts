import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";

const STREAM_WRITE_TIMEOUT_MS = 2_000;

export type PaneGraphicsTarget = {
  socketPath: string;
  paneId: string;
};

export type PaneGraphicsPlacement = {
  viewportCol: number;
  viewportRow: number;
  gridCols: number;
  gridRows: number;
};

export type PngSize = {
  width: number;
  height: number;
};

export type PaneGraphicsFrame = {
  png: Buffer;
  image: PngSize;
  placement: PaneGraphicsPlacement;
};

export type PaneGraphicsInfo = {
  cellWidthPx: number;
  cellHeightPx: number;
};

type HerdrSuccessResponse = {
  id: string;
  result: unknown;
};

type HerdrErrorResponse = {
  id: string;
  error: {
    code: string;
    message: string;
  };
};

export function paneGraphicsTargetFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PaneGraphicsTarget | null {
  const socketPath = env.HERDR_SOCKET_PATH?.trim();
  const paneId = env.HERDR_PANE_ID?.trim();
  if (!socketPath || !paneId) {
    return null;
  }
  return { socketPath, paneId };
}

export function pngSizeFromBase64(data: string): PngSize | null {
  const buffer = Buffer.from(data, "base64");
  return pngSizeFromBuffer(buffer);
}

export function pngSizeFromBuffer(buffer: Buffer): PngSize | null {
  if (buffer.length < 24) {
    return null;
  }
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    return null;
  }
  return { width, height };
}

export class PaneGraphicsStream {
  private pendingWrite: Promise<void> = Promise.resolve();
  private closed = false;
  private closeListeners = new Set<(error: Error | null) => void>();

  private constructor(
    private readonly socket: Socket,
  ) {
    socket.once("end", () => this.markClosed(null));
    socket.once("close", () => this.markClosed(null));
    socket.once("error", (error) => this.markClosed(error));
    if (socket.destroyed || socket.readableEnded) {
      queueMicrotask(() => this.markClosed(null));
    }
  }

  static async open(options: {
    target: PaneGraphicsTarget;
    timeoutMs?: number;
  }): Promise<PaneGraphicsStream> {
    const socket = createConnection(options.target.socketPath);
    try {
      await waitForConnect(socket, options.timeoutMs ?? 5000);
      await writeBuffer(socket, Buffer.from(`${JSON.stringify({
        id: `herdr-browser:graphics-stream:${randomUUID()}`,
        method: "pane.graphics.stream",
        params: {
          pane_id: options.target.paneId,
        },
      })}\n`));

      const response = await readLine(socket, options.timeoutMs ?? 5000);
      const parsed = JSON.parse(response) as HerdrSuccessResponse | HerdrErrorResponse;
      if ("error" in parsed) {
        throw new Error(parsed.error.message);
      }

      return new PaneGraphicsStream(socket);
    } catch (error) {
      socket.destroy();
      throw error;
    }
  }

  sendFrame(frame: PaneGraphicsFrame): Promise<void> {
    const write = this.pendingWrite.then(() => this.writeFrame(frame));
    this.pendingWrite = write.catch(() => {});
    return write;
  }

  onClose(listener: (error: Error | null) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.socket.end();
    this.notifyClose(null);
  }

  destroy(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.socket.destroy();
    this.notifyClose(null);
  }

  private async writeFrame(frame: PaneGraphicsFrame): Promise<void> {
    if (this.closed || this.socket.destroyed) {
      throw new Error("pane graphics stream is closed");
    }
    const header = Buffer.from(`${JSON.stringify({
      format: "png",
      image_width: frame.image.width,
      image_height: frame.image.height,
      data_length: frame.png.length,
      placement: {
        viewport_col: frame.placement.viewportCol,
        viewport_row: frame.placement.viewportRow,
        grid_cols: frame.placement.gridCols,
        grid_rows: frame.placement.gridRows,
      },
    })}\n`);
    await writeBuffer(this.socket, header, STREAM_WRITE_TIMEOUT_MS);
    await writeBuffer(this.socket, frame.png, STREAM_WRITE_TIMEOUT_MS);
  }

  private markClosed(error: Error | null): void {
    if (!this.closed) {
      this.closed = true;
    }
    this.notifyClose(error);
  }

  private notifyClose(error: Error | null): void {
    const listeners = [...this.closeListeners];
    this.closeListeners.clear();
    for (const listener of listeners) {
      listener(error);
    }
  }
}

export async function setPaneGraphicsLayer(options: {
  target: PaneGraphicsTarget;
  pngBase64: string;
  image: PngSize;
  placement: PaneGraphicsPlacement;
  timeoutMs?: number;
}): Promise<void> {
  await sendHerdrRequest(options.target.socketPath, {
    id: `herdr-browser:graphics:${randomUUID()}`,
    method: "pane.graphics.set",
    params: {
      pane_id: options.target.paneId,
      format: "png",
      image_width: options.image.width,
      image_height: options.image.height,
      data_base64: options.pngBase64,
      placement: {
        viewport_col: options.placement.viewportCol,
        viewport_row: options.placement.viewportRow,
        grid_cols: options.placement.gridCols,
        grid_rows: options.placement.gridRows,
      },
    },
  }, options.timeoutMs);
}

export async function clearPaneGraphicsLayer(options: {
  target: PaneGraphicsTarget;
  timeoutMs?: number;
}): Promise<void> {
  await sendHerdrRequest(options.target.socketPath, {
    id: `herdr-browser:graphics-clear:${randomUUID()}`,
    method: "pane.graphics.clear",
    params: {
      pane_id: options.target.paneId,
    },
  }, options.timeoutMs);
}

export async function paneGraphicsInfo(options: {
  target: PaneGraphicsTarget;
  timeoutMs?: number;
}): Promise<PaneGraphicsInfo> {
  const response = await sendHerdrRequest(options.target.socketPath, {
    id: `herdr-browser:graphics-info:${randomUUID()}`,
    method: "pane.graphics.info",
    params: {
      pane_id: options.target.paneId,
    },
  }, options.timeoutMs);
  const result = response.result as {
    type?: unknown;
    cell_width_px?: unknown;
    cell_height_px?: unknown;
  };
  if (
    result.type !== "pane_graphics_info" ||
    typeof result.cell_width_px !== "number" ||
    result.cell_width_px <= 0 ||
    typeof result.cell_height_px !== "number" ||
    result.cell_height_px <= 0
  ) {
    throw new Error("Herdr returned invalid pane graphics metrics");
  }
  return {
    cellWidthPx: result.cell_width_px,
    cellHeightPx: result.cell_height_px,
  };
}

async function sendHerdrRequest(
  socketPath: string,
  request: unknown,
  timeoutMs = 5000,
): Promise<HerdrSuccessResponse> {
  const response = await new Promise<string>((resolve, reject) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let buffer = "";
    const timer = setTimeout(() => {
      finish(new Error("timed out waiting for Herdr API response"));
      socket.destroy();
    }, timeoutMs);

    function finish(error: Error): void;
    function finish(line: string): void;
    function finish(value: Error | string): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      if (value instanceof Error) {
        reject(value);
      } else {
        resolve(value);
      }
    }

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      finish(buffer.slice(0, newline));
      socket.end();
    });
    socket.on("error", finish);
    socket.on("close", () => {
      if (!settled) {
        finish(new Error("Herdr API connection closed without a response"));
      }
    });
  });

  const parsed = JSON.parse(response) as HerdrSuccessResponse | HerdrErrorResponse;
  if ("error" in parsed) {
    throw new Error(parsed.error.message);
  }
  return parsed;
}

async function waitForConnect(socket: Socket, timeoutMs: number): Promise<void> {
  if (!socket.connecting) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("timed out connecting to Herdr API"));
    }, timeoutMs);

    function finish(error?: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    function onConnect() {
      finish();
    }

    function onError(error: Error) {
      finish(error);
    }

    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

async function readLine(socket: Socket, timeoutMs: number): Promise<string> {
  socket.setEncoding("utf8");
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let buffer = "";
    const timer = setTimeout(() => {
      finish(new Error("timed out waiting for Herdr API response"));
    }, timeoutMs);

    function finish(error: Error): void;
    function finish(line: string): void;
    function finish(value: Error | string): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (value instanceof Error) {
        reject(value);
      } else {
        resolve(value);
      }
    }

    function onData(chunk: string) {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      finish(buffer.slice(0, newline));
    }

    function onError(error: Error) {
      finish(error);
    }

    function onClose() {
      finish(new Error("Herdr API connection closed without a response"));
    }

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function writeBuffer(socket: Socket, buffer: Buffer, timeoutMs = 5000): Promise<void> {
  if (socket.destroyed) {
    throw new Error("Herdr API connection is closed");
  }
  if (socket.write(buffer)) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error("timed out writing to Herdr API"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("drain", onDrain);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function onDrain() {
      cleanup();
      resolve();
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error("Herdr API connection closed while writing"));
    }

    socket.once("drain", onDrain);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}
