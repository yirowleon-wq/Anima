# Anima

Anima is a place to spend an ordinary day with a companion: take a difficult idea seriously, make something, think about an arrangement, keep a thought, go outside, or enjoy an afternoon without a goal. A character's attention and judgment belong in the work from the beginning. Warmth comes from useful help, recognizable personality, and being able to return to the same thought.

The desktop app brings conversation, materials, study, notes, a local calendar, maps, interactive creations, memory, and bounded ongoing help into one workspace. Choosing the full cover and resuming work are distinct actions. A single composer carries the conversation, attachments and unfinished draft between views.

Anima is a personal project for use, play and continued creation. The [project guide](docs/PROJECT_GUIDE.md) maps experiences to their existing implementation and describes fictional places, examples and manual records as useful inputs. The [current capability record](docs/CURRENT_STATUS.md) distinguishes implementation, observations, remaining work and external conditions. The [development roadmap](docs/DEVELOPMENT_ROADMAP.md) preserves the complete longer-term project; it does not describe twelve completed stages.

## Start locally

Use Node **24.18.0** (24.x), npm **11.16.0**, Python **3.13**, Git and **uv**. The setup command must find uv on PATH, or through the explicit ANIMA_UV executable path. The Hermes version and commit are pinned in [runtime/hermes/lock.json](runtime/hermes/lock.json). Install dependencies inside this directory:

```sh
npm ci
npm run setup
npm run dev
```

Install afresh in the chosen directory after moving the project or changing operating system or architecture. Installed virtual environments and native dependencies belong to their actual platform and location; they are not portable substitutes for the lockfiles and setup procedure.

For a built desktop application:

```sh
npm run build
npm start
```

The app owns its private data directory. `ANIMA_DATA_DIR` can select another private directory before launch. Protect databases, credentials, imported personal material and diagnostic profiles when sharing or backing up files. Closing a window may leave a tray process running; quitting the process or sleeping the computer does not provide an always-on service.

Anima's live model is Luna, using a local Codex CLI session through App Server. Install and sign in to Codex on the machine where Anima runs, then choose Luna in Connections and use Check connection. `ANIMA_CODEX_EXECUTABLE` can select an explicit CLI executable. Offline demo mode remains available. The explicit `dev:luna:test` / `start:luna:test` launch commands select the same Luna connection for that process. No credentials or campus accounts are bundled.

## Things to try

- Talk normally, bring a TXT, Markdown or PDF into the workspace, select a passage and continue the same conversation. Selection, sending, keeping and editing are separate actions.
- Write and save a note, reopen it, and return to a cited passage. Your writing remains distinct from quoted material and personal memory.
- Ask for an interactive explanation, change its controls, and discuss the actual values. Programs use a finite checked component language and host-persisted state.
- Preview a local calendar change, inspect its conflict or time, then save or cancel. Export accepted instances within an explicit date range when needed.
- Choose a companion or light in the full room. Appearance and local layout preferences do not rewrite character identity, old message authorship or long-term memory.
- Use explicitly imported campus records and a manual map origin. The included map is a **synthetic demonstration**, not UC Irvine campus navigation. No location permission is required or authorized.

Develop and exercise position-dependent map, route and workout behavior with app-internal simulated fixes and tracks, manual origins or permitted imports. Keep their source and quality explicit; simulation does not prove physical arrival or official credit. Never acquire real device location or enable OS location services or request or grant location permissions on any platform, browser, emulator or guest.

See [project navigation](PROJECT_NAVIGATION.md) for actual implementation entry points, [campus and environment configuration](docs/CAMPUS_AND_ENVIRONMENT.md) for data boundaries, and [Start here](START_HERE.md) for continued development.

## Platforms and checks

Windows x64 has been exercised. Intel macOS packaging and native dependency branches are prepared separately; only observations on that platform can establish Mac operation. See the [macOS setup and verification notes](docs/development/MACOS.md).

The planned [Stage 00](docs/development/SWIFT_FOUNDATION_AND_CHARACTER_CONTINUITY.md) migrates the desktop experience to a native Swift foundation while preserving the single runtime, existing capabilities and data. That migration has not yet been implemented or observed.

```sh
npm run check
npm test
npm run test:hermes
npm run build
```

These existing checks cover their respective mechanisms and build steps. They do not establish every user workflow, model behavior, animation, operating-system notification, PDF, mobile device or external service.

The public-map preview reuses the same map implementation without desktop data or a model:

```sh
npm run review
npm run build:review
npm run preview
```

These commands run or build a local preview; they do not deploy it.

## Art

The ten built-in characters are unofficial interpretations of **MyGO!!!!! / Ave Mujica** characters. Official identity, project-created interaction and editable user configuration remain separate. [Character passports](docs/characters/README.md), [visual direction](FRONTEND_DESIGN.md) and the [asset manifest](visual-assets/manifest.json) identify the art and its purpose.
