import { MarkdownView, TFile, type Plugin } from 'obsidian';

/** Last Markdown file the user was in. Focusing the editor panel must not clear it. */
export function trackActiveMarkdown(plugin: Plugin, onChange: (file: TFile | null) => void): TFile | null {
	let current: TFile | null = plugin.app.workspace.getActiveFile();
	if (current && current.extension !== 'md') current = null;

	const set = (file: TFile | null) => {
		const next = file && file.extension === 'md' ? file : null;
		if ((current?.path ?? null) === (next?.path ?? null)) {
			current = next;
			return;
		}
		current = next;
		onChange(current);
	};

	plugin.registerEvent(
		plugin.app.workspace.on('file-open', (file) => {
			if (!file) {
				current = null;
				onChange(null);
				return;
			}
			set(file);
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			const view = leaf?.view;
			if (view instanceof MarkdownView && view.file) set(view.file);
		}),
	);
	return current;
}
