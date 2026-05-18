import { spawn } from "child_process";
import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const commonOptions = {
	bundle: true,
	sourcemap: true,
	minify: !isWatch,
	logLevel: "error",
};

let serverProcess = null;

const restartServer = () => {
	if (serverProcess) {
		serverProcess.kill();
	}
	console.clear();
	serverProcess = spawn(
		"node",
		["--no-deprecation", "dist/server/index.js"],
		{ stdio: "inherit" }
	);
};

const serverRestartPlugin = {
	name: "server-restart",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) {
				restartServer();
			} else {
				console.error("<< Server Rebuild Failed >>");
			}
		});
	},
};

const contexts = await Promise.all([
	// Client/public code
	esbuild.context({
		...commonOptions,
		entryPoints: ["public/*.ts"],
		outdir: "dist/public",
		format: "esm",
		platform: "browser",
	}),
	// Server code
	esbuild.context({
		...commonOptions,
		entryPoints: ["server/*.ts"],
		outdir: "dist/server",
		format: "esm",
		platform: "node",
		external: ["express", "socket.io"],
		plugins: isWatch ? [serverRestartPlugin] : [],
	}),
	// Shared code
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

	process.on("SIGINT", () => {
		if (serverProcess) serverProcess.kill();
		process.exit(0);
	});
} else {
	await Promise.all(contexts.map((ctx) => ctx.rebuild()));
	await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
