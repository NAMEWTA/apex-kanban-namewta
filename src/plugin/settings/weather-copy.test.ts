import assert from 'node:assert/strict';
import test from 'node:test';

import { setLanguage, t } from '../../shared/i18n/runtime.ts';

const KEYS = [
	'settings.widgetWeatherEnabled',
	'settings.widgetWeatherEnabledDesc',
	'settings.widgetWeatherCity',
	'settings.widgetWeatherCityDesc',
	'settings.widgetWeatherCityPlaceholder',
] as const;

test('weather setting copy is translated in both languages', () => {
	try {
		for (const lang of ['zh', 'en'] as const) {
			setLanguage(lang);
			for (const key of KEYS) {
				assert.notEqual(t(key), key, `${lang} ${key}`);
			}
		}
		setLanguage('zh');
		assert.equal(t('settings.widgetWeatherEnabled'), '天气');
		setLanguage('en');
		assert.equal(t('settings.widgetWeatherEnabled'), 'Weather');
	} finally {
		setLanguage('zh');
	}
});
