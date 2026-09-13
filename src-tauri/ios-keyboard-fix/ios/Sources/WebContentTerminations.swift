import Foundation
import UIKit
import WebKit

/// TEMPORARY diagnostics for the iOS reloads, like src/utils/diagnostics.ts.
///
/// When iOS ends the web content process, Tauri reloads the page and the page
/// can only tell that it started over, not why. WebKit does say why, but only
/// through a private navigation delegate method. This adds that method to the
/// delegate wry installed, keeps the reason across launches, and still hands
/// the event to wry's public handler so the page reloads exactly as before.
enum WebContentTerminations {
    private static let storageKey = "fg.webContentTerminations"
    private static let maxRecords = 40
    private static let privateSelector = NSSelectorFromString(
        "_webView:webContentProcessDidTerminateWithReason:")
    private static let publicSelector = NSSelectorFromString(
        "webViewWebContentProcessDidTerminate:")

    static func records() -> [[String: Any]] {
        return UserDefaults.standard.array(forKey: storageKey) as? [[String: Any]] ?? []
    }

    /// Adds the private method to the delegate's class. Returns false while
    /// the web view has no navigation delegate yet.
    @discardableResult
    static func installHook(on webView: WKWebView) -> Bool {
        guard let delegate = webView.navigationDelegate,
            let delegateClass = object_getClass(delegate)
        else {
            return false
        }

        if !class_respondsToSelector(delegateClass, privateSelector) {
            let handler: @convention(block) (NSObject, WKWebView, Int) -> Void = {
                owner, terminatedWebView, reason in
                WebContentTerminations.record(reason: reason)
                // With the private method present WebKit no longer calls the
                // public one, which is what reloads the page.
                let reload = WebContentTerminations.publicSelector
                if owner.responds(to: reload) {
                    _ = owner.perform(reload, with: terminatedWebView)
                } else {
                    terminatedWebView.reload()
                }
            }
            class_addMethod(
                delegateClass,
                privateSelector,
                imp_implementationWithBlock(unsafeBitCast(handler, to: AnyObject.self)),
                "v@:@q")
        }

        // WebKit notes which optional delegate methods exist when the delegate
        // is assigned, so the new one only counts after assigning it again.
        webView.navigationDelegate = delegate
        return true
    }

    /// Hands the stored records to the page, which asks for them when it
    /// builds a report.
    static func send(to webView: WKWebView) {
        let json: String
        if let data = try? JSONSerialization.data(withJSONObject: records()),
            let text = String(data: data, encoding: .utf8)
        {
            json = text
        } else {
            json = "[]"
        }
        webView.evaluateJavaScript(
            "window.__FG_NATIVE_TERMINATIONS__=\(json);window.dispatchEvent(new Event('fg:native-terminations'));",
            completionHandler: nil)
    }

    private static func record(reason: Int) {
        var list = records()
        list.insert(
            [
                "at": Date().timeIntervalSince1970 * 1000,
                "reason": label(for: reason),
                "code": reason,
                "appState": appStateLabel(),
            ],
            at: 0)
        UserDefaults.standard.set(Array(list.prefix(maxRecords)), forKey: storageKey)
    }

    // _WKProcessTerminationReason
    private static func label(for reason: Int) -> String {
        switch reason {
        case 0: return "exceeded memory limit"
        case 1: return "exceeded CPU limit"
        case 2: return "requested by client"
        case 3: return "crash"
        default: return "unknown"
        }
    }

    private static func appStateLabel() -> String {
        switch UIApplication.shared.applicationState {
        case .active: return "active"
        case .inactive: return "inactive"
        case .background: return "background"
        @unknown default: return "unknown"
        }
    }
}
