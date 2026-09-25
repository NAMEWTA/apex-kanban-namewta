import type { TFile } from 'obsidian';
import type { EditorHost } from '../host/host';

/** The side panel follows the host's active file and never tears the host down. */
export function watchActiveFile(host: EditorHost, onFile: (file: TFile | null) => void): () => void {
	onFile(host.getActiveFile());
	return host.onActiveFile(onFile);
}

/** Drop the panel DOM only. Editor extensions stay registered on the plugin. */
export function detachPanel(unmount: (() => void) | null): null {
	unmount?.();
	return null;
}
