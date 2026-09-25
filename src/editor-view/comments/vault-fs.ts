import { normalizePath, type App } from 'obsidian';
import type { CommentFs } from './store';

async function ensureParent(app: App, filePath: string): Promise<void> {
	const parts = filePath.split('/');
	parts.pop();
	let acc = '';
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		const dir = normalizePath(acc);
		if (!(await app.vault.adapter.exists(dir))) {
			await app.vault.adapter.mkdir(dir);
		}
	}
}

/** Vault-relative sidecar IO. Comments travel with the vault, not the plugin folder. */
export function vaultCommentFs(app: App): CommentFs {
	const adapter = app.vault.adapter;
	return {
		read: (path) => adapter.read(normalizePath(path)),
		write: async (path, data) => {
			const normalized = normalizePath(path);
			await ensureParent(app, normalized);
			await adapter.write(normalized, data);
		},
		remove: async (path) => {
			const normalized = normalizePath(path);
			if (await adapter.exists(normalized)) await adapter.remove(normalized);
		},
		exists: (path) => adapter.exists(normalizePath(path)),
	};
}
