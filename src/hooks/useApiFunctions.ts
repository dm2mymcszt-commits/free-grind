import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "./useApi";
import { createApiFunctions } from "../services/apiFunctions";

export function useApiFunctions() {
	// Grab our new sendWebsocket tool from the base API hook
	const { fetchRest, sendWebsocket } = useApi();
	const { t } = useTranslation();
	
	// Pass both tools down the chain!
	return useMemo(() => createApiFunctions(fetchRest, sendWebsocket, t), [fetchRest, sendWebsocket, t]);
}