import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { t } from '../shared/i18n';
import { TERMINAL_VIEW_TYPE } from '../terminal-agent';
import type DashboardPlugin from './main';

/** Shown in an existing terminal leaf while the agent module is off. */
export class InactiveTerminalView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: DashboardPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return TERMINAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('modules.terminalOffTitle');
	}

	getIcon(): string {
		return 'terminal';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: t('modules.terminalOff') });
		const button = this.contentEl.createEl('button', { text: t('modules.openHome') });
		button.addEventListener('click', () => this.plugin.openHome());
	}
}
