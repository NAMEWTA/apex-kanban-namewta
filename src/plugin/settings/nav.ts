/** Settings chrome shared by the declarative tab and the pre-1.13 fallback.
 *  Primary products sit on the top row. Secondary pages are a vertical list. */

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

/** Pages that appear in the left menu. Home and sync have no second level. */
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
