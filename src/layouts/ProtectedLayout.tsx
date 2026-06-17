import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { BackgroundViewScanner } from "../components/BackgroundViewScanner";
import { useLocationEngine } from "../hooks/useLocationEngine";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";

export function ProtectedLayout() {
    const location = useLocation();
    const isDesktop = useDesktopBreakpoint();
    
    // THIS ACTIVATES THE LOCATION ENGINE GLOBALLY!
    useLocationEngine(); 

    const isChatConversationRoute =
        (/^\/chat\/[^/]+$/.test(location.pathname) && location.pathname !== "/chat/albums") ||
        (location.pathname === "/chat" && new URLSearchParams(location.search).has("targetProfileId"));
	const isProfileRoute = /^\/profile\/[^/]+$/.test(location.pathname);

    // Hide navbar on mobile/tablet for full-screen chat or profile pages.
    const shouldHideNavbar = (isChatConversationRoute || isProfileRoute) && !isDesktop;

    return (
        <div className="relative">
            {/* Silently caches incoming views every 60s to bypass paywalls later */}
            <BackgroundViewScanner />
			
            <div className="app-page-container">
                <Outlet />
            </div>
            {!shouldHideNavbar ? <NavBar /> : null}
        </div>
    );
}