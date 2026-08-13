import { getBackendUrl } from "./session";

export interface SiteStats {
    uniquePlayers?: number;
    completedGames?: number;
    updatedAt?: string;
}

export async function fetchSiteStats(): Promise<SiteStats | undefined> {
    try {
        const response = await fetch(`${getBackendUrl()}/api/stats`, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) return undefined;

        return (await response.json()) as SiteStats;
    } catch {
        return undefined;
    }
}
