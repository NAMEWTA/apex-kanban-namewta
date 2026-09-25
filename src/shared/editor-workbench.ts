/** Layout-only editor settings stored on data.json. Comment bodies never live here. */
export type EditorDomainId = 'comments' | 'writing-stats' | 'focus';

export interface EditorWorkbenchSettings {
	activeDomain: EditorDomainId;
	sidebarWidth?: number;
	/** Source / live-preview / reading highlights. The host stays loaded either way. */
	highlightEnabled: boolean;
	/** Selection popover. The add-comment command still works when this is off. */
	popoverEnabled: boolean;
}

export const DEFAULT_EDITOR_WORKBENCH: EditorWorkbenchSettings = {
	activeDomain: 'comments',
	highlightEnabled: true,
	popoverEnabled: true,
};

export function normalizeEditorWorkbench(raw: unknown): EditorWorkbenchSettings {
	const base: EditorWorkbenchSettings = { ...DEFAULT_EDITOR_WORKBENCH };
	if (typeof raw !== 'object' || raw === null) return base;
	const rec = raw as Record<string, unknown>;
	const domain = rec['activeDomain'];
	if (domain === 'comments' || domain === 'writing-stats' || domain === 'focus') {
		base.activeDomain = domain;
	}
	if (typeof rec['sidebarWidth'] === 'number' && Number.isFinite(rec['sidebarWidth'])) {
		base.sidebarWidth = rec['sidebarWidth'];
	}
	if (typeof rec['highlightEnabled'] === 'boolean') base.highlightEnabled = rec['highlightEnabled'];
	if (typeof rec['popoverEnabled'] === 'boolean') base.popoverEnabled = rec['popoverEnabled'];
	return base;
}
