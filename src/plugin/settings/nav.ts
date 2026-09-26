/** Settings chrome shared by the declarative tab and the pre-1.13 fallback.
 *  Open products sit on one top row. Section ids are the order stacked on that tab. */

export type SettingsProduct = 'home' | 'dashboard' | 'editor' | 'terminal' | 'sync';

export type SettingsPage =
	| 'home'
	| 'general'
	| 'widgets'
	| 'coffee'
	| 'comments'
	| 'copy'
	| 'sync'
	| 'shell'
	| 'instance'
	| 'workflows'
	| 'appearance'
	| 'behavior'
	| 'connection'
	| 'visibility'
	| 'agents';

export const secondaryAxis = 'vertical' as const;

export function productOrder(): SettingsProduct[] {
	return ['home', 'dashboard', 'editor', 'terminal', 'sync'];
}

export interface ModuleGates {
	dashboard: boolean;
	editor: boolean;
	terminal: boolean;
}

/** Top tabs. Home and sync stay. Board, editor, and agents appear only while open. */
export function visibleProducts(modules: ModuleGates): SettingsProduct[] {
	return productOrder().filter((product) => {
		if (product === 'home' || product === 'sync') return true;
		return modules[product];
	});
}

/** Section order stacked on a product tab. Home and sync have no extra sections. */
export function sidePages(product: SettingsProduct): SettingsPage[] {
	if (product === 'dashboard') return ['general', 'widgets', 'coffee'];
	if (product === 'editor') return ['comments', 'copy'];
	if (product === 'terminal') {
		return ['shell', 'instance', 'workflows', 'appearance', 'behavior', 'connection', 'visibility', 'agents'];
	}
	return [];
}

export function defaultPage(product: SettingsProduct): SettingsPage {
	if (product === 'editor') return 'comments';
	if (product === 'terminal') return 'shell';
	if (product === 'sync') return 'sync';
	if (product === 'home') return 'home';
	return 'general';
}
