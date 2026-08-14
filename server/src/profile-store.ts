import fs from "node:fs";
import path from "node:path";

export interface Profile {
    name: string;
    id: string;
    auth: string;
}

interface StoredProfiles {
    version: 1;
    profiles: Profile[];
}

export function loadProfiles(): Map<string, Profile> {
    const profilesPath = getProfilesPath();
    if (!profilesPath || !fs.existsSync(profilesPath)) return new Map();

    const stored = JSON.parse(fs.readFileSync(profilesPath, "utf8")) as Partial<StoredProfiles>;
    if (stored.version !== 1 || !Array.isArray(stored.profiles)) {
        throw new Error(`Invalid profiles file: ${profilesPath}`);
    }

    const profiles = new Map<string, Profile>();
    for (const profile of stored.profiles) {
        if (!isProfile(profile) || profiles.has(profile.id)) {
            throw new Error(`Invalid profile entry in: ${profilesPath}`);
        }
        profiles.set(profile.id, profile);
    }

    return profiles;
}

export function saveProfiles(profiles: Map<string, Profile>): void {
    const profilesPath = getProfilesPath();
    if (!profilesPath) return;

    const directory = path.dirname(profilesPath);
    const temporaryPath = `${profilesPath}.${process.pid}.tmp`;
    const stored: StoredProfiles = {
        version: 1,
        profiles: [...profiles.values()],
    };

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, `${JSON.stringify(stored)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    fs.renameSync(temporaryPath, profilesPath);
}

function getProfilesPath(): string | undefined {
    const configuredPath = process.env.BUGHOUSE_PROFILES_FILE?.trim();
    if (configuredPath) return path.resolve(configuredPath);

    const statsPath = process.env.BUGHOUSE_STATS_EVENTS_FILE?.trim();
    if (!statsPath) return undefined;

    return path.join(path.dirname(path.resolve(statsPath)), "profiles.json");
}

function isProfile(value: unknown): value is Profile {
    if (!value || typeof value !== "object") return false;

    const profile = value as Partial<Profile>;
    return (
        typeof profile.id === "string" &&
        profile.id.length > 0 &&
        typeof profile.auth === "string" &&
        profile.auth.length > 0 &&
        typeof profile.name === "string"
    );
}
