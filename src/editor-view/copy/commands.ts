import { Notice } from 'obsidian';
import type DashboardPlugin from '../../plugin/main';
import { t } from '../../shared/i18n';
import { collectReferences } from './collect';

export function registerCopyCommands(plugin: DashboardPlugin): void {
	plugin.addCommand({
		id: 'copy-relative-reference',
		name: t('editor.copy.relative'),
		callback: () => {
			writeReference(plugin, 'relative');
		},
	});
	plugin.addCommand({
		id: 'copy-absolute-reference',
		name: t('editor.copy.absolute'),
		callback: () => {
			writeReference(plugin, 'absolute');
		},
	});
}

function writeReference(plugin: DashboardPlugin, kind: 'relative' | 'absolute'): void {
	const text = collectReferences(plugin.app, kind);
	if (!text) {
		new Notice(t('editor.copy.missing'));
		return;
	}
	void navigator.clipboard.writeText(text).then(
		() => {
			new Notice(kind === 'relative' ? t('editor.copy.copiedRelative') : t('editor.copy.copiedAbsolute'));
		},
		() => {
			new Notice(t('editor.copy.failed'));
		},
	);
}
