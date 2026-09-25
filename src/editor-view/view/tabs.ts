import { setIcon } from 'obsidian';
import type { EditorDomainId } from '../../shared/editor-workbench';
import { t } from '../../shared/i18n';
import type { EditorDomain } from '../host/registry';

export function renderDomainTabs(
	host: HTMLElement,
	domains: readonly EditorDomain[],
	active: EditorDomainId,
	onPick: (id: EditorDomainId) => void,
): void {
	host.empty();
	const bar = host.createDiv({ cls: 'apex-editor-tabs' });
	for (const domain of domains) {
		const btn = bar.createEl('button', {
			cls: 'apex-editor-tab' + (domain.id === active ? ' is-active' : ''),
			attr: { type: 'button' },
		});
		setIcon(btn.createSpan({ cls: 'apex-editor-tab-icon' }), domain.icon);
		btn.createSpan({ text: t(domain.titleKey) });
		btn.addEventListener('click', () => onPick(domain.id));
	}
}
