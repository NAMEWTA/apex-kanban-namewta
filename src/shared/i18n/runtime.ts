import { messages as m0 } from './common';
import { messages as m1 } from './settings';
import { messages as m2 } from './workspace-switcher';
import { messages as m3 } from './layout-mode';
import { messages as m4 } from './sidebar-strip-resize-handles-aria-labels';
import { messages as m5 } from './style-presets';
import { messages as m6 } from './appearance-studio-theme-studio';
import { messages as m7 } from './appearance-studio-advanced-global-reset';
import { messages as m8 } from './quick-notes-region';
import { messages as m10 } from './main';
import { messages as m11 } from './default-dashboard-content';
import { messages as m12 } from './banner';
import { messages as m13 } from './notice';
import { messages as m14 } from './quick-links';
import { messages as m15 } from './quick-actions';
import { messages as m16 } from './recent';
import { messages as m17 } from './card-edit';
import { messages as m18 } from './sync-defaults';
import { messages as m19 } from './chart';
import { messages as m20 } from './widget-type-selector';
import { messages as m21 } from './weather';
import { messages as m22 } from './habit-check-in';
import { messages as m23 } from './photo-album-widget';
import { messages as m24 } from './photo-album-settings-multi-album-list';
import { messages as m25 } from './widget-card-backgrounds';
import { messages as m26 } from './anniversary-memorial-day-widget';
import { messages as m27 } from './expense-tracker';
import { messages as m28 } from './mobile';
import { messages as m29 } from './reminder';
import { messages as m30 } from './template';
import { messages as m31 } from './pomodoro';
import { messages as m32 } from './music-player-widget-service-notices';
import { messages as m33 } from './music-player-widget-ui';
import { messages as m34 } from './reading';
import { messages as m35 } from './library';
import { messages as m36 } from './appearance-studio';
import { messages as m37 } from './section-37';
import { messages as m38 } from './section-38';
import { messages as m40 } from './anniversary-widget';
import { messages as m41 } from './section-41';
import { messages as m42 } from './section-42';
import { messages as m43 } from './editor';
import { messages as m44 } from './terminal-agent';
import { messages as m45 } from './nand';

export type Language = 'en' | 'zh';

let currentLang: Language = 'zh';

export function setLanguage(lang: Language): void {
	currentLang = lang;
}

export function getLanguage(): Language {
	return currentLang;
}

function mergeDicts(...parts: Array<Record<string, string>>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of parts) {
		for (const key of Object.keys(part)) {
			const value = part[key];
			if (value !== undefined) out[key] = value;
		}
	}
	return out;
}

const translations: Record<Language, Record<string, string>> = {
	en: mergeDicts(
		m0.en,
		m1.en,
		m2.en,
		m3.en,
		m4.en,
		m5.en,
		m6.en,
		m7.en,
		m8.en,
		m10.en,
		m11.en,
		m12.en,
		m13.en,
		m14.en,
		m15.en,
		m16.en,
		m17.en,
		m18.en,
		m19.en,
		m20.en,
		m21.en,
		m22.en,
		m23.en,
		m24.en,
		m25.en,
		m26.en,
		m27.en,
		m28.en,
		m29.en,
		m30.en,
		m31.en,
		m32.en,
		m33.en,
		m34.en,
		m35.en,
		m36.en,
		m37.en,
		m38.en,
		m40.en,
		m41.en,
		m42.en,
		m43.en,
		m44.en,
		m45.en,
	),
	zh: mergeDicts(
		m0.zh,
		m1.zh,
		m2.zh,
		m3.zh,
		m4.zh,
		m5.zh,
		m6.zh,
		m7.zh,
		m8.zh,
		m10.zh,
		m11.zh,
		m12.zh,
		m13.zh,
		m14.zh,
		m15.zh,
		m16.zh,
		m17.zh,
		m18.zh,
		m19.zh,
		m20.zh,
		m21.zh,
		m22.zh,
		m23.zh,
		m24.zh,
		m25.zh,
		m26.zh,
		m27.zh,
		m28.zh,
		m29.zh,
		m30.zh,
		m31.zh,
		m32.zh,
		m33.zh,
		m34.zh,
		m35.zh,
		m36.zh,
		m37.zh,
		m38.zh,
		m40.zh,
		m41.zh,
		m42.zh,
		m43.zh,
		m44.zh,
		m45.zh,
	),
};

export function t(key: string, params?: Record<string, string | number>): string {
	let str = translations[currentLang][key] ?? translations.en[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			str = str.replaceAll(`{${k}}`, String(v));
		}
	}
	return str;
}
