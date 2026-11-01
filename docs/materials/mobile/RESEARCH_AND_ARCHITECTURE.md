# Mobile residence: research conclusions and architecture

This research and design document, dated September 12, 2026, preserves the reasoning and qualifications behind a proposed mobile version of Anima. The preferred development direction is Swift on iOS and iPadOS, with Android considered afterward. Platform-specific Android research remains useful within its stated scope; it does not silently become an iOS entitlement. The mobile implementation remains future work.

Anima already has a product shape. Moving it to a phone must preserve that product rather than starting a generic mobile chat box under its name. The phone can own the running product while the computer remains its main development environment. These requirements are compatible.

Three evidence categories remain separate: the examined documents and selected source establish what was available in that snapshot; public primary sources describe what other products and frameworks publicly support; the architecture and acceptance proposals describe how Anima might evolve. They do not establish that a phone was connected, a mobile package built or run, a paper reproduced, or a competitor measured. The connected [Mobile references](../../scenarios/MOBILE_REFERENCES.md) retain 39 public primary-source entries and eight explicit design briefs, with dates, evidence categories and limitations. This document does not represent a fresh audit of every link.

## 1. Correcting the earlier plan

The earlier plan correctly separated cloud model inference from the phone's local Harness. It required a local primary database, operation without a computer gateway, and evidence from a real device after disconnection. It also protected human memory semantics and truthful action receipts. Those requirements remain valuable.

Its weakness was choosing Kotlin and Compose too early and treating the existing React product chiefly as interface material to migrate. Its development loop centered on simulators and physical devices. Fast browser-based design and computer execution of the shared core were not first-class workflows. Its interface criteria—clicks, text entry, and enlarged fonts—did not adequately protect the existing map or the product's aesthetic. The current iOS-first preference likewise must not become a reason to discard working product relationships without examining them.

Success is the intersection of four conditions: independent phone operation, continuity of existing capabilities, continuity of visual and interaction quality, and development efficiency that is not tied to waiting for a simulator. A native implementation is not inherently unattractive; Web technology is not inherently beautiful. Fidelity comes from design assets, interaction contracts, and comparison with the actual product. Protect those before selecting a platform, rather than hoping to repair the experience with a final request to make it prettier.

## 2. What the examined material actually supports reusing

The original research used project navigation, introductory documentation, a memory discussion, an earlier human-centered design, two mobile designs, and a minimal source archive containing 112 entries. It selectively read migration-related code and did not execute that project. The archive identity and private source correspondence are not included here.

| Existing part | Observation in that snapshot | Migration implication |
|---|---|---|
| React interface and styles | Application views, settings, Harness views, design tokens, refinements, and map themes were present. | A mobile target does not by itself require redrawing them. |
| OpenLayers map | The map engine used planar vectors, GeoJSON, projections, selection, camera control, and pinch rotation. | Direct reuse is plausible; device GPU behavior and gestures still need actual evidence. |
| Map semantics | Geographic data, display projection, position accuracy, provenance, and route failure states were represented. | Preserve those meanings, rather than retaining only a map screenshot. |
| Map host coupling | The map used the desktop bridge, local map resources, and in-memory camera and selection state. | Adapt the bridge and recovery; the component need not be discarded wholesale. |
| Harness and domain contracts | TypeScript runtime, memory, work, actions, capabilities, and shared objects were present. | Separate host dependencies while preserving the same semantics and using common work traces to compare behavior. |
| Database and desktop main process | Synchronous Node SQLite, filesystem and path modules, and Electron host capabilities were used. | Ordinary mobile WebViews cannot run these unchanged. Real phone adapters are required. |
| External academic-record reader | Documentation described a restricted subprocess bridge with an explicit directory. | A reusable protocol does not make a desktop subprocess executable portable to a phone. Current academic connections must be configured and authorized independently. |
| Complete map assets | The minimal archive did not include the entire asset and public-data directories. | The original research could not reconstruct or visually verify the finished map. Check the actual authorized repository. |

Navigation described the map as two-dimensional. Public geographic services were used for name cross-checking, rather than as permission to copy a three-dimensional geometry set; the inspected renderer used planar coordinates. A request to preserve projection and appearance protects an existing experience. It does not establish an existing 3D map.

Statements such as “implemented” and “passed” in old project documents belong to those documents' recorded versions. They are not results for a new mobile package. Existing desktop map and weather work also must not be described as wholly absent. The accurate question is which existing domain and desktop capabilities have been verified and connected to the mobile host.

## 3. Relevant product references and their limits

### 3.1 Operit: a local mobile agent rather than only a remote control

The original reading of R06 found a maintainer-described Android agent that could connect cloud or local models, invoke device tools, and retain chat, memory, and configuration locally. It described assistant, widget, and floating entrances, with permissions separated by tool and by facilities such as accessibility or a debugging broker.

This is a useful public reference for a third-party application owning conversation, memory, a tool loop, and several system entrances. It is not an independent success-rate audit on a particular device. Anima also need not copy a complete terminal, role platform, or development workbench: its purpose is useful companionship and help. Check licenses before copying code.

### 3.2 Perplexity Android Assistant: access without first finding an icon

The official help material in R05 described choosing it as the default Android assistant and invoking it through supported device buttons or gestures. The useful lesson is easy access to the same assistant. That page did not establish where its complete memory or agent controller ran; do not infer a local architecture from a default-assistant setting.

### 3.3 Contextual work without taking over the original task

The R01–R03 design briefs connect task assistance, reminders, intentional memory capture and continued use of the person's original task. The desired experience is a less intrusive entrance, contextual saving and visible execution state, with the same draft, focus and object still available. These are requirements to develop and observe, not claims about a particular product or device.

System privileges, partner applications, services and platform adaptation remain separate conditions. One consent does not grant a third-party app every system role. Preserve the useful interaction through ordinary interfaces where possible and treat qualified platform access as a distinct, conditional route.

### 3.4 Gemini screen automation: useful evidence with a narrow applicability envelope

R04's dated official description placed this capability in a beta on selected Android devices and applications, subject to region, language, account, and rollout conditions. Connected applications were preferred when they could do the work. Some flows used a virtual execution environment on the phone, with observation and stopping controls; takeover varied by device.

The design lesson is that APIs and GUI actions can coexist, and the user must be able to observe and interrupt execution. A vendor's phone-local virtual environment is different from the developer computer's simulator. It does not establish that an ordinary application can create equivalent isolated application instances or control arbitrary applications. Recheck current official eligibility before any implementation decision.

### 3.5 Apple App Intents and Siri: expose a controlled action rather than an entire app

R09–R10 and R47 describe semantic application actions and an announced direction involving personal context and action. An official announcement is not evidence that every user has received a capability.

Anima could eventually expose such bounded actions as creating an Anima work item, querying the next item, or returning to a particular work state. This is separate from gaining permission to discover and invoke somebody else's actions. The iOS-first direction makes these native contracts important research; it does not authorize inventing APIs or claiming access already granted.

### 3.6 Development controllers and phone endpoints

R07 is a design brief about locating orchestration; R08 records the earlier reading of Mobilerun's framework, cloud and portal material. A computer-side Python, CLI, ADB or cloud controller is different from a phone execution endpoint. A portal does not automatically host the entire agent. Preserve useful GUI execution and observation methods for later authorized work, while obtaining separate evidence that Anima runs independently after the computer is turned off. Record the development controller's location separately from the product core's location.

### 3.7 Seven claims that must remain separate

Being installed as a phone app, being selectable as the default assistant, storing data locally, running the control loop locally, keeping model weights locally, controlling other applications, and continuing after the screen locks are seven different claims. Answer each one when evaluating a competitor or Anima. The label “mobile agent” is insufficient evidence for any combination of them.

## 4. Permission is not one slider from zero to root

### Ordinary application interfaces

Opening an app, starting navigation, sharing material, and opening a prefilled calendar flow can use formal platform actions, links, or target APIs. Such work need not wait for accessibility or root access. A target accepting an invocation, opening a screen, saving data, and completing a task are still different outcomes. R25 and R46 provide the original Android references; iOS work must use its own documented contracts.

Begin with formal interfaces and authorized HTTP connectors that help with real work, including study when relevant. Structured actions often express a task more clearly than guessing buttons. Their usefulness is not measured by how privileged they are.

### Optional user-controlled special access

On supported platforms a user may separately choose an assistant, notification access, screen capture, or accessibility access. These solve different problems: an entrance, selected notification information, permitted screen content, or exposed UI structure and gestures. Together they still do not create arbitrary access to other applications' databases. See the dated R26–R29 boundaries.

A lightweight assistant service lifecycle is not unlimited background inference or a system superuser. Notification access is not an API for complete private chat histories. Capture does not bypass protected content. Accessibility does not guarantee that every control is readable or every task is executable. This research enables no location access, screen-watching permission, or other special access.

### Debugging and privileged routes

R31–R32 described a debugging broker making already-authorized ADB or root-service capabilities available to an app. A wireless-debugging activation route may avoid a continuing computer connection on some Android versions, but restart behavior, manufacturer restrictions, and reactivation costs require evidence. ADB-level access is neither root nor an OEM signature.

Signature and privileged permissions have signing, system allowlist, or other eligibility conditions. Vendor-restricted capabilities can require a profile or access-control approval. A user's agreement cannot substitute for those requirements (R15, R33–R34).

The useful distinction is ordinary interfaces, separately chosen special access, an explicitly labeled personal enhancement experiment, and a vendor-qualified route. The answer is neither a blanket assertion that third parties can do nothing nor a promise of vendor-level powers. An iOS design requires a separate assessment; Android privilege routes are not portable permissions.

### AppFunctions: preserve both sides of the interface without assuming admission

The original R11–R13 reading described an experimental Android 16+ semantic-function preview. Its permission documentation combined a normal protection level with runtime allowlisting, and public integration carried preview conditions. These are dated research findings, not a declaration of current unrestricted availability; consult the current SDK and official documentation before building against them.

Keep exposing Anima's own controlled actions separate from discovering and invoking eligible registered actions elsewhere. If calling access is unavailable, ordinary APIs and links remain useful. Admission to a particular ecosystem must not become a prerequisite for the whole product.

### Distribution policy is another independent axis

R30's recorded Play policy restricted autonomous initiation, planning, and execution through accessibility in ordinary applications, while distinguishing qualifying disability-focused tools and specified deterministic human-defined automation. Consult the current policy for the intended channel before distribution.

This is a distribution boundary, not proof that the underlying Android capability does not exist. Conversely, a successful personal installation does not establish commercial eligibility. Keep the standard product, explicitly labeled personal enhancement experiments, and vendor-qualified work separate. Do not hide a capability during review.

## 5. Architecture: retain the product and native-adapt the duties that require it

The proposed logical structure is:

```text
Same product interface, map, and design variables
                     |
Same domain semantics, common ground, memory, work, action protocol
                     |
            Narrow ports and controlled events
              /                     \
Computer development adapter     Phone native adapter
Fast UI/core iteration           Database, secrets, network,
and existing checks              permissions, scheduling, clock,
                                 permitted app interaction
                                           |
                                 Independent phone operation
```

Position-related work uses manual origins, explicit imports and app-internal virtual coordinates or trajectories. Keep OS location services and permissions off on every platform, including emulators and guests. Preserve source, simulated provenance, quality, expiry, unknown, cancellation and recovery states. A virtual trajectory establishes neither real arrival nor official activity credit, and this proposal does not claim an app-internal virtual workout source already exists. A public reference for weather is not a device location.

Capacitor is one documented Web/native integration option in R17–R19. It does not port Node modules, provide a database automatically, or solve lifecycle rules. The original proposal preferred trying a shared interface and shared-core vertical slice, then retaining the interface while moving more execution native if a measured limit appeared. A broad native UI rewrite was a fallback requiring evidence. The current iOS/Swift direction should compare these choices against the same product slice, without first building three incomplete products or treating an old framework preference as an irrevocable instruction.

A thin shell merely displays a page. This proposal instead requires the phone's own private primary store, real model networking, permission owner, action owner, and appropriate scheduling, with the computer services off. The Web layer, where retained, is presentation and interaction.

A native bridge requires trusted-origin restrictions and a narrow callable surface. External pages and text cannot run bridge scripts. Secrets stay out of the React layer. Tool output is data, not executable code. The model receives no arbitrary SQL or shell path into the host (R22).

Synchronous Node transactions need explicit asynchronous or batched native transactions. Persist the message and its outbox entry together. Preserve optimistic revisions, idempotency, deletion fences, and original evidence. These are protected semantics, rather than optional complications to remove until chat starts working. A desktop subprocess is one implementation of a protocol, not the protocol itself.

## 6. Most development can still happen on a computer

Use the computer for shared-core iteration, existing checks, and diagnosis of recorded failures; a same-origin browser workbench for interface and interaction; simulators for appropriate operating-system contracts; and physical devices for actual hardware, manufacturer compatibility, and lived experience. R23–R24 support distinguishing local and device checks and using desktop debugging tools for WebViews. No new test suite or runner is authorized by this material.

There is no need to invent a claim that 90% of work happens on the computer. Better criteria are concrete: changing a card margin should not require waiting for a simulator; changing a memory rule should not require installing a fresh package every time. Conversely, a local Node result cannot prove a phone reminder survives lifecycle changes, and computer browser frame rates cannot prove map fluidity on a phone.

The development workbench should use the same components and core. Host adapters can differ. Simulators and phones have separate workspaces and databases: screen mirroring does not copy a database, and hot reload does not migrate memory. An explicit, safe data-package round trip is a sufficient first transfer design; multi-primary live synchronization is a separate later problem.

## 7. Preserve more than a theme palette

The examined product already contained design variables, refined styling, light and dark maps, and camera and selection state. Preserve information hierarchy, comfortable reading, restrained appearance of controls, and continuity between work and map. A successful button click alone is insufficient.

A phone needs deliberate changes for thumb reach, keyboards and composition, safe areas, back navigation, larger text, long material, and two-finger gestures. A desktop pinch-rotation implementation does not prove smooth rendering of the actual layers on a particular phone GPU. Native implementation likewise does not justify discarding the map.

Compare the same content in the existing and mobile experiences: long reading, arrangement editing, memory correction, map places and routes, themes, and permission failure. Pixel identity across different screens is unnecessary. Each intentional difference should explain what the user can do more easily.

Severe regressions should prevent a later release: a placeholder replacing the real map; typography falling back to an undifferentiated default; a gentle interaction becoming an engineering control room; returning from a map and losing a draft; streaming output forcibly moving the reader; or a weak position estimate rendered as exact navigation. Passing code checks while these experiences worsen does not satisfy product continuity. Inspect the actual visual and interaction result when implementing changes.

## 8. Residence means continuous work, not an immortal loop

The main app, a selected share, a widget, a shortcut, and an eligible assistant entrance should resume the same work. Sharing conveys only the selected material and the URI rights actually granted. Widgets show existing arrangements. Assistant entrances return to the existing item (R26, R35–R36).

“The second option we just discussed” needs a stable referent across entrances. Opening navigation and returning should preserve the work. A new system notification can relate to a goal only within the allowed source scope; it does not authorize reading unrelated life records.

Background mechanisms must match the platform. The original Android examples used appropriate persistent deferred work, alarm facilities for suitable reminders, and compliant finite foreground work for visible long tasks (R37–R39). iOS requires its own documented scheduling and lifecycle assessment. Ordinary page JavaScript must never be promised to run forever.

R20's background-runner reference was not a full Node process: it lacked the DOM and could destroy event contexts. If shared JavaScript is proposed for background execution, establish that the required storage, network, and cancellation adapters actually work there. Otherwise native code should own deterministic queues, reminders, and verification, with durable checkpoints and lawful recovery. An expired approval or cancelled action does not become valid again because the application resumes.

## 9. Cross-app work needs request, observation, action, and receipt

Use structured APIs and platform handoffs first. A separately authorized enhancement route can inspect a controlled interface and act through its permitted surface. Both routes share the user's commission, source bounds, revisions, cancellation, budgets, and truthful receipts.

Saving an Anima arrangement, opening another app, preparing a form, waiting for confirmation, dispatching an action, having an unknown effect, and verifying completion are different states. A pressed button cannot be silently upgraded to a completed task.

R42's AndroidLab work suggests inspecting subgoals, UI state, and terminal state. R43's MobileWorld work combines GUI, structured tools, and user interaction, supporting API/GUI coexistence. They inform future evaluation design; their published results are not Anima's results.

R44's action-rebinding research concerns the target changing between observation and execution. Recheck the foreground target, window, revision, and authority. A recheck is not an atomic lock and does not eliminate every risk. Prefer a formal API or human takeover for consequential steps. R45's safety abstract supports measuring capability failure and safety failure separately: refusing all work does not establish useful assistance, and task completion cannot excuse overreach.

The original future enhancement demonstration proposed one real but harmless action in an owned companion app, such as creating a synthetic checklist item, with verification from independent stored state. This is a preserved proposal, not permission to create that app or a new test harness now. Compatibility with a real third-party application needs evidence for its actual version. A computer-side debugging tool must not secretly perform the action and credit the phone's Harness.

## 10. Human semantics are part of the port

Immediate corrections, conditions and exceptions, common ground, original-text rereading, audience, obsolete reasons for refusal, goals, and reminder lifecycles belong in the phone's main contract. They cannot wait until every system capability has been connected.

Preserve the combined situations from the original design: someone vents but explicitly asks to record a meeting; immediately corrects its time; asks about weather and returns to the second option; refuses location access but still asks about an explicitly named public place; prepares a message for an instructor that keeps the requested time and tone while omitting a private reason, without sending it; or pauses a goal and expects its goal-driven reminders to stop. These are synthetic design situations, not the owner's biography or a claim that all have run successfully.

Understanding is visible when the user need not repeat known information, an answered time is not asked again, an old soft preference does not veto a present explicit choice, denial of one permission still leaves a useful route, and an unknown effect is investigated rather than declared finished.

## 11. From 24 generic requirements to 72 specific specifications

The 72 entries remain unexecuted design specifications. Their complete bodies are in [Mobile requirements](../../scenarios/MOBILE_REQUIREMENTS.md): development 8, adaptation 10, visual experience 12, human semantics 10, standard phone collaboration 12, recovery and data 10, and enhancement experiments 10. They are not test fixtures or production routing by ID.

Enhancement and vendor admission need separate conclusions. A standard product success does not establish advanced permission access. A promised capability that is blocked stays blocked; changing it to “not applicable” must not conceal a gap.

Four evidence layers are distinct: mechanisms and actual storage; actual model semantics through the explicitly authorized provider and model; actual device and external integration; and the interface and human experience. Side effects of later authorized evaluation belong in isolated workspaces and owned applications, not production accounts or private chat records. This historical document does not authorize a new model call, new tests, a device connection, or a permission change.

The original proposed experiments included changing the same UI without starting a simulator; exercising the same core through its existing entry points; packaging the actual UI and map; stopping all computer backends and retaining phone independence; preserving work when a view is destroyed; using only legitimate platform scheduling; obtaining truthful cross-app handoff receipts; allowing cancellation of enhancement execution; denying fresh authority to stale screenshots or hostile screen text; and moving versioned data without copying secrets or replaying actions. These remain future implementation questions.

The dated research proposed at least 12 representative model trajectories repeated three times, with unfamiliar paraphrases, and reporting every failure and whether all three repetitions succeeded. That was a proposed project goal, not an industry reliability guarantee, a current quota, or authorization to build a runner. Preserve failures instead of selecting the best repetition. Later performance and visual evidence should name the actual target device, release-equivalent package, baseline, and conditions. Without a baseline, do not invent an improvement percentage; without actual student review, do not invent satisfaction results.

## 12. Implementation choices and boundaries

The implementation priorities are to protect the existing interface and map, keep a same-source computer development surface, separate host duties, run the same collaboration logic against the phone's private store, use native credential and scheduling facilities, provide selected sharing and shortcut entrances, and use formal application collaboration. An independently scoped enhancement experiment is conditional on later authorization and platform legality.

Keep interfaces for ecosystem caller eligibility, restricted vendor services, partner APIs, or special virtual-display and multi-instance facilities only where useful. Their actual availability remains conditional. Do not make a new desktop product, a permanent computer server, a cloud primary copy of the whole database, an operating-system workbench, arbitrary downloaded executable plugins, default full-screen watching, default root access, or several agents for every sentence into assumed requirements. A native route must not erase the product's entire aesthetic.

The intended outcome is the complete existing product living on the phone: recognizable interaction, the same ongoing work, and genuinely phone-owned memory and capabilities. The computer remains a useful way to develop it. The move has not been established by this research.

## Reading and execution limits

The original research did not connect the user's physical phone, install competitors, create a simulator, build or run mobile packages, exercise a provider, or reproduce paper experiments. Its minimal package lacked complete map data and actual project screenshots, so it did not claim visual reconstruction. Source findings came from selected files in a particular snapshot; implementation must examine the authorized current workspace.

Competitor descriptions are not independent performance or safety evidence. Unread white-paper bodies, partially accessible vendor pages, and unavailable precise framework documentation cannot establish a private permission or public API. The reference catalog preserves these limits. This research does not establish a mobile runtime, permission, scheduler, upload, or device result.
