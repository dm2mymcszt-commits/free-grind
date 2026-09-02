import AuthenticationServices
import Foundation
import SwiftRs
import Tauri
import UIKit
import WebKit

private struct AuthorizeArgs: Decodable {
    let authorizationUrl: String
    let callbackScheme: String
}

private final class IosGoogleOAuthPlugin: Plugin,
    ASWebAuthenticationPresentationContextProviding
{
    private weak var webView: WKWebView?
    private var session: ASWebAuthenticationSession?
    private var sessionId: UUID?
    private var pendingInvoke: Invoke?
    private var timeoutWorkItem: DispatchWorkItem?

    @objc override func load(webview: WKWebView) {
        self.webView = webview
    }

    @objc func authorize(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(AuthorizeArgs.self)

        guard let authorizationUrl = URL(string: args.authorizationUrl),
            authorizationUrl.scheme?.lowercased() == "https",
            authorizationUrl.host?.lowercased() == "accounts.google.com",
            authorizationUrl.port == nil,
            authorizationUrl.user == nil,
            authorizationUrl.password == nil,
            isValidCallbackScheme(args.callbackScheme)
        else {
            invoke.reject("The authorization request was invalid.", code: "oauth_invalid_request")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                invoke.reject("Google authorization could not start.", code: "oauth_failed")
                return
            }
            guard self.pendingInvoke == nil, self.session == nil else {
                invoke.reject(
                    "A Google authorization flow is already in progress.",
                    code: "oauth_in_progress")
                return
            }

            let sessionId = UUID()
            let session = ASWebAuthenticationSession(
                url: authorizationUrl,
                callbackURLScheme: args.callbackScheme
            ) { [weak self] callbackUrl, error in
                DispatchQueue.main.async {
                    self?.complete(callbackUrl: callbackUrl, error: error, sessionId: sessionId)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false

            self.session = session
            self.sessionId = sessionId
            self.pendingInvoke = invoke

            let timeout = DispatchWorkItem { [weak self] in
                self?.rejectPending(
                    code: "oauth_timeout", cancelSession: true, expectedSessionId: sessionId)
            }
            self.timeoutWorkItem = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: timeout)

            if !session.start() {
                self.rejectPending(
                    code: "oauth_failed", cancelSession: false, expectedSessionId: sessionId)
            }
        }
    }

    @objc func cancel(_ invoke: Invoke) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                invoke.resolve()
                return
            }

            let pending = self.takePending()
            pending.invoke?.reject("Google authorization was cancelled.", code: "oauth_cancelled")
            pending.session?.cancel()
            invoke.resolve()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = webView?.window {
            return window
        }

        let activeWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        if let activeWindow = activeWindow {
            return activeWindow
        }

        if let viewControllerWindow = manager.viewController?.view.window {
            return viewControllerWindow
        }

        return ASPresentationAnchor()
    }

    private func complete(callbackUrl: URL?, error: Error?, sessionId: UUID) {
        guard pendingInvoke != nil, self.sessionId == sessionId else { return }

        if let authenticationError = error as? ASWebAuthenticationSessionError,
            authenticationError.code == .canceledLogin
        {
            rejectPending(
                code: "oauth_cancelled", cancelSession: false, expectedSessionId: sessionId)
            return
        }
        guard error == nil, let callbackUrl = callbackUrl else {
            rejectPending(code: "oauth_failed", cancelSession: false, expectedSessionId: sessionId)
            return
        }

        let pending = takePending()
        pending.invoke?.resolve(["callbackUrl": callbackUrl.absoluteString])
    }

    private func rejectPending(
        code: String, cancelSession: Bool, expectedSessionId: UUID? = nil
    ) {
        if let expectedSessionId = expectedSessionId, sessionId != expectedSessionId {
            return
        }
        let pending = takePending()
        guard let invoke = pending.invoke else { return }

        let message: String
        switch code {
        case "oauth_cancelled":
            message = "Google authorization was cancelled."
        case "oauth_timeout":
            message = "Google authorization timed out."
        default:
            message = "Google authorization failed."
        }
        invoke.reject(message, code: code)
        if cancelSession {
            pending.session?.cancel()
        }
    }

    private func takePending() -> (invoke: Invoke?, session: ASWebAuthenticationSession?) {
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        let invoke = pendingInvoke
        let session = session
        pendingInvoke = nil
        self.session = nil
        sessionId = nil
        return (invoke, session)
    }

    private func isValidCallbackScheme(_ scheme: String) -> Bool {
        guard !scheme.isEmpty, scheme.count <= 512,
            let first = scheme.unicodeScalars.first,
            CharacterSet.letters.contains(first)
        else {
            return false
        }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "+.-"))
        return scheme.unicodeScalars.allSatisfy { allowed.contains($0) }
    }
}

@_cdecl("init_plugin_ios_google_oauth")
func initPlugin() -> Plugin {
    return IosGoogleOAuthPlugin()
}
