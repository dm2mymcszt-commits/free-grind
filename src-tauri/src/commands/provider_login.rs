//! Google, Apple and Facebook sign-in for Grindr accounts.
//!
//! Each provider is asked for a token the way Grindr's own apps ask for it,
//! with Grindr's own client ids, and the token is then exchanged for a Grindr
//! session at `/v8/sessions/thirdparty` (see `api/auth.rs`). No server of
//! ours or anyone else's sits in between.
//!
//! - Google and Facebook refuse embedded web views, so they run in a real
//!   browser: ASWebAuthenticationSession on iOS, and the default browser on
//!   Windows, which hands the result back through a URL scheme registered
//!   for the current user (see `windows_handoff`).
//! - Apple returns to Grindr's own web address, which only an embedded web
//!   view can intercept: a WKWebView sheet on iOS, a small window on Windows.

use std::collections::HashMap;
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::digest::{digest, SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use serde::Deserialize;
use url::Url;

use crate::api::auth::{LoginResult, ThirdPartyVendor};
use crate::error::AppError;
use crate::state::AppState;

// Grindr's iOS Google client. iOS clients have no secret and redirect to
// their reversed id, which is why the same client works from a browser.
const GOOGLE_CLIENT_ID: &str =
    "1036042917246-aiep8hjgls1skgem6k3plu6q8gbmbts6.apps.googleusercontent.com";
const GOOGLE_CALLBACK_SCHEME: &str =
    "com.googleusercontent.apps.1036042917246-aiep8hjgls1skgem6k3plu6q8gbmbts6";
const GOOGLE_AUTHORIZATION_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";

// Grindr's Facebook app, with the redirect its mobile SDK uses.
const FACEBOOK_APP_ID: &str = "1273378622718674";
const FACEBOOK_CALLBACK_SCHEME: &str = "fb1273378622718674";
const FACEBOOK_REDIRECT_URI: &str = "fb1273378622718674://authorize/";
const FACEBOOK_AUTHORIZATION_ENDPOINT: &str = "https://m.facebook.com/dialog/oauth";
const FACEBOOK_TOKEN_ENDPOINT: &str = "https://graph.facebook.com/oauth/access_token";

// The Sign in with Apple service Grindr Web uses. Asking for no scope lets
// Apple return the code in the redirect's query string, where the web view
// can read it; with a scope Apple insists on a form POST.
const APPLE_CLIENT_ID: &str = "com.grindrguy.grindrx.signin";
const APPLE_REDIRECT_URI: &str = "https://web.grindr.com/apple-login";
const APPLE_AUTHORIZATION_ENDPOINT: &str = "https://appleid.apple.com/auth/authorize";

/// How long a sign-in may wait on the user before giving up.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    Google,
    Apple,
    Facebook,
}

impl Provider {
    fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "google" => Ok(Self::Google),
            "apple" => Ok(Self::Apple),
            "facebook" => Ok(Self::Facebook),
            _ => Err(AppError::Auth(format!("Unknown sign-in provider: {value}"))),
        }
    }

    fn vendor(self) -> ThirdPartyVendor {
        match self {
            Self::Google => ThirdPartyVendor::Google,
            Self::Apple => ThirdPartyVendor::Apple,
            Self::Facebook => ThirdPartyVendor::Facebook,
        }
    }
}

/// Stops the sign-in the user walked away from. The frontend treats this
/// message as "cancelled" and shows nothing.
pub(crate) const CANCELLED_MESSAGE: &str = "Sign-in was cancelled";

fn cancelled() -> AppError {
    AppError::Auth(CANCELLED_MESSAGE.to_owned())
}

fn random_token() -> Result<String, AppError> {
    let mut bytes = [0_u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| AppError::Auth("The system random generator failed".to_owned()))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

struct Pkce {
    verifier: String,
    challenge: String,
}

fn pkce() -> Result<Pkce, AppError> {
    let verifier = random_token()?;
    let challenge = URL_SAFE_NO_PAD.encode(digest(&SHA256, verifier.as_bytes()));
    Ok(Pkce {
        verifier,
        challenge,
    })
}

fn google_redirect_uri() -> String {
    format!("{GOOGLE_CALLBACK_SCHEME}:/oauth2redirect")
}

fn google_authorization_url(state: &str, pkce: &Pkce) -> Result<Url, AppError> {
    Url::parse_with_params(
        GOOGLE_AUTHORIZATION_ENDPOINT,
        &[
            ("client_id", GOOGLE_CLIENT_ID),
            ("redirect_uri", google_redirect_uri().as_str()),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("state", state),
            ("code_challenge", pkce.challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("prompt", "select_account"),
        ],
    )
    .map_err(|error| AppError::Auth(format!("Invalid Google sign-in address: {error}")))
}

fn facebook_authorization_url(state: &str, pkce: &Pkce) -> Result<Url, AppError> {
    Url::parse_with_params(
        FACEBOOK_AUTHORIZATION_ENDPOINT,
        &[
            ("client_id", FACEBOOK_APP_ID),
            ("redirect_uri", FACEBOOK_REDIRECT_URI),
            ("response_type", "code"),
            ("scope", "public_profile,email"),
            ("state", state),
            ("code_challenge", pkce.challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("display", "touch"),
        ],
    )
    .map_err(|error| AppError::Auth(format!("Invalid Facebook sign-in address: {error}")))
}

fn apple_authorization_url(state: &str) -> Result<Url, AppError> {
    Url::parse_with_params(
        APPLE_AUTHORIZATION_ENDPOINT,
        &[
            ("client_id", APPLE_CLIENT_ID),
            ("redirect_uri", APPLE_REDIRECT_URI),
            ("response_type", "code"),
            ("response_mode", "query"),
            ("state", state),
        ],
    )
    .map_err(|error| AppError::Auth(format!("Invalid Apple sign-in address: {error}")))
}

/// Reads the provider's answer from the address it sent the user back to,
/// checking it answers this sign-in and not an older or forged one.
fn authorization_code(
    callback_url: &str,
    expected_state: &str,
    provider_name: &str,
) -> Result<String, AppError> {
    let url = Url::parse(callback_url)
        .map_err(|_| AppError::Auth(format!("{provider_name} sent back an unreadable answer")))?;
    let mut params: HashMap<String, String> = url.query_pairs().into_owned().collect();
    // Facebook and some Google errors come back in the fragment instead.
    if let Some(fragment) = url.fragment() {
        for (key, value) in url::form_urlencoded::parse(fragment.as_bytes()).into_owned() {
            params.entry(key).or_insert(value);
        }
    }

    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err(AppError::Auth(format!(
            "{provider_name} answered a different sign-in; try again"
        )));
    }
    if let Some(error) = params.get("error") {
        if error == "access_denied" || error == "user_cancelled_authorize" {
            return Err(cancelled());
        }
        let detail = params
            .get("error_description")
            .or_else(|| params.get("error_message"))
            .cloned()
            .unwrap_or_else(|| error.clone());
        return Err(AppError::Auth(format!("{provider_name} refused the sign-in: {detail}")));
    }
    params
        .remove("code")
        .filter(|code| !code.is_empty())
        .ok_or_else(|| AppError::Auth(format!("{provider_name} sent back no sign-in code")))
}

#[derive(Deserialize)]
struct AccessTokenResponse {
    access_token: String,
}

fn http_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(AppError::from)
}

async fn read_access_token(
    response: reqwest::Response,
    provider_name: &str,
) -> Result<String, AppError> {
    let status = response.status();
    if !status.is_success() {
        // Error bodies can carry provider internals; keep only the status.
        return Err(AppError::Auth(format!(
            "{provider_name} did not finish the sign-in (HTTP {})",
            status.as_u16()
        )));
    }
    let token: AccessTokenResponse = response.json().await?;
    Ok(token.access_token)
}

async fn exchange_google_code(code: &str, pkce: &Pkce) -> Result<String, AppError> {
    let redirect_uri = google_redirect_uri();
    let response = http_client()?
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&[
            ("client_id", GOOGLE_CLIENT_ID),
            ("code", code),
            ("code_verifier", pkce.verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await?;
    read_access_token(response, "Google").await
}

async fn exchange_facebook_code(code: &str, pkce: &Pkce) -> Result<String, AppError> {
    let response = http_client()?
        .get(FACEBOOK_TOKEN_ENDPOINT)
        .query(&[
            ("client_id", FACEBOOK_APP_ID),
            ("redirect_uri", FACEBOOK_REDIRECT_URI),
            ("code_verifier", pkce.verifier.as_str()),
            ("code", code),
        ])
        .send()
        .await?;
    read_access_token(response, "Facebook").await
}

/// Runs the provider's sign-in and returns the token Grindr expects.
async fn provider_token<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    provider: Provider,
) -> Result<String, AppError> {
    let state = random_token()?;
    match provider {
        Provider::Google => {
            let pkce = pkce()?;
            let url = google_authorization_url(&state, &pkce)?;
            let callback = platform::open_in_browser(app, url.as_str(), GOOGLE_CALLBACK_SCHEME).await?;
            let code = authorization_code(&callback, &state, "Google")?;
            exchange_google_code(&code, &pkce).await
        }
        Provider::Facebook => {
            let pkce = pkce()?;
            let url = facebook_authorization_url(&state, &pkce)?;
            let callback =
                platform::open_in_browser(app, url.as_str(), FACEBOOK_CALLBACK_SCHEME).await?;
            let code = authorization_code(&callback, &state, "Facebook")?;
            exchange_facebook_code(&code, &pkce).await
        }
        Provider::Apple => {
            let url = apple_authorization_url(&state)?;
            let callback = platform::open_in_web_view(app, url.as_str(), APPLE_REDIRECT_URI).await?;
            authorization_code(&callback, &state, "Apple")
        }
    }
}

#[tauri::command]
pub async fn login_with_provider(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    provider: String,
) -> Result<LoginResult, AppError> {
    let provider = Provider::parse(&provider)?;
    // Fail before opening anything if the client never started.
    let client = state.client()?;
    let token = provider_token(&app, provider).await?;
    platform::bring_app_to_front(&app);
    client.login_third_party(provider.vendor(), &token).await
}

#[tauri::command]
pub async fn cancel_provider_login(app: tauri::AppHandle) -> Result<(), AppError> {
    platform::cancel(&app).await;
    Ok(())
}

#[cfg(target_os = "ios")]
mod platform {
    use tauri::{AppHandle, Runtime};
    use tauri_plugin_ios_google_oauth::{AuthorizationError, IosGoogleOAuthExt};

    use super::cancelled;
    use crate::error::AppError;

    fn map_error(error: AuthorizationError) -> AppError {
        match error {
            AuthorizationError::Cancelled => cancelled(),
            AuthorizationError::InProgress => {
                AppError::Auth("Another sign-in is already open".to_owned())
            }
            AuthorizationError::TimedOut => AppError::Auth("The sign-in timed out".to_owned()),
            AuthorizationError::Failed => {
                AppError::Auth("The sign-in window could not be opened".to_owned())
            }
        }
    }

    pub async fn open_in_browser<R: Runtime>(
        app: &AppHandle<R>,
        url: &str,
        callback_scheme: &str,
    ) -> Result<String, AppError> {
        app.ios_google_oauth()
            .authorize(url, callback_scheme)
            .await
            .map_err(map_error)
    }

    pub async fn open_in_web_view<R: Runtime>(
        app: &AppHandle<R>,
        url: &str,
        callback_prefix: &str,
    ) -> Result<String, AppError> {
        app.ios_google_oauth()
            .authorize_in_web_view(url, callback_prefix)
            .await
            .map_err(map_error)
    }

    pub fn bring_app_to_front<R: Runtime>(_app: &AppHandle<R>) {}

    pub async fn cancel<R: Runtime>(app: &AppHandle<R>) {
        let _ = app.ios_google_oauth().cancel().await;
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::sync::{Arc, Mutex};

    use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};
    use tokio::sync::oneshot;

    use super::{cancelled, SIGN_IN_TIMEOUT};
    use crate::error::AppError;

    const SIGN_IN_WINDOW_LABEL: &str = "provider-sign-in";

    pub async fn open_in_browser<R: Runtime>(
        app: &AppHandle<R>,
        url: &str,
        callback_scheme: &str,
    ) -> Result<String, AppError> {
        super::windows_handoff::authorize(app, url, callback_scheme, SIGN_IN_TIMEOUT).await
    }

    pub async fn open_in_web_view<R: Runtime>(
        app: &AppHandle<R>,
        url: &str,
        callback_prefix: &str,
    ) -> Result<String, AppError> {
        if let Some(existing) = app.get_webview_window(SIGN_IN_WINDOW_LABEL) {
            let _ = existing.destroy();
        }

        let start_url = url
            .parse()
            .map_err(|_| AppError::Auth("Invalid sign-in address".to_owned()))?;
        let (sender, receiver) = oneshot::channel::<Option<String>>();
        let sender = Arc::new(Mutex::new(Some(sender)));

        let on_navigation_sender = Arc::clone(&sender);
        let prefix = callback_prefix.to_owned();
        let window = WebviewWindowBuilder::new(app, SIGN_IN_WINDOW_LABEL, WebviewUrl::External(start_url))
            .title("Sign in")
            .inner_size(480.0, 720.0)
            .center()
            .focused(true)
            .on_navigation(move |url| {
                if !url.as_str().starts_with(&prefix) {
                    return true;
                }
                if let Some(sender) = on_navigation_sender.lock().ok().and_then(|mut s| s.take()) {
                    let _ = sender.send(Some(url.to_string()));
                }
                // Grindr's page never loads; the code is all we need.
                false
            })
            .build()
            .map_err(|error| AppError::Auth(format!("The sign-in window could not open: {error}")))?;

        let on_close_sender = Arc::clone(&sender);
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }) {
                if let Some(sender) = on_close_sender.lock().ok().and_then(|mut s| s.take()) {
                    let _ = sender.send(None);
                }
            }
        });

        let outcome = tokio::time::timeout(SIGN_IN_TIMEOUT, receiver).await;
        let _ = window.destroy();
        match outcome {
            Ok(Ok(Some(callback))) => Ok(callback),
            Ok(_) => Err(cancelled()),
            Err(_) => Err(AppError::Auth("The sign-in timed out".to_owned())),
        }
    }

    pub fn bring_app_to_front<R: Runtime>(app: &AppHandle<R>) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }

    pub async fn cancel<R: Runtime>(app: &AppHandle<R>) {
        super::windows_handoff::cancel();
        if let Some(window) = app.get_webview_window(SIGN_IN_WINDOW_LABEL) {
            let _ = window.destroy();
        }
    }
}

#[cfg(not(any(target_os = "ios", target_os = "windows")))]
mod platform {
    use tauri::{AppHandle, Runtime};

    use crate::error::AppError;

    fn unsupported() -> AppError {
        AppError::Auth("This sign-in isn't available on this device yet".to_owned())
    }

    pub async fn open_in_browser<R: Runtime>(
        _app: &AppHandle<R>,
        _url: &str,
        _callback_scheme: &str,
    ) -> Result<String, AppError> {
        Err(unsupported())
    }

    pub async fn open_in_web_view<R: Runtime>(
        _app: &AppHandle<R>,
        _url: &str,
        _callback_prefix: &str,
    ) -> Result<String, AppError> {
        Err(unsupported())
    }

    pub fn bring_app_to_front<R: Runtime>(_app: &AppHandle<R>) {}

    pub async fn cancel<R: Runtime>(_app: &AppHandle<R>) {}
}

/// Windows: the browser finishes the sign-in by opening a custom URL. That
/// launches a second copy of the app with `--oauth-callback <url>`, which
/// writes the URL to a hand-off file and exits before anything else starts
/// (see `forward_callback_from_args`). The copy that asked waits for that
/// file.
#[cfg(target_os = "windows")]
pub mod windows_handoff {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, Instant};

    use tauri::{AppHandle, Runtime};
    use tauri_plugin_opener::OpenerExt;

    use super::cancelled;
    use crate::error::AppError;

    const CALLBACK_ARG: &str = "--oauth-callback";
    const ALLOWED_SCHEMES: [&str; 2] = [super::GOOGLE_CALLBACK_SCHEME, super::FACEBOOK_CALLBACK_SCHEME];
    const POLL_INTERVAL: Duration = Duration::from_millis(400);

    /// Bumped to stop the sign-in that is waiting.
    static GENERATION: AtomicU64 = AtomicU64::new(0);

    fn handoff_dir() -> PathBuf {
        std::env::temp_dir().join("grindflop-sign-in")
    }

    fn callback_file() -> PathBuf {
        handoff_dir().join("callback.url")
    }

    fn scheme_of(url: &str) -> Option<&str> {
        url.split_once(':').map(|(scheme, _)| scheme)
    }

    /// Called first thing at startup. Returns true when this process was
    /// only launched to deliver a sign-in result and must exit now.
    pub fn forward_callback_from_args() -> bool {
        let mut args = std::env::args().skip(1);
        let Some(url) = args
            .by_ref()
            .skip_while(|arg| arg != CALLBACK_ARG)
            .nth(1)
        else {
            return false;
        };
        let known = scheme_of(&url)
            .map(|scheme| ALLOWED_SCHEMES.iter().any(|allowed| allowed.eq_ignore_ascii_case(scheme)))
            .unwrap_or(false);
        if known && url.len() <= 16 * 1024 {
            let dir = handoff_dir();
            let _ = std::fs::create_dir_all(&dir);
            // Write then rename, so the waiting app never reads half a URL.
            let partial = dir.join("callback.url.partial");
            if std::fs::write(&partial, url.as_bytes()).is_ok() {
                let _ = std::fs::rename(&partial, callback_file());
            }
        }
        true
    }

    fn register_scheme(scheme: &str) -> Result<(), AppError> {
        use windows::core::HSTRING;
        use windows::Win32::System::Registry::{
            RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE,
            REG_OPTION_NON_VOLATILE, REG_SZ,
        };

        fn to_reg_sz(value: &str) -> Vec<u8> {
            value
                .encode_utf16()
                .chain(std::iter::once(0))
                .flat_map(|unit| unit.to_le_bytes())
                .collect()
        }

        fn set(path: &str, name: Option<&str>, value: &str) -> Result<(), AppError> {
            let mut key = HKEY::default();
            unsafe {
                let status = RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    &HSTRING::from(path),
                    None,
                    None,
                    REG_OPTION_NON_VOLATILE,
                    KEY_WRITE,
                    None,
                    &mut key,
                    None,
                );
                if status.is_err() {
                    return Err(AppError::Auth(format!(
                        "Windows refused to register the sign-in link ({})",
                        status.0
                    )));
                }
                let data = to_reg_sz(value);
                let status = match name {
                    Some(name) => RegSetValueExW(key, &HSTRING::from(name), None, REG_SZ, Some(&data)),
                    None => RegSetValueExW(key, None, None, REG_SZ, Some(&data)),
                };
                let _ = RegCloseKey(key);
                if status.is_err() {
                    return Err(AppError::Auth(format!(
                        "Windows refused to register the sign-in link ({})",
                        status.0
                    )));
                }
            }
            Ok(())
        }

        let exe = std::env::current_exe()
            .map_err(|error| AppError::Auth(format!("Could not find GrindFlop's location: {error}")))?;
        let root = format!("Software\\Classes\\{scheme}");
        set(&root, None, "URL:GrindFlop sign-in")?;
        set(&root, Some("URL Protocol"), "")?;
        set(
            &format!("{root}\\shell\\open\\command"),
            None,
            &format!("\"{}\" {CALLBACK_ARG} \"%1\"", exe.display()),
        )
    }

    pub async fn authorize<R: Runtime>(
        app: &AppHandle<R>,
        url: &str,
        callback_scheme: &str,
        timeout: Duration,
    ) -> Result<String, AppError> {
        // Re-registered every time so the link follows the exe if it moved.
        register_scheme(callback_scheme)?;
        let _ = std::fs::remove_file(callback_file());
        let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|error| AppError::Auth(format!("Could not open the browser: {error}")))?;

        let started = Instant::now();
        loop {
            if GENERATION.load(Ordering::SeqCst) != generation {
                return Err(cancelled());
            }
            if let Ok(callback) = std::fs::read_to_string(callback_file()) {
                let _ = std::fs::remove_file(callback_file());
                let callback = callback.trim().to_owned();
                if scheme_of(&callback)
                    .map(|scheme| scheme.eq_ignore_ascii_case(callback_scheme))
                    .unwrap_or(false)
                {
                    return Ok(callback);
                }
            }
            if started.elapsed() >= timeout {
                return Err(AppError::Auth("The sign-in timed out".to_owned()));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    pub fn cancel() {
        GENERATION.fetch_add(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_url_carries_the_ios_client_and_its_redirect() {
        let pkce = Pkce {
            verifier: "v".to_owned(),
            challenge: "c".to_owned(),
        };
        let url = google_authorization_url("s", &pkce).unwrap();
        let params: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(params["client_id"], GOOGLE_CLIENT_ID);
        assert_eq!(
            params["redirect_uri"],
            "com.googleusercontent.apps.1036042917246-aiep8hjgls1skgem6k3plu6q8gbmbts6:/oauth2redirect"
        );
        assert_eq!(params["code_challenge_method"], "S256");
    }

    #[test]
    fn apple_url_asks_for_the_code_in_the_query() {
        let url = apple_authorization_url("s").unwrap();
        let params: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(params["response_mode"], "query");
        assert!(!params.contains_key("scope"));
    }

    #[test]
    fn pkce_challenge_is_the_sha256_of_the_verifier() {
        let pkce = pkce().unwrap();
        assert_eq!(
            pkce.challenge,
            URL_SAFE_NO_PAD.encode(digest(&SHA256, pkce.verifier.as_bytes()))
        );
        assert_eq!(pkce.verifier.len(), 43);
    }

    #[test]
    fn reads_the_code_from_each_provider_callback() {
        let google = "com.googleusercontent.apps.1036042917246-aiep8hjgls1skgem6k3plu6q8gbmbts6:/oauth2redirect?state=abc&code=4%2F0Ab&scope=email";
        assert_eq!(authorization_code(google, "abc", "Google").unwrap(), "4/0Ab");

        let facebook = "fb1273378622718674://authorize/?code=AQB&state=abc#_=_";
        assert_eq!(authorization_code(facebook, "abc", "Facebook").unwrap(), "AQB");

        let apple = "https://web.grindr.com/apple-login?state=abc&code=c1a2";
        assert_eq!(authorization_code(apple, "abc", "Apple").unwrap(), "c1a2");
    }

    #[test]
    fn rejects_an_answer_to_another_sign_in() {
        let callback = "https://web.grindr.com/apple-login?state=other&code=c1a2";
        assert!(authorization_code(callback, "abc", "Apple").is_err());
    }

    #[test]
    fn a_denied_sign_in_counts_as_cancelled() {
        let callback = "fb1273378622718674://authorize/?error=access_denied&state=abc#_=_";
        let error = authorization_code(callback, "abc", "Facebook").unwrap_err();
        assert!(matches!(error, AppError::Auth(message) if message == CANCELLED_MESSAGE));
    }

    #[test]
    fn provider_errors_are_reported() {
        let callback = "https://web.grindr.com/apple-login?state=abc&error=invalid_request";
        let error = authorization_code(callback, "abc", "Apple").unwrap_err();
        assert!(matches!(error, AppError::Auth(message) if message.contains("invalid_request")));
    }
}
