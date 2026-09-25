import type { DashboardSettingTab } from './settings-tab';
import { t } from '../../shared/i18n';
import { SUPPORT_IMAGE_DATA_URL } from '../../dashboard-view/assets/support-image';

/** About page for NAND WTA. A support image appears only after one is added. */
export function renderCoffeeSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	const wrap = containerEl.createDiv({ cls: 'dashboard-about' });

	wrap.createDiv({ cls: 'dashboard-about-intro-line1', text: t('about.intro1') });
	wrap.createDiv({ cls: 'dashboard-about-intro-line', text: t('about.intro2') });
	wrap.createDiv({ cls: 'dashboard-about-intro-line', text: t('about.intro3') });

	wrap.createDiv({ cls: 'dashboard-about-divider' });

	const projects: Array<[string, string]> = [
		[t('about.projNand'), t('about.projNandDesc')],
		[t('about.projWta'), t('about.projWtaDesc')],
	];
	this.renderAboutSection(wrap, t('about.building'), (section) => {
		for (const [name, desc] of projects) {
			const row = section.createDiv({ cls: 'dashboard-about-project' });
			row.createSpan({ cls: 'dashboard-about-project-name', text: name });
			row.createSpan({ cls: 'dashboard-about-project-sep', text: '｜' });
			row.createSpan({ cls: 'dashboard-about-project-desc', text: desc });
		}
	});

	this.renderAboutSection(wrap, t('about.contact'), (section) => {
		const ghRow = section.createDiv({ cls: 'dashboard-about-contact-row' });
		ghRow.createSpan({ cls: 'dashboard-about-contact-label', text: 'GitHub：' });
		ghRow.createEl('a', {
			cls: 'dashboard-about-link',
			text: t('about.githubUser'),
			attr: { href: 'https://github.com/NAMEWTA' },
		});
	});

	if (SUPPORT_IMAGE_DATA_URL.length > 0) {
		this.renderAboutSection(wrap, t('about.support'), (section) => {
			section.createDiv({ cls: 'dashboard-about-support-thanks', text: t('about.supportThanks') });
			const img = section.createEl('img', {
				cls: 'dashboard-about-support-img',
				attr: { src: SUPPORT_IMAGE_DATA_URL, alt: t('about.support') },
			});
			img.addEventListener('click', () => window.open(SUPPORT_IMAGE_DATA_URL, '_blank'));
		});
	}
}
