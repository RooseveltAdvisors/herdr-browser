import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server, type Socket } from "node:net";

import {
  PaneGraphicsStream,
  paneGraphicsInfo,
  paneGraphicsTargetFromEnv,
  pngSizeFromBase64,
  pngSizeFromBuffer,
} from "./herdrGraphics";

test("paneGraphicsTargetFromEnv requires socket path and pane id", () => {
  expect(paneGraphicsTargetFromEnv({})).toBeNull();
  expect(paneGraphicsTargetFromEnv({
    HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    HERDR_PANE_ID: "workspace:p1",
  })).toEqual({
    socketPath: "/tmp/herdr.sock",
    paneId: "workspace:p1",
  });
});

test("pngSizeFromBase64 reads PNG IHDR dimensions", () => {
  const pngHeader = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngHeader, 0);
  pngHeader.writeUInt32BE(13, 8);
  pngHeader.write("IHDR", 12, "ascii");
  pngHeader.writeUInt32BE(640, 16);
  pngHeader.writeUInt32BE(480, 20);

  expect(pngSizeFromBase64(pngHeader.toString("base64"))).toEqual({
    width: 640,
    height: 480,
  });
  expect(pngSizeFromBuffer(pngHeader)).toEqual({
    width: 640,
    height: 480,
  });
  expect(pngSizeFromBase64(Buffer.from("not png").toString("base64"))).toBeNull();
  expect(pngSizeFromBuffer(Buffer.from("not png"))).toBeNull();
});

test("paneGraphicsInfo requests explicit pane cell metrics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-browser-"));
  const socketPath = join(dir, "herdr.sock");
  const server = createServer((socket) => {
    socket.once("data", (data) => {
      const request = JSON.parse(data.toString().trim()) as {
        id: string;
        method: string;
        params: { pane_id: string };
      };
      expect(request.method).toBe("pane.graphics.info");
      expect(request.params).toEqual({ pane_id: "pane_1" });
      socket.end(`${JSON.stringify({
        id: request.id,
        result: {
          type: "pane_graphics_info",
          cell_width_px: 9,
          cell_height_px: 18,
        },
      })}\n`);
    });
  });

  await listen(server, socketPath);
  try {
    expect(await paneGraphicsInfo({
      target: { socketPath, paneId: "pane_1" },
    })).toEqual({ cellWidthPx: 9, cellHeightPx: 18 });
  } finally {
    await closeServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PaneGraphicsStream.open destroys socket when ack read times out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-browser-"));
  const socketPath = join(dir, "herdr.sock");
  let resolveAccepted: (socket: Socket) => void = () => {};
  const accepted = new Promise<Socket>((resolve) => {
    resolveAccepted = resolve;
  });
  const server = createServer((socket) => {
    resolveAccepted(socket);
  });

  await listen(server, socketPath);
  try {
    const open = PaneGraphicsStream.open({
      target: { socketPath, paneId: "pane_1" },
      timeoutMs: 25,
    });
    const socket = await accepted;

    let thrown: unknown;
    try {
      await open;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("timed out waiting for Herdr API response");
    await waitForSocketClose(socket);
    expect(socket.destroyed).toBe(true);
  } finally {
    await closeServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PaneGraphicsStream reports remote closure after a successful open", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-browser-"));
  const socketPath = join(dir, "herdr.sock");
  const server = createServer((socket) => {
    socket.once("data", (data) => {
      const request = JSON.parse(data.toString().trim()) as { id: string };
      socket.end(`${JSON.stringify({ id: request.id, result: {} })}\n`);
    });
  });

  await listen(server, socketPath);
  try {
    const stream = await PaneGraphicsStream.open({
      target: { socketPath, paneId: "pane_1" },
    });
    const closed = new Promise<Error | null>((resolve) => stream.onClose(resolve));
    expect(await closed).toBeNull();
    await expect(stream.sendFrame({
      png: Buffer.from("frame"),
      image: { width: 1, height: 1 },
      placement: { viewportCol: 0, viewportRow: 0, gridCols: 1, gridRows: 1 },
    })).rejects.toThrow("pane graphics stream is closed");
  } finally {
    await closeServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PaneGraphicsStream sends reduced image dimensions with full-grid placement", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-browser-"));
  const socketPath = join(dir, "herdr.sock");
  let resolveFrame: (frame: { header: Record<string, unknown>; body: Buffer }) => void = () => {};
  const receivedFrame = new Promise<{ header: Record<string, unknown>; body: Buffer }>((resolve) => {
    resolveFrame = resolve;
  });
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let opened = false;
    let header: { data_length: number } & Record<string, unknown> | null = null;
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      while (true) {
        if (!opened) {
          const newline = buffer.indexOf(0x0a);
          if (newline === -1) {
            return;
          }
          const request = JSON.parse(buffer.subarray(0, newline).toString()) as { id: string };
          buffer = buffer.subarray(newline + 1);
          opened = true;
          socket.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
          continue;
        }
        if (!header) {
          const newline = buffer.indexOf(0x0a);
          if (newline === -1) {
            return;
          }
          header = JSON.parse(buffer.subarray(0, newline).toString());
          buffer = buffer.subarray(newline + 1);
        }
        const frameHeader = header;
        if (!frameHeader || buffer.length < frameHeader.data_length) {
          return;
        }
        resolveFrame({
          header: frameHeader,
          body: buffer.subarray(0, frameHeader.data_length),
        });
        return;
      }
    });
  });

  await listen(server, socketPath);
  try {
    const stream = await PaneGraphicsStream.open({
      target: { socketPath, paneId: "pane_1" },
    });
    await stream.sendFrame({
      png: Buffer.from("reduced-frame"),
      image: { width: 534, height: 594 },
      placement: { viewportCol: 0, viewportRow: 2, gridCols: 89, gridRows: 44 },
    });

    const frame = await receivedFrame;
    expect(frame.header).toMatchObject({
      format: "png",
      image_width: 534,
      image_height: 594,
      data_length: 13,
      placement: {
        viewport_col: 0,
        viewport_row: 2,
        grid_cols: 89,
        grid_rows: 44,
      },
    });
    expect(frame.body.toString()).toBe("reduced-frame");
    stream.destroy();
  } finally {
    await closeServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function waitForSocketClose(socket: Socket): Promise<void> {
  if (socket.destroyed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    socket.once("close", () => resolve());
  });
}
