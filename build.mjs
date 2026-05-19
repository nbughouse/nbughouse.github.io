import { spawn } from "child_process";
import * as esbuild from "esbuild";
import { cpSync, watch as fsWatch } from "node:fs";
import path from "node:path";

const isWatch = process.argv.includes("--watch");

// Copy all non-TS files from public/ to dist/public/
const copyPublicAssets = () => {
	cpSync("public", "dist/public", {
		recursive: true,
		filter: (src) => !src.endsWith(".ts"), // skip TS source files
	});
};

const commonOptions = {
	bundle: true,
	sourcemap: true,
	minify: !isWatch,
	logLevel: "error",
};

let serverProcess = null;
const restartServer = () => {
	if (serverProcess) serverProcess.kill();
	console.clear();
	serverProcess = spawn("node", ["--no-deprecation", "dist/server/index.js"], {
		stdio: "inherit",
	});
};

const serverRestartPlugin = {
	name: "server-restart",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) restartServer();
			else console.error("<< Server Rebuild Failed >>");
		});
	},
};

copyPublicAssets(); // initial copy

const contexts = await Promise.all([
	// Client code → dist/public/
	esbuild.context({
		...commonOptions,
		entryPoints: ["public/*.ts"],
		outdir: "dist/public",
		format: "esm",
		platform: "browser",
	}),
	// Server code → dist/server/
	esbuild.context({
		...commonOptions,
		entryPoints: ["server/*.ts"],
		outdir: "dist/server",
		format: "esm",
		platform: "node",
		external: ["express", "socket.io"],
		plugins: isWatch ? [serverRestartPlugin] : [],
	}),
	// Shared code → dist/shared/
	esbuild.context({
		...commonOptions,
		entryPoints: ["shared/*.ts"],
		outdir: "dist/shared",
		format: "esm",
		platform: "neutral",
	}),
]);

if (isWatch) {
	await Promise.all(contexts.map((ctx) => ctx.watch()));
	restartServer();

	// Watch public/ for asset changes and re-copy
	fsWatch("public", { recursive: true }, (_, filename) => {
		if (filename && !filename.endsWith(".ts")) {
			copyPublicAssets();
		}
	});

	process.on("SIGINT", () => {
		if (serverProcess) serverProcess.kill();
		process.exit(0);
	});
} else {
	await Promise.all(contexts.map((ctx) => ctx.rebuild()));
	await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
