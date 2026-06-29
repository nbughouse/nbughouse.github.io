const ROOM_PATH_PREFIX = "games";

export function getBasePath(): string {
	const baseUrl = import.meta.env.BASE_URL || "/";
	const basePath = getPathnameFromBaseUrl(baseUrl);
	return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

export function getAppPathname(): string {
	const pathname = globalThis.location.pathname;
	const basePath = getBasePath();
	const baseWithoutTrailingSlash = basePath.replace(/\/$/, "");

	if (baseWithoutTrailingSlash && pathname === baseWithoutTrailingSlash)
		return "/";

	if (basePath !== "/" && pathname.startsWith(basePath)) {
		return `/${pathname.slice(basePath.length)}`;
	}

	return pathname;
}

export function getRoomPath(roomCode: string): string {
	return `${getBasePath()}${ROOM_PATH_PREFIX}/${roomCode}`;
}

export function getAssetPath(assetPath: string): string {
	const cleanAssetPath = assetPath.replace(/^\/+/, "");
	return `${getBasePath()}${cleanAssetPath}`;
}

function getPathnameFromBaseUrl(baseUrl: string): string {
	try {
		return new URL(baseUrl, globalThis.location.origin).pathname;
	} catch {
		return baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
	}
}
