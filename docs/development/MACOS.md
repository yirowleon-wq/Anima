# Developing and running Anima on macOS

This is a prepared procedure for establishing Anima's native macOS behavior. Existing Windows observations and previous image or engineering work on a Mac do not establish that Anima itself runs there. Consult [current status](../CURRENT_STATUS.md) for the observations actually recorded.

The commands below describe the **current Electron/React baseline**, not a completed Swift application. The planned [Stage 00 Swift foundation](SWIFT_FOUNDATION_AND_CHARACTER_CONTINUITY.md) first inventories and migrates that desktop experience on the actual Mac, while retaining one authoritative runtime and its data and recovery. Mac execution of either path needs its own observation.

## Project and privacy

Use Anima's own files, [asset manifest](../../visual-assets/manifest.json), licenses, [roadmap](../DEVELOPMENT_ROADMAP.md) and [continuation](../continuation.md). Preserve actual provenance and required notices. Generated character art or a downloaded dependency does not by itself grant general redistribution rights.

Keep credentials, private databases, profiles, imported material and diagnostic artifacts in their own private locations. Use an Anima-owned private data directory; do not depend on another project's database, hidden source directory, account, profile, dependency directory or machine skills. Check the actual workspace and accessible instructions when working in a development environment. A clean directory or a request to ignore other files alone does not prove context isolation. Preserve healthy sessions and current authentication.

Never acquire device location or enable location services or grant location permission on the host, app, website, tool, emulator or guest. Use manual origins, configured public references, explicit non-personal imports and labelled app-internal simulated movement.

## Native dependencies and ordinary entry

Use Anima's own `package.json`, lock files, `.nvmrc` and pinned [Hermes lock](../../runtime/hermes/lock.json). The current requirements are Node 24.18.0 within 24.x, npm 11.16.0, Python 3.13, Git and uv (on PATH or selected through ANIMA_UV). Follow the [installation prerequisites](../../README.md#start-locally) and install dependencies afresh for the actual platform and architecture. Check installed versions before deciding what is missing.

From Anima's own directory:

```sh
npm ci
npm run setup
npm run dev
```

For the built local app:

```sh
npm run build
npm start
```

Run the appropriate existing checks (`check`, `test`, `test:hermes`) for the changed scope. The prepared `package:mac` command targets an Intel Mac directory build; its presence is not a successful, signed, notarized or distributed Mac app.

Inspect actual native dependencies and outputs: Electron; the matching Darwin/x64 canvas binding and PDF worker/ICU resources; Python and the pinned Hermes sidecar/imports; ORT's platform library/staging; the declared optional embedding-resource state; file case, executable paths and package resources; Inter, mathematical fonts and selected art. Missing optional semantic resources must leave honest lexical/original-source readback, not a fake semantic success. A web build does not establish native PDF or the main loop.

The live Luna connection requires the target machine's own locally installed and authenticated Codex CLI session. Check it through Anima's connection controls and inspect the actual response identity; a successful image invocation alone does not establish Anima's model path. Do not export account credentials or an account home. Electron main retains private storage and uses the available OS protection for protected local payloads. Check actual macOS protection/Keychain behavior without printing secret values; this does not establish encryption of the whole database or every index/backup.

Keep installation dependencies and runtime files independently reproducible within the declared environment; do not rely on temporary agent sessions or undeclared `NODE_PATH`.

## Outcomes to establish

Use the actual app at normal and narrow window sizes. Read meaningful text, formulas and long labels; inspect fonts, character/room scale, light, controls and focus. Exercise affected motion and interruption, keyboard alternatives and reduced motion. A static image cannot establish time behavior.

From normal entries, establish a real conversation under the permitted product route; an actual generated interactive creation; parameter takeover; a follow-up that reads the real value; and saving/reopening at the layer claimed. Use permitted material or a note and actual calendar preview/save/cancel/undo when in scope. Check original identity, revision, draft and source on return; do not substitute a standalone component demo or new test harness.

For PDF, import a permitted real document and inspect actual text/boxes and page pixels, selection/citation, page return and affected note anchoring. Record scan/text-layer limitations accurately. For the synthetic map, use manual points or labelled simulated movement to exercise actual topology, camera, route, workout pause/resume and recovery without device location. Native notifications, touch, audio and external providers require their own actual evidence when claimed. OS submission is not reading, and an audio output signal is not confirmed physical hearing.

When an operation fails, retain the current draft/object, diagnose and fix an in-scope cause, then repeat its actual trigger. Record an unresolved external condition and the alternatives actually attempted. Compilation alone does not establish platform completion.

## Development tools and continuation

Use the project skills through the actual tool's supported mechanism. Follow [tooling](TOOLING.md) for the recorded image workflow and its limits: new PNG generation, editing/reference inputs and concurrent ownership are distinct capabilities.

After real work, preserve the same objects and version and update the project continuation with observed behavior, remaining conditions and the next entry. A platform outcome is established by the corresponding actual evidence.
