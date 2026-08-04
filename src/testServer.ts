#!/usr/bin/env bun

export {};

const port = Number.parseInt(process.env.HERDR_BROWSER_TEST_PORT ?? "5174", 10);

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Herdr Browser Click Test</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      color: #172033;
      background: #f4f6f9;
    }

    body {
      margin: 0;
      min-height: 100vh;
    }

    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 16px;
      padding: 18px;
    }

    section,
    aside {
      border: 1px solid #d5dbe6;
      border-radius: 8px;
      background: #fff;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(20, 30, 50, 0.07);
    }

    h1 {
      margin: 0 0 14px;
      font-size: 24px;
      letter-spacing: 0;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 15px;
      letter-spacing: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(120px, 1fr));
      gap: 12px;
      align-items: stretch;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      border: 1px solid #9aa8bd;
      border-radius: 8px;
      background: #edf3ff;
      color: #12345a;
      cursor: pointer;
      min-height: 48px;
      padding: 10px 12px;
      font-weight: 700;
    }

    button:active {
      transform: translateY(1px);
      background: #dbeaff;
    }

    button:hover,
    .hover-card:hover {
      border-color: #2f7d5a;
      background: #e3f8ed;
      color: #0f3b2a;
    }

    nav {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
      position: relative;
      z-index: 2;
    }

    .menu {
      position: relative;
    }

    .submenu {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 180px;
      border: 1px solid #9bb6a7;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 12px 28px rgba(20, 40, 30, 0.16);
      padding: 8px;
    }

    .menu:hover .submenu {
      display: grid;
      gap: 6px;
    }

    .submenu a {
      border-radius: 6px;
      color: #153b2b;
      padding: 7px 8px;
      text-decoration: none;
    }

    .submenu a:hover {
      background: #e3f8ed;
    }

    .large {
      min-height: 150px;
      font-size: 24px;
      grid-column: span 2;
    }

    .tiny {
      width: 34px;
      min-height: 34px;
      padding: 0;
      justify-self: center;
      align-self: center;
      border-radius: 50%;
      background: #ffe8d2;
      color: #6f3200;
    }

    .wide {
      grid-column: 1 / -1;
    }

    .controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: #45556f;
    }

    input,
    select {
      border: 1px solid #aeb8c9;
      border-radius: 6px;
      padding: 9px 10px;
      background: #fff;
      color: #172033;
    }

    #target {
      display: grid;
      place-items: center;
      min-height: 180px;
      margin-top: 14px;
      border: 2px dashed #9aa8bd;
      border-radius: 8px;
      background: linear-gradient(135deg, #fff 0%, #eef7f2 100%);
      user-select: none;
    }

    .hover-card {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 92px;
      margin-top: 14px;
      border: 1px solid #9aa8bd;
      border-radius: 8px;
      background: #f7fbff;
      font-weight: 700;
    }

    .popover {
      display: none;
      position: absolute;
      right: 16px;
      bottom: calc(100% + 8px);
      width: 220px;
      border: 1px solid #9bb6a7;
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      box-shadow: 0 14px 32px rgba(20, 40, 30, 0.18);
      font-size: 13px;
      font-weight: 500;
    }

    .hover-card:hover .popover {
      display: block;
    }

    #counter {
      font-variant-numeric: tabular-nums;
      font-size: 44px;
      font-weight: 800;
      color: #153b2b;
    }

    aside {
      position: sticky;
      top: 18px;
      align-self: start;
    }

    #log {
      display: grid;
      gap: 6px;
      min-height: 320px;
      max-height: 520px;
      overflow: auto;
      margin: 0;
      padding: 0;
      list-style: none;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    #log li {
      border-bottom: 1px solid #edf0f5;
      padding: 5px 0;
      color: #33425a;
    }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Herdr Browser Click Test</h1>
      <nav>
        <button class="menu" data-action="menu">
          Hover menu
          <span class="submenu">
            <a href="#one">First hover item</a>
            <a href="#two">Second hover item</a>
            <a href="#three">Third hover item</a>
          </span>
        </button>
        <button data-action="hover-button">Hover color target</button>
      </nav>
      <div class="grid">
        <button class="large" data-action="large">Large target</button>
        <button data-action="medium">Medium</button>
        <button class="tiny" data-action="tiny" title="tiny target">T</button>
        <button data-action="left">Left</button>
        <button data-action="center">Center</button>
        <button data-action="right">Right</button>
        <button class="wide" data-action="wide">Wide horizontal target</button>
      </div>

      <div class="controls">
        <label>
          Text input
          <input id="text-input" value="click then type">
        </label>
        <label>
          Select
          <select id="select-input">
            <option>first option</option>
            <option>second option</option>
            <option>third option</option>
          </select>
        </label>
        <label>
          Checkbox
          <input id="check-input" type="checkbox">
        </label>
        <label>
          Range
          <input id="range-input" type="range" min="0" max="100" value="25">
        </label>
      </div>

      <div id="target">
        <div>
          <div id="counter">0</div>
          <div id="last">click any target</div>
        </div>
      </div>

      <div class="hover-card" data-action="hover-card">
        Hover card with popover
        <div class="popover">This popover is pure CSS hover. It should appear without clicking.</div>
      </div>
    </section>

    <aside>
      <h2>Click log</h2>
      <ol id="log"></ol>
    </aside>
  </main>

  <script>
    const counter = document.querySelector("#counter");
    const last = document.querySelector("#last");
    const log = document.querySelector("#log");
    let count = 0;

    function record(label, event) {
      count += 1;
      counter.textContent = String(count);
      last.textContent = label;
      const item = document.createElement("li");
      item.textContent = String(count).padStart(2, "0") + " " + label + " @ " + Math.round(event.clientX) + "," + Math.round(event.clientY);
      log.prepend(item);
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (target) {
        record("button:" + target.dataset.action, event);
        return;
      }
      record(event.target.id || event.target.tagName.toLowerCase(), event);
    });

    document.addEventListener("mouseover", (event) => {
      const target = event.target.closest("[data-action]");
      if (target) {
        last.textContent = "hover:" + target.dataset.action;
      }
    });

    for (const input of document.querySelectorAll("input, select")) {
      input.addEventListener("change", (event) => {
        const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
        last.textContent = event.target.id + "=" + value;
      });
    }
  </script>
</body>
</html>`;

const e2eHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Herdr Browser E2E Fixture</title>
  <style>
    body { margin: 2rem; font: 16px system-ui, sans-serif; color: #172033; }
    main { max-width: 36rem; display: grid; gap: 1rem; }
    label { display: grid; gap: .4rem; }
    input, button { font: inherit; padding: .6rem .8rem; }
    #result { min-height: 1.5rem; }
  </style>
</head>
<body>
  <main>
    <h1>Herdr Browser E2E Fixture</h1>
    <button id="agent-button" type="button">Agent click target</button>
    <p id="clicked">not clicked</p>
    <form id="e2e-form">
      <label>Message <input id="message-input" name="message" autofocus value="initial"></label>
      <button id="submit-button" type="submit">Submit fixture form</button>
    </form>
    <p id="result">not submitted</p>
  </main>
  <script>
    const clicked = document.querySelector("#clicked");
    const input = document.querySelector("#message-input");
    document.querySelector("#agent-button").addEventListener("click", () => {
      clicked.textContent = "clicked";
    });
    document.querySelector("#e2e-form").addEventListener("submit", (event) => {
      event.preventDefault();
      document.querySelector("#result").textContent = "submitted:" + input.value;
    });
  </script>
</body>
</html>`;

const benchmarkHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Herdr Browser Render Benchmark</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #10141c; }
    body { font-family: system-ui, sans-serif; color: #f4f7fb; }
    #stage { position: relative; width: 100%; height: 100%; contain: strict; }
    .tile {
      position: absolute;
      width: 18%;
      aspect-ratio: 1;
      border-radius: 8px;
      background: #e85d75;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      animation: orbit 2s linear infinite alternate;
      will-change: transform;
    }
    .tile:nth-child(2) { top: 20%; left: 15%; background: #45b69c; animation-delay: -0.5s; }
    .tile:nth-child(3) { top: 48%; left: 38%; background: #f6ae2d; animation-delay: -1s; }
    .tile:nth-child(4) { top: 12%; left: 66%; background: #5c80bc; animation-delay: -1.5s; }
    @keyframes orbit {
      from { transform: translate3d(0, 0, 0) rotate(0deg); }
      to { transform: translate3d(220%, 120%, 0) rotate(270deg); }
    }
    #counter { position: absolute; left: 18px; top: 14px; font: 700 20px ui-monospace, monospace; }
  </style>
</head>
<body>
  <div id="stage">
    <div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div>
    <div id="counter">0</div>
  </div>
  <script>
    const counter = document.querySelector("#counter");
    let frames = 0;
    function tick() {
      frames += 1;
      counter.textContent = String(frames);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  </script>
</body>
</html>`;

Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    const body = pathname === "/benchmark" ? benchmarkHtml : pathname === "/e2e" ? e2eHtml : html;
    return new Response(body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  },
});

console.log(`Herdr browser test page: http://127.0.0.1:${port}/`);
await new Promise(() => {});
