import { DashboardView } from './dashboard-view';
import { Platform, setIcon } from 'obsidian';
import type { BannerData } from '../types';
import { resolveVaultImage } from '../banner/banner';
import { t } from '../../shared/i18n';

export function setupBannerBehavior(this: DashboardView, bannerEl: HTMLElement): void {
	const pinBtn = bannerEl.createEl('button', {
		cls: 'dashboard-banner-pin-btn',
		attr: { 'aria-label': 'Toggle banner' },
	});
	setIcon(pinBtn, 'bookmark');

	pinBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (window.innerWidth <= 640) return;
		this.bannerCollapsed = !this.bannerCollapsed;
		bannerEl.toggleClass('dashboard-banner--collapsed', this.bannerCollapsed);
		this.app.saveLocalStorage('apex-dashboard-banner-collapsed', String(this.bannerCollapsed));
	});

	const onResize = () => {
		if (window.innerWidth <= 640 && this.bannerCollapsed) {
			bannerEl.removeClass('dashboard-banner--collapsed');
		} else if (this.bannerCollapsed) {
			bannerEl.addClass('dashboard-banner--collapsed');
		}
	};
	window.addEventListener('resize', onResize);
	this.cleanupFns.push(() => window.removeEventListener('resize', onResize));
}

export function setupBannerRotation(this: DashboardView, container: HTMLElement, banner: BannerData): void {
	// Quote rotation — stats mode has no quote text to rotate.
	if (banner.mode !== 'stats') {
		const quotes = banner.quotes;
		if (quotes && quotes.length > 1) {
			// Offset by 1 hour so quote and image swaps don't overlap
			const quoteIndex =
				Math.floor(
					(Date.now() + DashboardView.BANNER_QUOTE_OFFSET_MS) / DashboardView.BANNER_QUOTE_ROTATION_MS,
				) % quotes.length;
			this.bannerQuoteIndex = quoteIndex;

			const quoteEl = container.querySelector('.dashboard-banner-quote') as HTMLElement;
			const authorEl = container.querySelector('.dashboard-banner-author') as HTMLElement;
			if (quoteEl && authorEl) {
				const initial = quotes[quoteIndex]!;
				quoteEl.textContent = initial.quote;
				authorEl.textContent = initial.author;

				const rotateQuote = () => {
					this.bannerQuoteIndex = (this.bannerQuoteIndex + 1) % quotes.length;
					const next = quotes[this.bannerQuoteIndex]!;

					quoteEl.addClass('dashboard-banner-quote--fading');
					authorEl.addClass('dashboard-banner-author--fading');

					window.setTimeout(() => {
						quoteEl.textContent = next.quote;
						authorEl.textContent = next.author;
						quoteEl.removeClass('dashboard-banner-quote--fading');
						authorEl.removeClass('dashboard-banner-author--fading');
					}, 400);
				};

				const quoteTimer = window.setInterval(rotateQuote, DashboardView.BANNER_QUOTE_ROTATION_MS);
				this.cleanupFns.push(() => window.clearInterval(quoteTimer));
			}
		}
	}

	// Image rotation — applies to both quote and stats modes (stats uses the
	// same .dashboard-banner background, so it rotates identically).
	const images = banner.images;
	if (images && images.length > 1) {
		const imgIndex = Math.floor(Date.now() / DashboardView.BANNER_IMAGE_ROTATION_MS) % images.length;
		this.bannerImageIndex = imgIndex;

		const bannerEl = container.querySelector('.dashboard-banner') as HTMLElement;
		if (bannerEl) {
			const resolved = resolveVaultImage(this.app, images[imgIndex]!);
			if (resolved) {
				bannerEl.style.backgroundImage = `url("${resolved}")`;
			}

			const rotateImage = () => {
				this.bannerImageIndex = (this.bannerImageIndex + 1) % images.length;
				const nextPath = images[this.bannerImageIndex]!;
				const nextResolved = resolveVaultImage(this.app, nextPath);

				bannerEl.addClass('dashboard-banner--fading');

				window.setTimeout(() => {
					if (nextResolved) {
						bannerEl.style.backgroundImage = `url("${nextResolved}")`;
					}
					bannerEl.removeClass('dashboard-banner--fading');
				}, 600);
			};

			const imgTimer = window.setInterval(rotateImage, DashboardView.BANNER_IMAGE_ROTATION_MS);
			this.cleanupFns.push(() => window.clearInterval(imgTimer));
		}
	}
}

/** Desktop-only sidebar pin, anchored at the banner's bottom-left corner.
 *  Distinct from the banner-collapse bookmark button (top-right,
 *  .dashboard-banner-pin-btn): this one pins/unpins the sidebar. Works in
 *  both layouts — in stacked mode it pins the widget strip open instead of
 *  the left rail. */
export function renderBannerPinButton(this: DashboardView, bannerEl: HTMLElement): void {
	if (Platform.isMobile) return;
	const pinBtn = bannerEl.createEl('button', {
		cls: 'dashboard-sidebar-pin-btn',
		attr: { 'aria-label': 'Toggle sidebar pin' },
	});
	const update = () => {
		setIcon(pinBtn, this.sidebarPinned ? 'pin' : 'pin-off');
		pinBtn.toggleClass('dashboard-sidebar-pin-btn--active', this.sidebarPinned);
	};
	update();
	pinBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		this.sidebarPinned = !this.sidebarPinned;
		this.app.saveLocalStorage('apex-dashboard-sidebar-pinned', String(this.sidebarPinned));
		const sidebar = this.containerEl.querySelector('.dashboard-sidebar');
		if (sidebar) {
			if (this.sidebarPinned) {
				sidebar.addClass('dashboard-sidebar--pinned');
				sidebar.removeClass('dashboard-sidebar--expanded');
				sidebar.removeClass('dashboard-sidebar--collapsed');
				this.sidebarExpanded = false;
			} else {
				sidebar.removeClass('dashboard-sidebar--pinned');
				sidebar.addClass('dashboard-sidebar--collapsed');
				this.sidebarExpanded = false;
			}
		}
		update();
	});
}
