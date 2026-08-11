import { getBackendUrl } from "./session";

interface RoomExistsResponse {
    exists: boolean;
}

export async function roomExists(roomCode: string): Promise<boolean | undefined> {
    const normalizedCode = roomCode.trim().toUpperCase();

    try {
        const response = await fetch(
            `${getBackendUrl()}/api/rooms/${encodeURIComponent(normalizedCode)}`,
            {
                headers: {
                    Accept: "application/json",
                },
            },
        );

        if (!response.ok) return false;

        const data = (await response.json()) as RoomExistsResponse;
        return data.exists;
    } catch {
        return undefined;
    }
}
