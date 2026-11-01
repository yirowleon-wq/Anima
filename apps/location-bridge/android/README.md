# Android location bridge: historical implementation

This legacy debug bridge connects Android's native location reader to Anima's desktop `WorkoutSessionKernel`. It is not a complete mobile companion and has no internet permission or institutional activity submission path. It requests OS location permission and subscribes to GPS/network providers, so it is not a route for current development, including on an emulator. Keep location services and permissions off on every platform. Use manual origins, explicit imports or app-internal virtual coordinates and trajectories; simulated movement is not real arrival or official activity credit.

The documented November 1, 2026 review did not activate a device, emulator, location service, or location permission. Native compilation, permission presentation, sensor sampling, and stop acknowledgement remain unverified target-device behaviors. These sources do not establish independent mobile operation or real-world GPS accuracy. The standing prohibition on enabling location services or granting location permission applies to all work here.

## Historical build and transport

The original build entry requires Python 3, JDK 17, Android platform 35, and build-tools 35.0.0. It does not download dependencies or modify global PATH. Gradle and Node are not required. Building or installing this native acquisition helper is not a current development objective.

`ANDROID_HOME` or `ANDROID_SDK_ROOT` can supply the SDK; `JAVA_HOME` can supply the JDK. Without an SDK variable, the script checks the ordinary platform SDK directory: `%LOCALAPPDATA%/Android/Sdk`, `~/Library/Android/sdk`, or `~/Android/Sdk`. Use explicit arguments for another installation.

Outputs stay in `build/`. The debug key is the user's own `.android/debug.keystore` and is not distributed. The APK is `build/anima-location-bridge-debug.apk`, package `studio.anima.location`.

Installation does not prove location collection, stop recovery, or sensors work. Keep APKs, keystores, device state, captured positions, and SDK installations out of shared artifacts.

## Historical owner and packet contract

The existing desktop adapter references `MapLocationProvider.discoverDevices()` and `createWorkoutStream({ source: 'adb', deviceId, workoutId })`. Multiple devices require an explicit choice. The transport identifier differs from the installation's stable `deviceId`; transports for the same device are deduplicated using the current boot identity. `ANIMA_ADB_PATH` may explicitly identify ADB. Preserve the `WorkoutLocationStream` packet and confirmed-stop boundaries when replacing or retiring the native acquisition path. A missing position stream remains unavailable; it must not be represented as a working virtual source.

A desktop request carries a random session nonce and the original workout ID. In this legacy implementation the native activity waits for its visible **Allow location for this workout** control before requesting permission or starting collection. Launching it alone does not request location. Reopening an already active subscription preserves it; another workout cannot take it over. Do not activate this path or grant its permission.

The historical design separated physical activity permission from location permission. Declining step sensing must not turn unknown cadence into zero; source and collection state remain distinct. The standing prohibition prevents granting location permission or enabling location services.

## Observations and clocks

In the legacy implementation Android `LocationManager` supplies raw GPS and network callbacks. Each fix retains WGS84 coordinates, original epoch time, device elapsed realtime, reported horizontal accuracy (the system's 68% radius), optional altitude/speed/bearing, provider, installation identity, and mock provenance. Generic emulator evidence or Android mock status marks an observation `simulated`, but that label does not make the OS location route permissible. Without such evidence, the bridge retains `unknown` provenance; `isMock=false` does not establish a physical device. Preserve source, quality and time meaning without inventing physical or institutional acceptance.

The desktop owns source selection, filtering, and distance calculation. A weaker provider remains in the same raw record as `provider-not-selected`, without edited coordinates, time, or speed, and does not advance the distance anchor. A source switch establishes a new baseline. The ten-second source freshness window is local policy, not a callback or accuracy guarantee.

The bridge reports the current boot clock. An elapsed-realtime value outside that interval is retained as `reportedElapsedRealtimeMs` with its clock-quality result, rather than repaired with a guessed offset. The epoch timestamp stays unchanged. Older observations without a checked boot range remain unverified.

Step sensing prefers actual `TYPE_STEP_DETECTOR` events; only if unavailable does it use raw `TYPE_STEP_COUNTER` observations. Sensor identity, version, permission state, boot clock, subscription identity, and provenance accompany each observation. Missing sensors, denied permission, waiting for the first step, and stopped sensing are distinct. The desktop derives cadence only from sufficient actual events; map movement, GPS speed, and assumed step length cannot fill missing steps. A cumulative counter may arrive late.

## Lease and stop recovery

App-private `location-state.json` contains at most 64 recent fixes for handoff. It is not a second persistent workout database. The service is `START_NOT_STICKY` and never resumes after reboot. It stops after 20 seconds without desktop renewal; normal renewals are five seconds apart. Lease expiry is a safeguard, not proof the desktop observed stopping.

A successful stop requires readback for the same nonce and workout: stopped status, empty fix buffer, zero location and sensor subscriptions, and no remaining bridge listener in the system provider. A broadcast alone is not that acknowledgement. Unknown results preserve the original stop identity for retry; they do not authorize stopping a different workout or starting a new stream. Recovery may reconstruct a stream from the original retained identity solely to stop it, never to auto-start it.

`studio.anima.location.KEEPALIVE` and `.STOP` require Android's `DUMP` permission. Bounded nonce tombstones stop late starts or permission callbacks from reviving cancelled requests, even when Stop arrived first. Sensor listeners and event buffers are released on pause, finish, cancellation, lease expiry, or destruction. Android 14 uses the `health` foreground-service type only when a real step sensor and its permission are available; otherwise it uses `location` alone.

`android:debuggable=true` and `run-as` belong only to this local development protocol. `run-as` reads this app's private handoff buffer. A production mobile host needs an authenticated platform connection; this debug route is not a general data-reading interface. No undeclared coordinate conversion occurs.

References: [Location](https://developer.android.com/reference/android/location/Location), [permissions](https://developer.android.com/develop/sensors-and-location/location/permissions), [location foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types#location), [motion sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion), [health service type](https://developer.android.com/develop/background-work/services/fgs/service-types#health), and [SDK Build Tools](https://developer.android.com/tools/releases/build-tools).
