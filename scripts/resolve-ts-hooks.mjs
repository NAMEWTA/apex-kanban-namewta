import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const EXT = /\.(?:[cm]?[jt]s|json|svg|md|node)$/;

export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'obsidian') {
		return nextResolve(pathToFileURL(resolvePath(process.cwd(), 'scripts/obsidian-stub.ts')).href, context);
	}
	if (
		(specifier.startsWith('./') || specifier.startsWith('../')) &&
		!EXT.test(specifier)
	) {
		try {
			return await nextResolve(`${specifier}.ts`, context);
		} catch {
			return nextResolve(`${specifier}/index.ts`, context);
		}
	}
	return nextResolve(specifier, context);
}
