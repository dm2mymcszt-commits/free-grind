mod api;
mod error;
mod state;
mod storage;

use std::sync::Arc;

use crate::state::AppState;
use api::client::GrindrClient;
use api::websocket::WsState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install the ring crypto provider for rustls (required for
    // tokio-tungstenite when using rustls TLS backend).
    let _ = rustls::crypto::ring::default_provider().install_default();

    let client = GrindrClient::new().ok();

    // Platform-specific setup for plugins
    #[cfg(not(mobile))]
    {
        let context = tauri::generate_context!();

        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
            .plugin(tauri_plugin_opener::init())
            .manage(AppState { client })
            .manage(Arc::new(WsState::new()))
            .setup(|app| {
                #[cfg(target_os = "windows")]
                {
                    use tauri::Manager;
                    use tauri::webview::Color;
                    use windows::Win32::Graphics::Dwm::{
                        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND
                    };
                    use windows::Win32::Foundation::HWND;
                    
                    // Set webview background to fully transparent so the rounded
                    // CSS corners don't show a white rectangle behind them.
                    if let Some(webview) = app.get_webview_window("main") {
                        let _ = webview.set_background_color(Some(Color(0, 0, 0, 0)));
                        
                        // Remove the 1px border that Windows 11 draws around transparent layered windows
                        if let Ok(hwnd) = webview.hwnd() {
                            let hwnd_val = HWND(hwnd.0 as _);
                            unsafe {
                                // Prevent Windows 11 DWM from drawing native rounded corners (which often draws a 1px border line)
                                let corner_preference = DWMWCP_DONOTROUND;
                                let _ = DwmSetWindowAttribute(
                                    hwnd_val,
                                    DWMWA_WINDOW_CORNER_PREFERENCE,
                                    &corner_preference as *const _ as *const _,
                                    std::mem::size_of::<i32>() as u32,
                                );

                                // Set border color to NONE to suppress the 1px border
                                let color = 0xFFFFFFFE_u32; // DWMWA_COLOR_NONE
                                let _ = DwmSetWindowAttribute(
                                    hwnd_val,
                                    DWMWA_BORDER_COLOR,
                                    &color as *const u32 as *const _,
                                    std::mem::size_of::<u32>() as u32,
                                );
                            }
                        }
                    }
                }

                #[cfg(target_os = "linux")]
                {
                    use tauri::Manager;
                    use webkit2gtk::{PermissionRequestExt, WebViewExt};
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.with_webview(|webview| {
                            webview
                                .inner()
                                .connect_permission_request(|_view, request| {
                                    request.allow();
                                    true
                                });
                        });
                    }
                }
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                api::auth::login,
                api::auth::login_with_jwt,
                api::auth::refresh_token,
                api::auth::logout,
                api::auth::auth_state,
                api::auth::websocket_token,
                api::auth::sync_push_token,
                api::rest::request,
                api::websocket::ws_connect,
                api::websocket::ws_send,
                api::websocket::ws_disconnect,
                api::websocket::ws_status,
            ])
            .run(context)
            .expect("error while running tauri application");
    }

    #[cfg(mobile)]
    {
        let context = tauri::generate_context!();

        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
            .plugin(tauri_plugin_opener::init())
            .manage(AppState { client })
            .manage(Arc::new(WsState::new()))
            .invoke_handler(tauri::generate_handler![
                api::auth::login,
                api::auth::login_with_jwt,
                api::auth::refresh_token,
                api::auth::logout,
                api::auth::auth_state,
                api::auth::websocket_token,
                api::auth::sync_push_token,
                api::rest::request,
                api::websocket::ws_connect,
                api::websocket::ws_send,
                api::websocket::ws_disconnect,
                api::websocket::ws_status,
            ])
            .run(context)
            .expect("error while running tauri application");
    }
}
