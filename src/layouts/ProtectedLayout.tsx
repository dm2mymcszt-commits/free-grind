import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { useEffect, useState } from "react";
import { BackgroundViewScanner } from "../components/BackgroundViewScanner";
import { useLocationEngine } from "../hooks/useLocationEngine";

export function ProtectedLayout() {
    const location = useLocation();
    
    // THIS ACTIVATES THE LOCATION ENGINE GLOBALLY!
    useLocationEngine(); 

    const isChatConversationRoute =
        /^\/chat\/[^/]+$/.test(location.pathname) ||
        (location.pathname === "/chat" && new URLSearchParams(location.search).has("targetProfileId"));

    // Determine if we are on a large enough screen to show both the inbox and chat thread.
    // This matches the 1024px breakpoint used in ChatPage.tsx for the dual-pane layout.
    const [isChatDualPane, setIsChatDualPane] = useState(window.innerWidth >= 1024);

    useEffect(() => {
        const handleResize = () => {
            setIsChatDualPane(window.innerWidth >= 1024);
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Hide navbar on mobile and tablet conversation pages (where chat is full-screen).
    const shouldHideNavbar = isChatConversationRoute && !isChatDualPane;

    return (
        <div className="relative">
            {/* Silently caches incoming views every 60s to bypass paywalls later */}
            <BackgroundViewScanner />
			
            <Outlet />
            {!shouldHideNavbar ? <NavBar /> : null}
        </div>
    );
}