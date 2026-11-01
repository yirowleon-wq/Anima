# Runtime components

Anima installs its dependencies in this directory from the pinned npm and Hermes lockfiles. The project does not depend on another checkout or a temporary development session. This page records engineering ownership and ordinary runtime conditions.

| Capability | Implementation |
| --- | --- |
| Desktop host and interface | Electron, React and ReactDOM |
| Conversation | The pinned Hermes `AIAgent`, connected through the host to the local authenticated Codex CLI session |
| Interactive creations | OpenUI React Lang and Anima's checked component language |
| Mathematical reading | KaTeX, remark-math and rehype-katex |
| Document text and page pixels | PDF.js and the platform-specific native canvas package |
| Map and planar fallback | MapLibre GL JS, its style specification, OpenLayers and Earcut |
| Map typography | The selected local Inter glyph resources |
| Optional semantic retrieval | ONNX Runtime and Hugging Face tokenizers; no model is currently configured |
| XML and development map imports | xmldom and osmtogeojson |

`package-lock.json`, `runtime/hermes/lock.json` and `runtime/embedding/lock.json` identify the actual versions and resources. Installed upstream packages retain their own original files and identities, distinct from Anima's authored content and personal data.

The native document worker stages selected runtime files rather than whole package documentation. The public map preview contains selected synthetic map data and its rendering resources; desktop conversations, imported personal records and model credentials are outside that artifact.

The default campus profile supplies an Irvine public reference and `America/Los_Angeles`. The included routable map is a fictional demonstration centered at zero longitude and latitude. Neither the default nor an example establishes a person's enrollment, schedule or history.

Use `npm ci`, `npm run setup` and the normal build commands in the README. Moving between operating systems requires a fresh installation of native dependencies.
