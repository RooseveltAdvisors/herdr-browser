# Vision

herdr-browser is a house fork of ogulcancelik/herdr-browser, continued after upstream deprecated the project in August 2026.
Upstream's last commit replaced the README with a deprecation notice pointing users at a successor tool; this fork declined to follow it.
The captain's Herdr fleet runs its browser pane workflows on this plugin, and a working dependency is not retired by someone else's notice.
So the fork has one job: keep the plugin correct, hardened, and honest for as long as the fleet uses it, and retire it only when the fleet itself stops needing it.

## The experience it protects

An agent drives a real Chromium while you watch it live in a Herdr pane, and you take over with the mouse and keyboard at any moment without detaching the automation client.
That pane is the whole point: browser automation is otherwise invisible, reconstructed from screenshots after the fact, or babysat in a detached window with no relationship to the session.
The pane stays interactive while a CDP client is connected, so intervention happens mid-run and handing control back needs no reconnecting.
Both parties see one truth: what the agent's CDP client controls is the same rendered page and tab strip the pane shows.

## What the fork carries beyond upstream

It hardens session persistence: a dedicated per-session Chromium profile whose cookies and origin storage survive pane and daemon restarts, while a different Herdr session can never see another session's storage.
It hardens the CDP gateway so every endpoint it hands out is loopback-only and scoped to exactly one view, and keeps that guarantee under test.
It ships a hermetic end-to-end proof, run against a local-only fixture, that exercises DOM inspection, clicks, typing, form submission, screenshots, and persistence across restarts.
It documents the agent workflow as a skill, including an endpoint-safe bootstrap for chrome-devtools-axi that never prints a live endpoint.
It treats input fidelity as a hardening target: dispatched keyboard events must keep their full CDP semantics, so Enter means what it means in a real browser, and the end-to-end proof fails closed when it cannot confirm which pane it is driving.
This direction is deliberate: durability, verifiability, and honest boundaries are what a maintained fork adds to a project upstream stopped maintaining.

## What it must never diverge on

It stays a Herdr plugin: one browser pane entrypoint, the plugin manifest contract, Herdr's graphics stream, and the minimum Herdr version it declares and honors.
It stays a companion, never a rival: a desktop browser wins on devtools, extensions, video, downloads, right-click menus, and IME, and this plugin does not compete there.
It stays local: endpoints are loopback, rendering is tuned for local sessions, and remote SSH is named as out of reach rather than promised.
It keeps ownership straight: the plugin owns Chromium, a closing automation client never kills the browser, and closing the pane is the lifecycle action that ends the view.
It keeps session isolation absolute: per-session profiles with private permissions, and no reuse of your normal browser profile.
It stays honest about limits: an explicit limits section, a named manual-only boundary for real pointer input, and checks that fail closed rather than pass on guesses.
It keeps upstream's MIT license and the original author's copyright.

## Non-goals

- Becoming a general-purpose browser: no devtools surface, downloads, right-click menus, IME, page text selection, or find-in-page.
- Windows support, true popup placement, or remote SSH rendering.
- Attaching to arbitrary existing Chrome processes or reusing a user's normal profile.
- Publishing beyond the fleet; the package stays private.

## Done well, one year out

Every fleet workflow that opens a browser pane still works, and breakage is caught by the hermetic suite before it reaches a live session.
Upstream is archived and unmoved, so divergence here is a one-way door walked deliberately, each carried hardening justified by a failure the fleet actually hit.
The plugin stays boring: it renders, it connects, it persists, it isolates, and nobody has to think about it while it does.
