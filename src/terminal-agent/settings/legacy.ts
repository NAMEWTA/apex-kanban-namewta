import { normalizePath, type App } from 'obsidian';

/** One-time read of the previous terminal plugin data. Never writes it back. */
export async function readLegacyTerminalSettings(app: App): Promise<unknown> {
	const previousId = ['vault', 'agents'].join('-');
	const path = normalizePath(`${app.vault.configDir}/plugins/${previousId}/data.json`);
	try {
		if (!(await app.vault.adapter.exists(path))) return null;
		const parsed: unknown = JSON.parse(await app.vault.adapter.read(path));
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed;
	} catch {
		return null;
	}
}
