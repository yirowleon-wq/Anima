# Apple Simulator location bridge: historical implementation

This legacy CoreLocation app feeds a workout subscription to Anima's desktop `WorkoutSessionKernel` through an Apple Simulator adapter. It asks for OS location permission and starts CoreLocation updates, so its `simulated` label does not make it an allowed development route. Keep OS location services and permissions off on all platforms, including simulators and guests. Use manual origins, explicit imports or app-internal virtual coordinates and trajectories; simulated movement is not real arrival or official activity credit. The app has no institutional upload, chat engine, model connection, or second workout database.

The documented November 1, 2026 review did not open a Mac, simulator, device, location service, permission dialog, or private SSH configuration. Swift/Xcode compilation, native rendering, permission behavior, stop acknowledgement, and packaging remain unverified target-Mac behaviors. Simulator support does not establish real-device signing, outdoor GPS, background collection, or independent mobile operation. The standing prohibition on enabling location services or granting location permission applies to all work here.

## Historical build and transport

The original build entry requires an installed Xcode toolchain and its command-line tools. Building or installing this native acquisition helper is not a current development objective.

The default output is `build/AnimaLocation.app`, bundle ID `studio.anima.location`. `APPLE_SDK` defaults to `iphonesimulator`; `APPLE_ARCH` defaults to the current Mac architecture. The simulator build uses a local ad-hoc signature. Choosing `iphoneos` changes the compiler target but does not provision or install a real-device app.

Opening the legacy app does not start sampling. A fresh desktop request must identify the workout, and the visible **Allow this session** control is required before CoreLocation permission or collection starts. Stop is also available while awaiting that choice. Do not activate this path or grant its permission.

## Historical local SSH build

`python build.py` uses Python's standard library and ordinary OpenSSH to transfer only `LocationBridge.swift`, `Info.plist`, `build.sh`, and their byte manifest to the user's configured local Mac. This is an explicit build action, not an automatic file bridge. It never chooses a simulator implicitly or starts a virtual machine.

Private connection configuration is not distributed. The build supports `--configuration` or `ANIMA_IOS_SSH_CONFIG`. Default private locations are `%LOCALAPPDATA%/Anima/apple-location.json` on Windows, `~/Library/Application Support/Anima/apple-location.json` on macOS, and `~/.config/Anima/apple-location.json` on other hosts.

The configuration requires loopback host `127.0.0.1`, explicit port and username, absolute paths to the user's SSH identity and verified known-hosts file, and an installed Xcode developer directory. Keep these private files outside the project. Strict host verification remains enabled; do not use a guessed fingerprint or disable checking.

The build helper also has a device option that installs and opens the old bridge; do not use it for location work. Outputs remain below the configured Mac account's `Library/Application Support/Anima/LocationBridge/builds/`. Successful transfer or signing is not a native workflow result.

## Control, clocks and stopping

The existing desktop adapter references `discoverIosLocationDevices()` and `createIosWorkoutLocationStream({ deviceId, workoutId })`. Atomic app-private `workout-control.json` commands carry version, workout ID, nonce, command ID, and issue time. Heartbeats do not focus the app or repeatedly open a URL confirmation. Preserve packet identity, cancellation and stop-confirmation semantics when retiring the native acquisition path; the existing adapter is not an app-internal virtual source.

The bridge consumes each new envelope before time and ownership checks. A rejected command cannot become active later after a clock correction or after another workout ends. It cannot replace a healthy owner's acknowledgement or lease. Bounded closed-nonce records prevent late starts or permission callbacks from restarting a cancelled subscription, including Stop-before-Start.

A process restart ignores its predecessor's control command, clears the handoff buffer, and never resumes sampling. Duplicate Start for the accepted subscription preserves its current state and renews the lease; it does not request permission again or create another listener. Another workout cannot take over a live or pending subscription.

`commandProcessedAt` records actual command acceptance. The first matching acknowledgement bounds the host send-to-readback interval; later fix updates never replace that processing time. `commandElapsedMs`, process identity, and a monotonic clock help validate the anchor. Older records without the exact field do not acquire invented precision.

CoreLocation records the device's own subscription start, ignores older cached fixes, and retains original timestamps. Wall-clock and monotonic spans are compared; a clock jump pauses sampling. Clock correlation preserves an evidenced interval, without rewriting a timestamp or pretending its midpoint was measured. A communication window or anchor over ten seconds, a wall/monotonic discrepancy over 250 milliseconds, stale commands, or conflicting evidence cannot support continuous distance measurement. The desktop's existing five-second future tolerance, thirty-second freshness limit, and fifteen-second segment-gap policy remain intact.

App-private `workout-location.json` keeps at most 16 recent positions and clears them on stop. No positions are sent to a model or personal memory by this bridge. Negative speed/course or nonpositive vertical accuracy remain unknown. Altitude uses Apple's mean-sea-level datum. See [altitude](https://developer.apple.com/documentation/corelocation/cllocation/altitude), [speed](https://developer.apple.com/documentation/corelocation/cllocation/speed), and [vertical accuracy](https://developer.apple.com/documentation/corelocation/cllocation/verticalaccuracy).

Twenty seconds without renewal, leaving the app, permission loss, a user stop, or a file-save failure stops the same subscription. The desktop confirms only after reading the original workout, nonce, and stop command with stopped status, zero listeners, and an empty buffer. Missing acknowledgement stays unknown and never authorizes stopping another workout.

Persistent retention belongs to the desktop owner and its current retention choice. This temporary provider is not a standalone mobile life history or synchronization service. Independent iPhone/iPad hosting and later Android parity remain in the product roadmap.
