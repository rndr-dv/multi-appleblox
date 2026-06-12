import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

struct ProbeResponse: Codable {
    let ok: Bool
    let command: String
    let error: String?
    let window: WindowInfo?
    let display: FrameInfo?
    let commands: [String]?

    init(
        ok: Bool,
        command: String,
        error: String? = nil,
        window: WindowInfo? = nil,
        display: FrameInfo? = nil,
        commands: [String]? = nil
    ) {
        self.ok = ok
        self.command = command
        self.error = error
        self.window = window
        self.display = display
        self.commands = commands
    }
}

struct FrameInfo: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct WindowInfo: Codable {
    let windowId: UInt32
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

func emit(_ response: ProbeResponse, exitCode: Int32 = 0) -> Never {
    let encoder = JSONEncoder()
    let data = try! encoder.encode(response)
    print(String(data: data, encoding: .utf8)!)
    exit(exitCode)
}

func value(after flag: String, in arguments: [String]) -> String? {
    guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else {
        return nil
    }
    return arguments[index + 1]
}

func pid(from arguments: [String]) -> pid_t? {
    guard let raw = value(after: "--pid", in: arguments), let number = Int32(raw), number > 0 else {
        return nil
    }
    return number
}

func requestAccessibilityPermission() -> Bool {
    let options = [
        kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
    ] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

func firstWindow(for processId: pid_t) -> WindowInfo? {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return nil
    }
    for item in raw {
        guard
            let ownerPid = item[kCGWindowOwnerPID as String] as? Int,
            ownerPid == Int(processId),
            let layer = item[kCGWindowLayer as String] as? Int,
            layer == 0,
            let number = item[kCGWindowNumber as String] as? NSNumber,
            let boundsValue = item[kCGWindowBounds as String],
            let rectangle = CGRect(dictionaryRepresentation: boundsValue as! CFDictionary),
            rectangle.width > 0,
            rectangle.height > 0
        else {
            continue
        }
        return WindowInfo(
            windowId: number.uint32Value,
            x: rectangle.origin.x,
            y: rectangle.origin.y,
            width: rectangle.width,
            height: rectangle.height
        )
    }
    return nil
}

func accessibilityWindow(for processId: pid_t) -> AXUIElement? {
    let application = AXUIElementCreateApplication(processId)
    var rawWindows: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(
        application,
        kAXWindowsAttribute as CFString,
        &rawWindows
    )
    guard result == .success, let windows = rawWindows as? [AXUIElement] else {
        return nil
    }
    return windows.first
}

func visibleDisplay(for processId: pid_t) -> FrameInfo? {
    guard let window = firstWindow(for: processId) else {
        return nil
    }
    let center = CGPoint(x: window.x + window.width / 2, y: window.y + window.height / 2)

    for screen in NSScreen.screens {
        guard
            let rawNumber = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        else {
            continue
        }
        let displayBounds = CGDisplayBounds(CGDirectDisplayID(rawNumber.uint32Value))
        guard displayBounds.contains(center) else {
            continue
        }

        let fullFrame = screen.frame
        let visibleFrame = screen.visibleFrame
        let leftInset = visibleFrame.minX - fullFrame.minX
        let topInset = fullFrame.maxY - visibleFrame.maxY
        return FrameInfo(
            x: displayBounds.minX + leftInset,
            y: displayBounds.minY + topInset,
            width: visibleFrame.width,
            height: visibleFrame.height
        )
    }
    return nil
}

func setFrame(for processId: pid_t, frame: CGRect) -> Bool {
    let fullScreenAttribute = "AXFullScreen" as CFString
    if let window = accessibilityWindow(for: processId) {
        var rawFullScreen: CFTypeRef?
        let fullScreenResult = AXUIElementCopyAttributeValue(
            window,
            fullScreenAttribute,
            &rawFullScreen
        )
        if
            fullScreenResult == .success,
            let isFullScreen = rawFullScreen as? Bool,
            isFullScreen
        {
            _ = AXUIElementSetAttributeValue(
                window,
                fullScreenAttribute,
                kCFBooleanFalse
            )
            usleep(500_000)
        }
    }

    for _ in 0..<10 {
        guard let window = accessibilityWindow(for: processId) else {
            usleep(100_000)
            continue
        }

        var position = frame.origin
        var size = frame.size
        guard
            let positionValue = AXValueCreate(.cgPoint, &position),
            let sizeValue = AXValueCreate(.cgSize, &size)
        else {
            return false
        }

        let positionResult = AXUIElementSetAttributeValue(
            window,
            kAXPositionAttribute as CFString,
            positionValue
        )
        let sizeResult = AXUIElementSetAttributeValue(
            window,
            kAXSizeAttribute as CFString,
            sizeValue
        )
        if positionResult == .success && sizeResult == .success {
            return true
        }
        usleep(100_000)
    }
    return false
}

func focus(processId: pid_t) -> Bool {
    guard
        let application = NSRunningApplication(processIdentifier: processId),
        let window = accessibilityWindow(for: processId)
    else {
        return false
    }
    let activated = application.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    let raised = AXUIElementPerformAction(window, kAXRaiseAction as CFString) == .success
    return activated && raised
}

func postKey(to processId: pid_t, keyCode: CGKeyCode) -> Bool {
    guard
        let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
        let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)
    else {
        return false
    }
    down.postToPid(processId)
    usleep(30_000)
    up.postToPid(processId)
    return true
}

func postClick(to processId: pid_t, at point: CGPoint) -> Bool {
    guard
        let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
    else {
        return false
    }
    down.postToPid(processId)
    usleep(30_000)
    up.postToPid(processId)
    return true
}

func postMove(to processId: pid_t, at point: CGPoint) -> Bool {
    guard let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else {
        return false
    }
    move.postToPid(processId)
    return true
}

func postScroll(to processId: pid_t, delta: Int32) -> Bool {
    guard let scroll = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .line,
        wheelCount: 1,
        wheel1: delta,
        wheel2: 0,
        wheel3: 0
    ) else {
        return false
    }
    scroll.postToPid(processId)
    return true
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first else {
    emit(ProbeResponse(ok: false, command: "missing", error: "Missing command"), exitCode: 2)
}

if command == "self-test" {
    emit(
        ProbeResponse(
            ok: true,
            command: command,
            commands: ["request-accessibility", "window", "display", "set-frame", "focus", "key", "click-center", "move-center", "scroll"]
        )
    )
}

if command == "request-accessibility" {
    guard requestAccessibilityPermission() else {
        emit(
            ProbeResponse(
                ok: false,
                command: command,
                error: "Accessibility access was requested. Allow MultaBlox Window Manager in System Settings, then try again."
            ),
            exitCode: 3
        )
    }
    emit(ProbeResponse(ok: true, command: command))
}

guard AXIsProcessTrusted() else {
    emit(
        ProbeResponse(
            ok: false,
            command: command,
            error: "Accessibility permission is not granted",
            window: nil
        ),
        exitCode: 3
    )
}

guard let processId = pid(from: arguments) else {
    emit(ProbeResponse(ok: false, command: command, error: "Missing or invalid --pid"), exitCode: 2)
}

switch command {
case "window":
    guard let window = firstWindow(for: processId) else {
        emit(ProbeResponse(ok: false, command: command, error: "No visible window found"), exitCode: 4)
    }
    emit(ProbeResponse(ok: true, command: command, window: window))
case "display":
    guard let display = visibleDisplay(for: processId) else {
        emit(ProbeResponse(ok: false, command: command, error: "No visible display found"), exitCode: 4)
    }
    emit(ProbeResponse(ok: true, command: command, display: display))
case "set-frame":
    guard
        let rawX = value(after: "--x", in: arguments),
        let rawY = value(after: "--y", in: arguments),
        let rawWidth = value(after: "--width", in: arguments),
        let rawHeight = value(after: "--height", in: arguments),
        let x = Double(rawX),
        let y = Double(rawY),
        let width = Double(rawWidth),
        let height = Double(rawHeight),
        width > 0,
        height > 0
    else {
        emit(ProbeResponse(ok: false, command: command, error: "Missing or invalid frame"), exitCode: 2)
    }
    let frame = CGRect(x: x, y: y, width: width, height: height)
    guard setFrame(for: processId, frame: frame) else {
        emit(ProbeResponse(ok: false, command: command, error: "Failed to set window frame"), exitCode: 5)
    }
    emit(ProbeResponse(ok: true, command: command))
case "focus":
    guard focus(processId: processId) else {
        emit(ProbeResponse(ok: false, command: command, error: "Failed to focus window"), exitCode: 5)
    }
    emit(ProbeResponse(ok: true, command: command))
case "key":
    guard let raw = value(after: "--keycode", in: arguments), let keyCode = UInt16(raw) else {
        emit(ProbeResponse(ok: false, command: command, error: "Missing or invalid --keycode"), exitCode: 2)
    }
    emit(ProbeResponse(ok: postKey(to: processId, keyCode: keyCode), command: command))
case "click-center":
    guard let window = firstWindow(for: processId) else {
        emit(ProbeResponse(ok: false, command: command, error: "No visible window found"), exitCode: 4)
    }
    let point = CGPoint(x: window.x + window.width / 2, y: window.y + window.height / 2)
    emit(ProbeResponse(ok: postClick(to: processId, at: point), command: command, window: window))
case "move-center":
    guard let window = firstWindow(for: processId) else {
        emit(ProbeResponse(ok: false, command: command, error: "No visible window found"), exitCode: 4)
    }
    let point = CGPoint(x: window.x + window.width / 2, y: window.y + window.height / 2)
    emit(ProbeResponse(ok: postMove(to: processId, at: point), command: command, window: window))
case "scroll":
    guard let raw = value(after: "--delta", in: arguments), let delta = Int32(raw) else {
        emit(ProbeResponse(ok: false, command: command, error: "Missing or invalid --delta"), exitCode: 2)
    }
    emit(ProbeResponse(ok: postScroll(to: processId, delta: delta), command: command))
default:
    emit(ProbeResponse(ok: false, command: command, error: "Unknown command"), exitCode: 2)
}
