import { App, Platform, TFile, setIcon } from 'obsidian';
import type { LibraryConfig } from '../types';
import { t } from '../../shared/i18n';
import { attachNoteHover } from '../ui/hover-preview';
import { resolveCoverAsObjectUrl } from '../reading/book-service';
import { GALLERY_COVER_PLACEHOLDER_DATA_URL } from '../assets/gallery-cover-placeholder';
import { LibraryFileResult, formatDate, libHoverParent, libOpener, loadPreview, str } from './library-file-result';

export function openFile(app: App, file: TFile): void {
	if (!Platform.isMobile && libOpener.current) {
		libOpener.current(file);
	} else {
		void app.workspace.getLeaf(false).openFile(file);
	}
}
export function attachItemHover(app: App, el: HTMLElement, file: TFile): void {
	if (!Platform.isMobile && libHoverParent.current) {
		attachNoteHover(app, el, file, libHoverParent.current);
	}
}
export async function trashLibraryFile(app: App, file: TFile): Promise<void> {
	await app.fileManager.trashFile(file);
}
export function renderGridView(
	container: HTMLElement,
	results: LibraryFileResult[],
	app: App,
	showTags: boolean,
	config: LibraryConfig,
): void {
	renderFileCards(container, results, app, showTags, config, { covers: false });
}
export function renderGalleryView(
	container: HTMLElement,
	results: LibraryFileResult[],
	app: App,
	showTags: boolean,
	config: LibraryConfig,
): void {
	renderFileCards(container, results, app, showTags, config, { covers: true });
}
interface FileCardRenderOptions {
	/** Gallery mode: render cover slots and drop the cover field from badges. */
	covers: boolean;
}
export function renderPlaceholderCover(coverEl: HTMLElement): void {
	coverEl.addClass('dashboard-library-card-cover--placeholder');
	if (GALLERY_COVER_PLACEHOLDER_DATA_URL) {
		coverEl.style.backgroundImage = `url(${GALLERY_COVER_PLACEHOLDER_DATA_URL})`;
	} else {
		setIcon(coverEl, 'image');
	}
}
function renderFileCards(
	container: HTMLElement,
	results: LibraryFileResult[],
	app: App,
	showTags: boolean,
	config: LibraryConfig,
	opts: FileCardRenderOptions,
): void {
	// Card size narrows/widens the auto-fill column track (covers follow via
	// aspect-ratio). 'medium' is the un-suffixed default, so legacy sections
	// keep the exact old layout.
	const sizeClass =
		config.cardSize && config.cardSize !== 'medium' ? ` dashboard-library-cards--${config.cardSize}` : '';
	const grid = container.createDiv({
		cls: (opts.covers ? 'dashboard-library-gallery' : 'dashboard-library-grid') + sizeClass,
	});

	for (const result of results) {
		const card = grid.createDiv({ cls: 'dashboard-library-card' });
		attachItemHover(app, card, result.file);
		card.addEventListener('click', () => openFile(app, result.file));

		// Cover slot (gallery only). Created up-front so the async fill has a
		// stable target; removed again when nothing resolves. The winning field
		// is dropped from the property badges below so a rendered cover never
		// also shows up as a "封面: x.png" text badge.
		let badgeFrontmatter = result.frontmatter;
		if (opts.covers) {
			const cover = extractCoverValue(result.frontmatter);
			if (cover) {
				badgeFrontmatter = omitFrontmatterKey(result.frontmatter, cover.key);
				const coverEl = card.createDiv({ cls: 'dashboard-library-card-cover' });
				void resolveLibraryCover(cover.value, result.file, app).then((url) => {
					if (!coverEl.isConnected) return;
					if (url) coverEl.style.backgroundImage = `url(${url})`;
					// Resolution failed (bad path, offline remote): the note
					// effectively has no cover — fall through to the placeholder.
					else renderPlaceholderCover(coverEl);
				});
			} else {
				// No cover info at all: a themed placeholder keeps gallery
				// cards a uniform height instead of a bare title card.
				renderPlaceholderCover(card.createDiv({ cls: 'dashboard-library-card-cover' }));
			}
		}

		card.createDiv({ cls: 'dashboard-library-card-title', text: result.basename });

		// Tags (folder section) or path + creation time on the meta row
		const metaRow = card.createDiv({ cls: 'dashboard-library-card-meta' });
		if (showTags) {
			if (result.tags.length > 0) {
				const tagsRow = metaRow.createDiv({ cls: 'dashboard-library-card-tags' });
				const maxTags = 2;
				for (const tag of result.tags.slice(0, maxTags)) {
					tagsRow.createDiv({ cls: 'dashboard-library-card-tag', text: tag });
				}
				if (result.tags.length > maxTags) {
					tagsRow.createDiv({
						cls: 'dashboard-library-card-tag dashboard-library-card-tag--more',
						text: `+${result.tags.length - maxTags}`,
					});
				}
			}
		} else {
			const parts = result.file.path.split('/');
			if (parts.length > 1) {
				metaRow.createDiv({ cls: 'dashboard-library-card-path', text: parts.slice(0, -1).join('/') + '/' });
			}
		}
		metaRow.createDiv({ cls: 'dashboard-library-card-date', text: formatDate(result.ctime) });

		// Async body preview
		const previewEl = card.createDiv({
			cls: 'dashboard-library-card-preview dashboard-library-card-preview--loading',
		});
		loadPreview(app, result.file)
			.then((text) => {
				if (!previewEl.isConnected) return;
				previewEl.removeClass('dashboard-library-card-preview--loading');
				if (text) {
					previewEl.textContent = text;
				} else {
					previewEl.remove();
				}
			})
			.catch(() => {
				if (previewEl.isConnected) previewEl.remove();
			});

		// Frontmatter property badges — same shared settings the kanban cards
		// use (see renderPropertyBadges).
		renderPropertyBadges(card, badgeFrontmatter, config);
	}
}
export function omitFrontmatterKey(frontmatter: Record<string, unknown>, key: string): Record<string, unknown> {
	if (!(key in frontmatter)) return frontmatter;
	const next: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(frontmatter)) {
		if (k !== key) next[k] = v;
	}
	return next;
}
export function renderPropertyBadges(
	card: HTMLElement,
	frontmatter: Record<string, unknown>,
	config: LibraryConfig,
): void {
	if (config.showProperties === false) return;
	const propertyLimit = Math.max(0, config.propertyLimit ?? 6);
	if (propertyLimit <= 0 && (config.visibleProperties?.length ?? 0) === 0) return;
	const keys = selectBadgeKeys(frontmatter, config.visibleProperties, propertyLimit);
	if (keys.length === 0) return;
	const badges = card.createDiv({ cls: 'dashboard-library-badges' });
	for (const key of keys) {
		const val = formatBadgeValue(frontmatter[key]);
		if (val === null) continue;
		const badge = badges.createDiv({ cls: 'dashboard-library-badge' });
		badge.createDiv({ cls: 'dashboard-library-badge-key', text: key });
		badge.createDiv({ cls: 'dashboard-library-badge-val', text: val });
	}
	if (!badges.children.length) badges.remove();
}
export interface CoverCandidate {
	/** The frontmatter key the reference came from (to drop it from badges). */
	key: string;
	/** Normalized reference string ready for {@link resolveLibraryCover}. */
	value: string;
}
const IMAGE_REF_RE = /\.(png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#]|$)/i;
function isImageRef(value: string): boolean {
	return value.startsWith('data:image/') || IMAGE_REF_RE.test(value);
}
function normalizeCoverValue(value: unknown): string | null {
	if (value == null || value instanceof Date) return null;
	if (Array.isArray(value)) {
		for (const item of value) {
			const normalized = normalizeCoverValue(item);
			if (normalized && isImageRef(normalized)) return normalized;
		}
		return null;
	}
	if (typeof value === 'object') return null;
	let s = str(value).trim();
	if (!s) return null;
	s = s.replace(/^["']+|["']+$/g, '').trim();
	const wikilink = /^!?\[\[([^[\]]+)\]\]$/.exec(s);
	if (wikilink) {
		s = wikilink[1]!.split('|')[0]!.trim();
	} else {
		const mdImage = /^!\[[^\]]*\]\(([^()]+)\)$/.exec(s);
		if (mdImage) {
			s = mdImage[1]!.trim();
		} else {
			const imgTag = /^<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(s);
			if (imgTag) s = imgTag[1]!.trim();
		}
	}
	return s.length > 0 ? s : null;
}
export function extractCoverValue(frontmatter: Record<string, unknown>): CoverCandidate | null {
	for (const [key, value] of Object.entries(frontmatter)) {
		if (key !== '封面' && key.toLowerCase() !== 'cover') continue;
		const normalized = normalizeCoverValue(value);
		if (normalized) return { key, value: normalized };
	}
	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'tags' || key === 'position') continue;
		const normalized = normalizeCoverValue(value);
		if (normalized && isImageRef(normalized)) return { key, value: normalized };
	}
	return null;
}
export async function resolveLibraryCover(raw: string, file: TFile, app: App): Promise<string> {
	if (/^(https?:|data:|file:)/i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) {
		return resolveCoverAsObjectUrl(raw, app);
	}
	const dest = app.metadataCache.getFirstLinkpathDest(raw, file.path);
	if (dest) return resolveCoverAsObjectUrl(dest.path, app);
	return resolveCoverAsObjectUrl(raw, app);
}
export function selectBadgeKeys(
	frontmatter: Record<string, unknown>,
	visibleProperties: readonly string[] | undefined,
	autoLimit: number,
): string[] {
	const showable = (key: string, value: unknown): boolean =>
		key !== 'tags' && key !== 'position' && formatBadgeValue(value) !== null;

	const picks = visibleProperties ?? [];
	const hits = picks.filter((key) => key in frontmatter && showable(key, frontmatter[key]));
	if (hits.length > 0) return hits;

	const auto: string[] = [];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (auto.length >= autoLimit) break;
		if (showable(key, value)) auto.push(key);
	}
	return auto;
}
function formatBadgeValue(value: unknown): string | null {
	if (value == null) return null;
	if (value instanceof Date) {
		return value.toISOString().slice(0, 10);
	}
	if (Array.isArray(value)) {
		const items = value
			.map((v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)))
			.filter((v) => v.length > 0);
		return items.length > 0 ? items.join(', ') : null;
	}
	if (typeof value === 'object') {
		try {
			const s = JSON.stringify(value).replace(/"/g, '').trim();
			return s.length > 0 && s.length <= 60 ? s : null;
		} catch {
			return null;
		}
	}
	const s = str(value).trim();
	return s.length > 0 ? s : null;
}
export function renderListView(container: HTMLElement, results: LibraryFileResult[], app: App): void {
	const list = container.createDiv({ cls: 'dashboard-library-list' });

	for (const result of results) {
		const item = list.createDiv({ cls: 'dashboard-library-list-item' });
		attachItemHover(app, item, result.file);
		item.addEventListener('click', () => openFile(app, result.file));

		item.createDiv({ cls: 'dashboard-library-list-name', text: result.basename });
		item.createDiv({ cls: 'dashboard-library-list-spacer' });
		item.createDiv({ cls: 'dashboard-library-list-date', text: formatDate(result.ctime) });
	}
}
function startCellEdit(td: HTMLElement, file: TFile, prop: string, originalValue: unknown, app: App): void {
	if (td.querySelector('input, select')) return;

	const isArr = Array.isArray(originalValue);
	const displayValue =
		originalValue == null ? '' : isArr ? (originalValue as unknown[]).map(String).join(', ') : str(originalValue);

	td.empty();
	td.removeClass('dashboard-library-table-empty');

	const input = td.createEl('input', {
		cls: 'dashboard-library-table-edit-input',
		attr: { type: 'text', value: displayValue },
	});
	input.focus();
	input.select();

	const finish = (save: boolean) => {
		if (!input.isConnected) return;
		const raw = input.value.trim();
		input.remove();

		if (!save) {
			td.textContent = displayValue || '—';
			if (!displayValue) td.addClass('dashboard-library-table-empty');
			return;
		}

		// Parse value
		let newValue: unknown;
		if (raw === '') {
			newValue = null;
		} else if (isArr) {
			newValue = raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		} else {
			const num = Number(raw);
			newValue = !isNaN(num) && raw !== '' ? num : raw;
		}

		// Write via processFrontMatter
		void app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (newValue === null) {
				delete fm[prop];
			} else {
				fm[prop] = newValue;
			}
		});

		// Update display
		if (newValue === null) {
			td.textContent = '—';
			td.addClass('dashboard-library-table-empty');
		} else if (Array.isArray(newValue)) {
			td.textContent = newValue.join(', ');
		} else {
			td.textContent = str(newValue);
		}
	};

	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			finish(true);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			finish(false);
		}
	});
	input.addEventListener('blur', () => finish(true));
}
export function renderTableView(
	container: HTMLElement,
	results: LibraryFileResult[],
	app: App,
	config: LibraryConfig,
	onDelete: (file: TFile) => void,
): void {
	// Determine which property columns to show
	const propKeys = new Set<string>();
	for (const filter of config.filters) {
		if (
			filter.property !== 'tags' &&
			filter.property !== 'modified' &&
			filter.property !== 'created' &&
			filter.property !== 'path'
		) {
			propKeys.add(filter.property);
		}
	}
	// Also collect common properties from results
	for (const result of results.slice(0, 20)) {
		for (const key of Object.keys(result.frontmatter)) {
			if (key === 'position') continue;
			propKeys.add(key);
			if (propKeys.size >= 6) break;
		}
	}

	const columns = ['name', 'modified', ...propKeys];

	const table = container.createEl('table', { cls: 'dashboard-library-table' });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	for (const col of columns) {
		const th = headerRow.createEl('th', {
			text: col === 'name' ? t('library.sortName') : col === 'modified' ? t('library.sortModified') : col,
		});
		th.dataset.sortKey = col;
	}
	// Action column (delete button) — empty label, rightmost
	const actionTh = headerRow.createEl('th', { cls: 'dashboard-library-table-op-col' });
	actionTh.setAttribute('aria-label', t('library.delete'));

	const tbody = table.createEl('tbody');
	for (const result of results) {
		const tr = tbody.createEl('tr');

		for (const col of columns) {
			const td = tr.createEl('td');
			if (col === 'name') {
				td.textContent = result.basename;
				td.addClass('dashboard-library-table-name');
				attachItemHover(app, td, result.file);
				td.addEventListener('click', (e) => {
					e.stopPropagation();
					openFile(app, result.file);
				});
			} else if (col === 'modified') {
				td.textContent = formatDate(result.mtime);
			} else {
				const value = result.frontmatter[col];
				if (value == null) {
					td.addClass('dashboard-library-table-empty');
					td.textContent = '—';
				} else if (Array.isArray(value)) {
					td.textContent = value.map(String).join(', ');
				} else {
					td.textContent = str(value);
				}
				td.addClass('dashboard-library-table-editable');
				td.addEventListener('dblclick', (e) => {
					e.stopPropagation();
					startCellEdit(td, result.file, col, value, app);
				});
			}
		}

		// Delete action cell (rightmost)
		const opTd = tr.createEl('td', { cls: 'dashboard-library-table-op' });
		const delBtn = opTd.createEl('button', {
			cls: 'dashboard-library-table-delete',
			attr: { 'aria-label': t('library.delete') },
		});
		delBtn.title = t('library.delete');
		setIcon(delBtn, 'trash-2');
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			onDelete(result.file);
		});
	}
}
export function parentOf(filePath: string): string {
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
}
export function scanRootMatch(filePath: string, scanFolders: string[]): { root: string; rel: string } | null {
	const parent = parentOf(filePath);
	for (const root of scanFolders) {
		const r = root.trim().replace(/\\/g, '/').replace(/\/+$/, '');
		if (!r) continue;
		// Case-insensitive prefix match, same rule the scanner uses.
		const rel = parent.toLowerCase().startsWith(r.toLowerCase() + '/')
			? parent.slice(r.length + 1)
			: parent.toLowerCase() === r.toLowerCase()
				? ''
				: null;
		if (rel !== null) return { root: r, rel };
	}
	return null;
}
export function folderGroupKey(filePath: string, scanFolders: string[]): string | undefined {
	const m = scanRootMatch(filePath, scanFolders);
	if (m) {
		if (m.rel === '') {
			// Directly inside the scan folder: the folder itself is the group.
			return m.root.split('/').filter(Boolean).pop() ?? m.root;
		}
		return m.rel.split('/')[0] ?? '';
	}
	const parent = parentOf(filePath);
	if (parent === '') return undefined;
	return parent.split('/')[0] ?? undefined;
}
