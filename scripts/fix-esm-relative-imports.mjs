import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const targetRoot = process.argv[2];

if (!targetRoot) {
	console.error("Usage: node scripts/fix-esm-relative-imports.mjs <dir>");
	process.exit(1);
}

const root = path.resolve(process.cwd(), targetRoot);
const fileExtensions = new Set([".js", ".mjs"]);
const alreadyHasRuntimeExtension = /\.(?:[cm]?js|json|node)$/;
const fromPattern = /\bfrom\s+(['"])([^'"`]+?)\1/g;
const dynamicImportPattern = /\bimport\s*\(\s*(['"])([^'"`]+?)\1(\s*\))/g;
const sharedRuntimeRoot = path.resolve(root, "../shared");

await walk(root);

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await walk(fullPath);
			continue;
		}

		if (!fileExtensions.has(path.extname(entry.name))) continue;

		const source = await readFile(fullPath, "utf8");
		const rewritten = source
			.replace(fromPattern, (match, quote, specifier) => {
				const replacement = rewriteSpecifier(specifier, fullPath);
				if (!replacement) return match;
				return `from ${quote}${replacement}${quote}`;
			})
			.replace(
				dynamicImportPattern,
				(match, quote, specifier, closing) => {
					const replacement = rewriteSpecifier(specifier, fullPath);
					if (!replacement) return match;
					return `import(${quote}${replacement}${quote}${closing}`;
				},
			);

		if (rewritten !== source) {
			await writeFile(fullPath, rewritten);
		}
	}
}

function rewriteSpecifier(specifier, filePath) {
	if (alreadyHasRuntimeExtension.test(specifier)) return undefined;

	if (specifier.startsWith("@shared/")) {
		const sharedTarget = path.resolve(
			sharedRuntimeRoot,
			`${specifier.slice("@shared/".length)}.js`,
		);
		return toPosix(path.relative(path.dirname(filePath), sharedTarget));
	}

	if (specifier.startsWith(".")) {
		if (specifier === ".") return "./index.js";
		if (specifier === "..") return "../index.js";
		return `${specifier}.js`;
	}

	return undefined;
}

function toPosix(value) {
	return value.split(path.sep).join("/");
}
