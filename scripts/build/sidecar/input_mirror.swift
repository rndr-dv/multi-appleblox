import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

private let syntheticEventTag: Int64 = 0x4D554C5441424C58

struct MirrorCommand: Codable {
    let command: String
    let managedPids: [Int32]?
    let receiverPids: [Int32]?
    let primaryPid: Int32?
    let enabled: Bool?
}

struct MirrorStatus: Codable {
    let type: String
    let enabled: Bool
    let sourcePid: Int32?
    let error: String?
}

struct SelfTestStatus: Codable {
    let ok: Bool
    let coordinateTransform: Bool
    let protocolParsing: Bool
    let syntheticTagging: Bool
}

struct MirrorSnapshot {
    let enabled: Bool
    let managedPids: Set<pid_t>
    let receiverPids: Set<pid_t>
    let primaryPid: pid_t?
}

final class MirrorState {
    private let lock = NSLock()
    private var enabled = false
    private var managedPids = Set<pid_t>()
    private var receiverPids = Set<pid_t>()
    private var primaryPid: pid_t?
    private var sourcePid: pid_t?

    func configure(managedPids: [Int32], receiverPids: [Int32], primaryPid: Int32?) {
        lock.lock()
        self.managedPids = Set(managedPids)
        self.receiverPids = Set(receiverPids)
        self.primaryPid = primaryPid
        if self.receiverPids.isEmpty {
            enabled = false
            sourcePid = nil
        }
        lock.unlock()
    }

    func setEnabled(_ enabled: Bool) {
        lock.lock()
        self.enabled = enabled && !receiverPids.isEmpty
        if !self.enabled {
            sourcePid = nil
        }
        lock.unlock()
    }

    func toggleEnabled() -> Bool {
        lock.lock()
        enabled = !enabled && !receiverPids.isEmpty
        if !enabled {
            sourcePid = nil
        }
        let result = enabled
        lock.unlock()
        return result
    }

    func snapshot() -> MirrorSnapshot {
        lock.lock()
        let snapshot = MirrorSnapshot(
            enabled: enabled,
            managedPids: managedPids,
            receiverPids: receiverPids,
            primaryPid: primaryPid
        )
        lock.unlock()
        return snapshot
    }

    func updateSource(_ sourcePid: pid_t?) -> Bool {
        lock.lock()
        let changed = self.sourcePid != sourcePid
        self.sourcePid = sourcePid
        lock.unlock()
        return changed
    }
}

private let outputQueue = DispatchQueue(label: "com.multablox.app.input-mirror.output")
private var eventTap: CFMachPort?

func emit<T: Encodable>(_ value: T) {
    outputQueue.sync {
        let data = try! JSONEncoder().encode(value)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }
}

func emitStatus(_ state: MirrorState, sourcePid: pid_t? = nil, error: String? = nil) {
    emit(
        MirrorStatus(
            type: "status",
            enabled: state.snapshot().enabled,
            sourcePid: sourcePid,
            error: error
        )
    )
}

func windowFrames(for processIds: Set<pid_t>) -> [pid_t: CGRect] {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return [:]
    }
    var frames: [pid_t: CGRect] = [:]
    for item in windows {
        guard
            let ownerPid = item[kCGWindowOwnerPID as String] as? Int,
            processIds.contains(pid_t(ownerPid)),
            frames[pid_t(ownerPid)] == nil,
            let layer = item[kCGWindowLayer as String] as? Int,
            layer == 0,
            let boundsValue = item[kCGWindowBounds as String],
            let frame = CGRect(dictionaryRepresentation: boundsValue as! CFDictionary),
            frame.width > 0,
            frame.height > 0
        else {
            continue
        }
        frames[pid_t(ownerPid)] = frame
    }
    return frames
}

func transformPoint(_ point: CGPoint, from source: CGRect, to receiver: CGRect) -> CGPoint {
    guard source.width > 0, source.height > 0 else {
        return CGPoint(x: receiver.midX, y: receiver.midY)
    }
    let relativeX = (point.x - source.minX) / source.width
    let relativeY = (point.y - source.minY) / source.height
    return CGPoint(
        x: receiver.minX + relativeX * receiver.width,
        y: receiver.minY + relativeY * receiver.height
    )
}

func isMouseEvent(_ type: CGEventType) -> Bool {
    return [
        .leftMouseDown,
        .leftMouseUp,
        .rightMouseDown,
        .rightMouseUp,
        .otherMouseDown,
        .otherMouseUp,
        .mouseMoved,
        .leftMouseDragged,
        .rightMouseDragged,
        .otherMouseDragged,
    ].contains(type)
}

func isMirrorHotkey(_ type: CGEventType, _ event: CGEvent) -> Bool {
    guard
        (type == .keyDown || type == .keyUp),
        event.getIntegerValueField(.keyboardEventKeycode) == 46
    else {
        return false
    }
    let flags = event.flags
    return flags.contains(.maskCommand) &&
        flags.contains(.maskShift) &&
        !flags.contains(.maskControl) &&
        !flags.contains(.maskAlternate)
}

func eventMask() -> CGEventMask {
    let eventTypes: [CGEventType] = [
        .keyDown,
        .keyUp,
        .flagsChanged,
        .leftMouseDown,
        .leftMouseUp,
        .rightMouseDown,
        .rightMouseUp,
        .otherMouseDown,
        .otherMouseUp,
        .mouseMoved,
        .leftMouseDragged,
        .rightMouseDragged,
        .otherMouseDragged,
        .scrollWheel,
    ]
    return eventTypes.reduce(CGEventMask(0)) { mask, type in
        mask | (CGEventMask(1) << type.rawValue)
    }
}

let mirrorCallback: CGEventTapCallBack = { _, type, event, userInfo in
    guard let userInfo else {
        return Unmanaged.passUnretained(event)
    }
    let state = Unmanaged<MirrorState>.fromOpaque(userInfo).takeUnretainedValue()

    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        state.setEnabled(false)
        if let eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: true)
        }
        emitStatus(state, error: "Input event tap was disabled by macOS")
        return Unmanaged.passUnretained(event)
    }

    if event.getIntegerValueField(.eventSourceUserData) == syntheticEventTag {
        return Unmanaged.passUnretained(event)
    }

    if isMirrorHotkey(type, event) {
        if type == .keyDown {
            _ = state.toggleEnabled()
            emitStatus(state)
        }
        return nil
    }

    let snapshot = state.snapshot()
    guard snapshot.enabled else {
        return Unmanaged.passUnretained(event)
    }

    let frontmostPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
    let sourcePid: pid_t
    if let frontmostPid {
        guard snapshot.managedPids.contains(frontmostPid) else {
            return Unmanaged.passUnretained(event)
        }
        sourcePid = frontmostPid
    } else if let primaryPid = snapshot.primaryPid, snapshot.managedPids.contains(primaryPid) {
        sourcePid = primaryPid
    } else {
        return Unmanaged.passUnretained(event)
    }

    let targets = snapshot.receiverPids
        .intersection(snapshot.managedPids)
        .filter { $0 != sourcePid }
    guard !targets.isEmpty else {
        state.setEnabled(false)
        emitStatus(state, sourcePid: sourcePid, error: "No live mirror receiver is selected")
        return Unmanaged.passUnretained(event)
    }

    let frames = isMouseEvent(type)
        ? windowFrames(for: Set(targets).union([sourcePid]))
        : [:]
    let sourceFrame = frames[sourcePid]
    for targetPid in targets {
        guard let clonedEvent = event.copy() else {
            continue
        }
        clonedEvent.setIntegerValueField(.eventSourceUserData, value: syntheticEventTag)

        if let sourceFrame, let targetFrame = frames[targetPid] {
            clonedEvent.location = transformPoint(event.location, from: sourceFrame, to: targetFrame)
        }
        clonedEvent.postToPid(targetPid)
    }
    if state.updateSource(sourcePid) {
        emitStatus(state, sourcePid: sourcePid)
    }
    return Unmanaged.passUnretained(event)
}

func runSelfTest() -> Never {
    let transformed = transformPoint(
        CGPoint(x: 25, y: 75),
        from: CGRect(x: 0, y: 0, width: 100, height: 100),
        to: CGRect(x: 100, y: 200, width: 200, height: 400)
    )
    let coordinateTransform = transformed == CGPoint(x: 150, y: 500)

    let commandData = """
    {"command":"configure","managedPids":[101,102],"receiverPids":[102],"primaryPid":101}
    """.data(using: .utf8)!
    let command = try? JSONDecoder().decode(MirrorCommand.self, from: commandData)
    let protocolParsing =
        command?.command == "configure" &&
        command?.managedPids == [101, 102] &&
        command?.receiverPids == [102] &&
        command?.primaryPid == 101

    let testEvent = CGEvent(
        keyboardEventSource: nil,
        virtualKey: 0,
        keyDown: true
    )
    testEvent?.setIntegerValueField(.eventSourceUserData, value: syntheticEventTag)
    let syntheticTagging =
        testEvent?.getIntegerValueField(.eventSourceUserData) == syntheticEventTag

    let ok = coordinateTransform && protocolParsing && syntheticTagging
    emit(
        SelfTestStatus(
            ok: ok,
            coordinateTransform: coordinateTransform,
            protocolParsing: protocolParsing,
            syntheticTagging: syntheticTagging
        )
    )
    exit(ok ? 0 : 1)
}

func requestPermissions() -> Never {
    let accessibilityGranted = AXIsProcessTrusted()
    let inputMonitoringGranted: Bool
    if #available(macOS 10.15, *) {
        inputMonitoringGranted = CGRequestListenEventAccess()
    } else {
        inputMonitoringGranted = true
    }

    let missing = [
        accessibilityGranted ? nil : "Accessibility",
        inputMonitoringGranted ? nil : "Input Monitoring",
    ].compactMap { $0 }
    guard missing.isEmpty else {
        emit(
            MirrorStatus(
                type: "status",
                enabled: false,
                sourcePid: nil,
                error: "macOS denied \(missing.joined(separator: " and ")) to MultaBlox. Enable MultaBlox in the matching Privacy & Security sections, restart the app, then try again."
            )
        )
        exit(5)
    }
    emit(MirrorStatus(type: "status", enabled: false, sourcePid: nil, error: nil))
    exit(0)
}

if CommandLine.arguments.contains("--self-test") {
    runSelfTest()
}

if CommandLine.arguments.contains("--request-permissions") {
    requestPermissions()
}

let state = MirrorState()
guard AXIsProcessTrusted() else {
    emitStatus(state, error: "macOS denied Accessibility to MultaBlox")
    exit(3)
}

let statePointer = Unmanaged.passRetained(state).toOpaque()
guard let createdTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: eventMask(),
    callback: mirrorCallback,
    userInfo: statePointer
) else {
    Unmanaged<MirrorState>.fromOpaque(statePointer).release()
    emitStatus(state, error: "Input Monitoring permission is not granted")
    exit(4)
}
eventTap = createdTap

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, createdTap, 0)
CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: createdTap, enable: true)

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard
            let data = line.data(using: .utf8),
            let command = try? JSONDecoder().decode(MirrorCommand.self, from: data)
        else {
            emitStatus(state, error: "Malformed input mirror command")
            continue
        }

        switch command.command {
        case "configure":
            state.configure(
                managedPids: command.managedPids ?? [],
                receiverPids: command.receiverPids ?? [],
                primaryPid: command.primaryPid
            )
            emitStatus(state)
        case "set-enabled":
            state.setEnabled(command.enabled ?? false)
            emitStatus(state)
        case "stop":
            state.setEnabled(false)
            emitStatus(state)
            CFRunLoopStop(CFRunLoopGetMain())
            return
        default:
            emitStatus(state, error: "Unknown input mirror command")
        }
    }
    CFRunLoopStop(CFRunLoopGetMain())
}

emitStatus(state)
CFRunLoopRun()
Unmanaged<MirrorState>.fromOpaque(statePointer).release()
