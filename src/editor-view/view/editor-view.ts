import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { EditorDomainId } from '../../shared/editor-workbench';
import { t } from '../../shared/i18n';
import type { EditorHost } from '../host/host';
import { detachPanel, watchActiveFile } from './lifecycle';
import { renderDomainTabs } from './tabs';
import type DashboardPlugin from '../../plugin/main';

export const EDITOR_VIEW_TYPE = 'apex-editor-view';

/** Right-hand editor panel. Closing it does not unload the editor host. */
export class EditorView extends ItemView {
	private unmount: (() => void) | null = null;
	private offFile: (() => void) | null = null;
	private offLayout: (() => void) | null = null;
	private tabsEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: DashboardPlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return EDITOR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('editor.viewTitle');
	}

	getIcon(): string {
		return 'pen-line';
	}

	async applyModuleGate(): Promise<void> {
		this.offFile?.();
		this.offFile = null;
		this.offLayout?.();
		this.offLayout = null;
		this.unmount = detachPanel(this.unmount);
		await this.onOpen();
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('apex-editor-view');
		if (!this.plugin.settings.modules.editor || !this.plugin.editorHost) {
			this.contentEl.createEl('p', { text: t('modules.editorOff') });
			const button = this.contentEl.createEl('button', { text: t('modules.openHome') });
			button.addEventListener('click', () => this.plugin.openHome());
			return;
		}
		this.tabsEl = this.contentEl.createDiv({ cls: 'apex-editor-tabs-host' });
		this.bodyEl = this.contentEl.createDiv({ cls: 'apex-editor-body' });
		this.offFile = watchActiveFile(this.plugin.editorHost, () => this.render());
		this.offLayout = this.plugin.editorHost.onLayoutChanged(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.offFile?.();
		this.offFile = null;
		this.offLayout?.();
		this.offLayout = null;
		this.unmount = detachPanel(this.unmount);
	}

	private render(): void {
		const tabs = this.tabsEl;
		const body = this.bodyEl;
		if (!tabs || !body) return;
		const host: EditorHost | undefined = this.plugin.editorHost;
		if (!host) return;
		const domainId = this.plugin.settings.editorWorkbench.activeDomain;
		const domains = host.domains();
		renderDomainTabs(tabs, domains, domainId, (id) => {
			void this.activate(id);
		});
		this.unmount = detachPanel(this.unmount);
		const domain = domains.find((item) => item.id === domainId) ?? domains[0];
		if (!domain?.mountPanel) {
			body.empty();
			return;
		}
		this.unmount = domain.mountPanel(body, {
			app: this.app,
			plugin: this.plugin,
			file: host.getActiveFile(),
		});
	}

	private async activate(id: EditorDomainId): Promise<void> {
		if (this.plugin.settings.editorWorkbench.activeDomain === id) return;
		this.plugin.settings = {
			...this.plugin.settings,
			editorWorkbench: { ...this.plugin.settings.editorWorkbench, activeDomain: id },
		};
		await this.plugin.saveSettings();
		this.render();
	}
}
