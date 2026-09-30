import { createContext } from "react";
import type { SignInProvider } from "../types/auth";

export interface AuthState {
	userId: number | null;
	isLoading: boolean;
	error: string | null;
	/**
	 * True once the per-profile db (chatDb) is pointed at the active user's
	 * own file and the one-time legacy-settings migration has been checked.
	 * Anything reading profile-scoped settings (preferences, automation,
	 * saved phrases/locations) must wait for this before loading — otherwise
	 * it risks reading the previous profile's connection during the switch.
	 */
	settingsReady: boolean;
}

export interface SavedAccountMeta {
	profileId: string;
	email: string;
	lastUsedAt: number;
}

export interface AuthContextType extends AuthState {
	login: (email: string, password: string) => Promise<void>;
	loginWithJwt: (token: string) => Promise<void>;
	/** Resolves false when the user cancelled, so callers can stay put quietly. */
	loginWithProvider: (provider: SignInProvider) => Promise<boolean>;
	cancelProviderLogin: () => Promise<void>;
	logout: () => Promise<void>;
	checkAuth: () => Promise<void>;
	savedAccounts: SavedAccountMeta[];
	switchAccount: (profileId: string) => Promise<void>;
	removeSavedAccount: (profileId: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);