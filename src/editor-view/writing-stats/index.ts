import { t } from '../../shared/i18n';
import type { EditorDomain } from '../host/registry';

/** Placeholder domain. A later iteration owns this folder; do not grow it here. */
export const writingStatsDomain: EditorDomain = {
	id: 'writing-stats',
	titleKey: 'editor.writingStats.title',
	icon: 'bar-chart-3',
	mountPanel(el) {
		el.empty();
		el.createDiv({ cls: 'apex-editor-placeholder', text: t('editor.writingStats.placeholder') });
		return () => {
			el.empty();
		};
	},
};
