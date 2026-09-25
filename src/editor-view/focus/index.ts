import { t } from '../../shared/i18n';
import type { EditorDomain } from '../host/registry';

/** Placeholder domain. A later iteration owns this folder; do not grow it here. */
export const focusDomain: EditorDomain = {
	id: 'focus',
	titleKey: 'editor.focus.title',
	icon: 'crosshair',
	mountPanel(el) {
		el.empty();
		el.createDiv({ cls: 'apex-editor-placeholder', text: t('editor.focus.placeholder') });
		return () => {
			el.empty();
		};
	},
};
