import type { Extension } from '@codemirror/state';
import type { App, MarkdownPostProcessor, TFile } from 'obsidian';
import type { EditorDomainId } from '../../shared/editor-workbench';
import type DashboardPlugin from '../../plugin/main';

export interface EditorDomainContext {
	app: App;
	plugin: DashboardPlugin;
	file: TFile | null;
}

/** A product inside the editor. P0 registers comments; the others are placeholders. */
export interface EditorDomain {
	id: EditorDomainId;
	titleKey: string;
	icon: string;
	mountPanel?(el: HTMLElement, ctx: EditorDomainContext): () => void;
	getEditorExtensions?(): Extension[];
	getReadingPostProcessor?(): MarkdownPostProcessor;
	onActiveFileChange?(file: TFile | null): void;
	onSettingsChanged?(): void;
	registerCommands?(plugin: DashboardPlugin): void;
}
