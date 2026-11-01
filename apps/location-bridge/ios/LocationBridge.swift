import SwiftUI
import CoreLocation

@MainActor final class LocationBridge: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var message = "Start a workout from the desktop map"
    @Published private(set) var listening = false
    @Published private(set) var awaitingConsent = false
    private let manager = CLLocationManager()
    private var timer: Timer?
    private var commandTimer: Timer?
    private var lastCommandId = ""
    private var lastReadCommandId = ""
    private var commandProcessedAt: TimeInterval = 0
    private var commandMonotonic: TimeInterval = 0
    private var closedNonces: [String] = []
    private var workoutId = ""
    private var nonce = ""
    private var deadline: TimeInterval = 0
    private var sequence = 0
    private var points: [[String: Any]] = []
    private var state = "stopped"
    private var lastLocationTime: TimeInterval = 0
    private var subscriptionStartedAt: TimeInterval = 0
    private let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("workout-location.json")
    private let controlFile = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("workout-control.json")

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .fitness
        // A process restart never resumes a subscription or restores precise points.
        if let data = try? Data(contentsOf: file),
           let old = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            workoutId = old["workoutId"] as? String ?? ""
            nonce = old["nonce"] as? String ?? ""
            closedNonces = Array((old["closedNonces"] as? [String] ?? []).suffix(64))
            if !nonce.isEmpty && !closedNonces.contains(nonce) { closedNonces.append(nonce) }
        }
        // A command left behind by an earlier process cannot resume location.
        if let data = try? Data(contentsOf: controlFile),
           let old = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            lastReadCommandId = old["commandId"] as? String ?? ""
        }
        persist()
        commandTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.readControl() }
        }
    }

    private func readControl() {
        guard let data = try? Data(contentsOf: controlFile), data.count <= 4096,
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              command["version"] as? Int == 1,
              let commandId = command["commandId"] as? String, valid(commandId), commandId != lastReadCommandId else { return }
        // Consume the envelope before time/owner checks, so a later clock correction
        // or the end of another workout cannot turn a previously refused START live.
        lastReadCommandId = commandId
        guard let issuedAt = command["issuedAt"] as? Double,
              abs(Date().timeIntervalSince1970 * 1000 - issuedAt) < 15000,
              let action = command["action"] as? String, ["start", "heartbeat", "stop"].contains(action),
              let owner = command["workoutId"] as? String, valid(owner),
              let token = command["nonce"] as? String, valid(token) else { return }
        // Consumed does not mean accepted: a rejected command must not later replay,
        // and must not replace the ACK of a healthy owner.
        handle(action: action, owner: owner, token: token, commandId: commandId)
    }

    private func acknowledge(_ commandId: String) {
        lastCommandId = commandId
        commandProcessedAt = Date().timeIntervalSince1970 * 1000
        commandMonotonic = ProcessInfo.processInfo.systemUptime
    }

    private func handle(action: String, owner: String, token: String, commandId: String) {
        let same = owner == workoutId && token == nonce
        switch action {
        case "start":
            guard !closedNonces.contains(token) else { return }
            // No unrelated owner can take over an active subscription.
            guard (!listening && state != "starting") || same else { return }
            if same && (listening || state == "starting") {
                acknowledge(commandId)
                deadline = ProcessInfo.processInfo.systemUptime + 20
                persist()
                return
            }
            acknowledge(commandId)
            if !same { sequence = 0; points = []; lastLocationTime = 0 }
            workoutId = owner; nonce = token
            deadline = ProcessInfo.processInfo.systemUptime + 20
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    if ProcessInfo.processInfo.systemUptime >= self.deadline { self.stop("The desktop connection ended. Location reading stopped", status: "lease-expired") }
                }
            }
            state = "starting"
            awaitingConsent = true
            message = "Ready for this workout. Choose Allow this session to begin."
        case "heartbeat":
            guard same, listening else { return }
            acknowledge(commandId)
            deadline = ProcessInfo.processInfo.systemUptime + 20
        case "stop":
            if !same {
                // STOP can overtake a not-yet-consumed START in the private control file.
                // Remember that nonce without disturbing a different live subscription.
                if !closedNonces.contains(token) { closedNonces.append(token) }
                closedNonces = Array(closedNonces.suffix(64))
                guard !listening && state != "starting" else { persist(); return }
                workoutId = owner; nonce = token
            }
            acknowledge(commandId)
            stop("Location reading stopped")
        default: return
        }
        persist()
    }

    private func valid(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 128 && value.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) || "-_.:".unicodeScalars.contains($0)
        }
    }

    private func startIfAllowed() {
        guard state == "starting", !awaitingConsent else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            listening = true; state = "listening"; message = "Recording location for this workout"
            subscriptionStartedAt = Date().timeIntervalSince1970
            manager.startUpdatingLocation()
        case .denied, .restricted:
            stop("Location was not allowed. This session has stopped", status: "denied")
        case .notDetermined: message = "Waiting for your location permission choice"
        @unknown default: stop("Location is unavailable for this session", status: "unavailable")
        }
        persist()
    }

    func allowCurrentSession() {
        guard awaitingConsent, state == "starting", !closedNonces.contains(nonce),
              ProcessInfo.processInfo.systemUptime < deadline else { return }
        awaitingConsent = false
        manager.requestWhenInUseAuthorization()
        startIfAllowed()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if listening && (manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted) {
            stop("Location permission is off", status: "denied")
        } else { startIfAllowed() }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { stop("Location permission is off", status: "denied") }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard listening else { return }
        for location in locations {
            let stamp = location.timestamp.timeIntervalSince1970
            guard stamp.isFinite, stamp >= subscriptionStartedAt, stamp > lastLocationTime,
                  location.horizontalAccuracy.isFinite, location.horizontalAccuracy >= 0,
                  CLLocationCoordinate2DIsValid(location.coordinate) else { continue }
            lastLocationTime = stamp; sequence += 1
            func optional(_ value: Double, valid: Bool) -> Any { valid && value.isFinite ? value : NSNull() }
            var point: [String: Any] = [
                "sequence": sequence, "longitude": location.coordinate.longitude, "latitude": location.coordinate.latitude,
                "timestamp": stamp * 1000, "accuracy": location.horizontalAccuracy,
                "altitude": optional(location.altitude, valid: location.verticalAccuracy > 0),
                "altitudeAccuracy": optional(location.verticalAccuracy, valid: location.verticalAccuracy > 0),
                "speed": optional(location.speed, valid: location.speed >= 0),
                "heading": optional(location.course, valid: location.course >= 0)
            ]
            if #available(iOS 15.0, *) { point["simulatedBySoftware"] = location.sourceInformation?.isSimulatedBySoftware ?? false }
            points.append(point)
        }
        points = Array(points.suffix(16))
        persist()
    }

    func stop(_ reason: String = "Location reading stopped", status: String = "stopped") {
        manager.stopUpdatingLocation()
        timer?.invalidate(); timer = nil
        listening = false; awaitingConsent = false; state = status; message = reason; points = []
        if !nonce.isEmpty && !closedNonces.contains(nonce) { closedNonces.append(nonce) }
        closedNonces = Array(closedNonces.suffix(64))
        persist()
    }

    private func persist() {
        let observedAt = Date().timeIntervalSince1970 * 1000
        let commandElapsed: Any = commandMonotonic > 0
            ? max(0, ProcessInfo.processInfo.systemUptime - commandMonotonic) * 1000 : NSNull()
        let value: [String: Any] = ["version": 1, "workoutId": workoutId, "nonce": nonce,
            "commandId": lastCommandId, "processId": ProcessInfo.processInfo.processIdentifier,
            "commandProcessedAt": commandProcessedAt, "commandElapsedMs": commandElapsed,
            "closedNonces": closedNonces,
            "status": state, "activeSubscriptions": listening ? 1 : 0,
            "sequence": sequence, "updatedAt": observedAt, "points": points]
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        do { try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
        catch { stopWithoutWrite() }
    }
    private func stopWithoutWrite() {
        manager.stopUpdatingLocation(); timer?.invalidate(); timer = nil
        listening = false; awaitingConsent = false; state = "unavailable"; points = []; message = "The position could not be saved. Recording stopped"
    }
}

@main struct AnimaLocationApp: App {
    @StateObject private var bridge = LocationBridge()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: 24) {
                Image(systemName: "figure.walk").font(.system(size: 46, weight: .light)).foregroundStyle(Color(red: 0.59, green: 0.44, blue: 0.20))
                Text("Anima Location").font(.system(.largeTitle, design: .serif).weight(.medium))
                    .foregroundStyle(Color(red: 0.36, green: 0.33, blue: 0.28))
                Text(bridge.message).font(.title3).foregroundStyle(Color(red: 0.43, green: 0.40, blue: 0.35))
                #if targetEnvironment(simulator)
                Text("Simulator position · not your physical location").font(.footnote).foregroundStyle(.secondary)
                #endif
                if bridge.awaitingConsent {
                    Button("Allow this session") { bridge.allowCurrentSession() }
                        .font(.title3.weight(.medium)).frame(maxWidth: .infinity, minHeight: 44)
                        .buttonStyle(.borderedProminent).tint(Color(red: 0.59, green: 0.44, blue: 0.20))
                }
                Button { bridge.stop() } label: {
                    Label("Stop location reading", systemImage: "stop.fill")
                        .font(.title3.weight(.medium)).frame(maxWidth: .infinity, minHeight: 44)
                }
                    .buttonStyle(.borderedProminent).tint(Color(red: 0.59, green: 0.44, blue: 0.20))
                    .opacity(bridge.listening || bridge.awaitingConsent ? 1 : 0)
                    .disabled(!bridge.listening && !bridge.awaitingConsent)
                    .accessibilityHidden(!bridge.listening && !bridge.awaitingConsent)
            }
            .padding(32).frame(maxWidth: 460, maxHeight: .infinity, alignment: .leading)
            .frame(maxWidth: .infinity).background(Color(red: 0.98, green: 0.97, blue: 0.94))
            .onChange(of: phase) { next in if next == .background { bridge.stop("The location view was left. Reading stopped") } }
        }
    }
}
