import type { DashboardSettingTab } from './settings-tab';
import { renderMusicAccountSettings } from '../../dashboard-view/music/music-account-settings';
import { Setting } from 'obsidian';
import type { WidgetHeightRatio } from '../../dashboard-view/types';
import { t } from '../../shared/i18n';
import { geocodeCity } from '../../dashboard-view/widgets/weather-service';
import { getMusicService } from '../../dashboard-view/music/music-service';

/** Widgets tab, part 2: pomodoro, reading, habit, expense, countdown.
 *  Countdown renders after the expense card (the tab order is weather →
 *  calendar → these five, with countdown last). */
export function renderWidgetSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	// --- Pomodoro card ---
	const pomodoroCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(pomodoroCard)
		.setName(t('settings.pomodoroEnabled'))
		.setDesc(t('settings.pomodoroEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.pomodoroEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					pomodoroEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);
	this.renderWidgetBackgroundSetting(pomodoroCard, 'pomodoroBackground');

	if (this.plugin.settings.pomodoroEnabled) {
		const workSetting = new Setting(pomodoroCard)
			.setName(t('settings.pomodoroWork') + '  ' + this.plugin.settings.pomodoroWorkMinutes + ' min')
			.addSlider((slider) =>
				slider
					.setLimits(15, 60, 5)
					.setValue(this.plugin.settings.pomodoroWorkMinutes)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							pomodoroWorkMinutes: value,
						};
						await this.plugin.saveSettings();
						workSetting.nameEl.setText(t('settings.pomodoroWork') + '  ' + value + ' min');
					}),
			);

		const shortSetting = new Setting(pomodoroCard)
			.setName(t('settings.pomodoroShortBreak') + '  ' + this.plugin.settings.pomodoroShortBreakMinutes + ' min')
			.addSlider((slider) =>
				slider
					.setLimits(1, 15, 1)
					.setValue(this.plugin.settings.pomodoroShortBreakMinutes)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							pomodoroShortBreakMinutes: value,
						};
						await this.plugin.saveSettings();
						shortSetting.nameEl.setText(t('settings.pomodoroShortBreak') + '  ' + value + ' min');
					}),
			);

		const longSetting = new Setting(pomodoroCard)
			.setName(t('settings.pomodoroLongBreak') + '  ' + this.plugin.settings.pomodoroLongBreakMinutes + ' min')
			.addSlider((slider) =>
				slider
					.setLimits(5, 30, 5)
					.setValue(this.plugin.settings.pomodoroLongBreakMinutes)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							pomodoroLongBreakMinutes: value,
						};
						await this.plugin.saveSettings();
						longSetting.nameEl.setText(t('settings.pomodoroLongBreak') + '  ' + value + ' min');
					}),
			);

		const intervalSetting = new Setting(pomodoroCard)
			.setName(t('settings.pomodoroInterval') + '  ' + this.plugin.settings.pomodoroLongBreakInterval)
			.addSlider((slider) =>
				slider
					.setLimits(2, 6, 1)
					.setValue(this.plugin.settings.pomodoroLongBreakInterval)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							pomodoroLongBreakInterval: value,
						};
						await this.plugin.saveSettings();
						intervalSetting.nameEl.setText(t('settings.pomodoroInterval') + '  ' + value);
					}),
			);

		const goalSetting = new Setting(pomodoroCard)
			.setName(t('settings.pomodoroGoal') + '  ' + this.plugin.settings.pomodoroDailyGoal + ' 🍅')
			.addSlider((slider) =>
				slider
					.setLimits(1, 16, 1)
					.setValue(this.plugin.settings.pomodoroDailyGoal)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							pomodoroDailyGoal: value,
						};
						await this.plugin.saveSettings();
						goalSetting.nameEl.setText(t('settings.pomodoroGoal') + '  ' + value + ' 🍅');
					}),
			);

		new Setting(pomodoroCard)
			.setName(t('settings.pomodoroAutoStart'))
			.setDesc(t('settings.pomodoroAutoStartDesc'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.pomodoroAutoStartBreak).onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						pomodoroAutoStartBreak: value,
					};
					await this.plugin.saveSettings();
				}),
			);

		new Setting(pomodoroCard).setName(t('settings.pomodoroSound')).addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.pomodoroSoundEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					pomodoroSoundEnabled: value,
				};
				await this.plugin.saveSettings();
			}),
		);

		new Setting(pomodoroCard)
			.setName(t('settings.pomodoroMiniPanel'))
			.setDesc(t('settings.pomodoroMiniPanelDesc'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.pomodoroMiniPanelEnabled).onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						pomodoroMiniPanelEnabled: value,
					};
					await this.plugin.saveSettings();
				}),
			);
	}

	// --- Reading card ---
	const readingCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(readingCard)
		.setName(t('settings.readingEnabled'))
		.setDesc(t('settings.readingEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.readingEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					readingEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
			}),
		);

	if (this.plugin.settings.readingEnabled) {
		new Setting(readingCard).setName(t('settings.readingSound')).addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.readingSoundEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					readingSoundEnabled: value,
				};
				await this.plugin.saveSettings();
			}),
		);
		// Stacked-layout card height (side layout ignores it). The album
		// i18n keys carry the generic "card size" wording, so they are
		// reused instead of forking a third translation set.
		new Setting(readingCard)
			.setName(t('album.heightRatio'))
			.setDesc(t('album.heightRatioDesc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('full', t('album.size.full'))
					.addOption('twoThirds', t('album.size.twoThirds'))
					.addOption('half', t('album.size.half'))
					.addOption('third', t('album.size.third'))
					.setValue(this.plugin.settings.readingHeightRatio)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							readingHeightRatio: value as WidgetHeightRatio,
						};
						await this.plugin.saveSettings();
						// The widget signature includes the ratio → rebuild
						// rewrites the packed grid spans.
						this.plugin.refreshAllDashboards();
					}),
			);
	}

	// --- Habit card ---
	const habitCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(habitCard)
		.setName(t('settings.widgetHabitEnabled'))
		.setDesc(t('settings.widgetHabitEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetHabitEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetHabitEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);
	if (this.plugin.settings.widgetHabitEnabled) {
		// Stacked-layout card height (side layout ignores it); generic
		// album.* wording reused — see the reading card.
		new Setting(habitCard)
			.setName(t('album.heightRatio'))
			.setDesc(t('album.heightRatioDesc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('full', t('album.size.full'))
					.addOption('twoThirds', t('album.size.twoThirds'))
					.addOption('half', t('album.size.half'))
					.addOption('third', t('album.size.third'))
					.setValue(this.plugin.settings.habitHeightRatio)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							habitHeightRatio: value as WidgetHeightRatio,
						};
						await this.plugin.saveSettings();
						this.plugin.refreshAllDashboards();
					}),
			);
	}
	this.renderWidgetBackgroundSetting(habitCard, 'habitBackground');

	// --- Expense tracker card ---
	const expenseCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(expenseCard)
		.setName(t('settings.widgetExpenseEnabled'))
		.setDesc(t('settings.widgetExpenseEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetExpenseEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetExpenseEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);
	new Setting(expenseCard)
		.setName(t('settings.expenseCurrency'))
		.setDesc(t('settings.expenseCurrencyDesc'))
		.addText((text) =>
			text
				.setPlaceholder('¥')
				.setValue(this.plugin.settings.expenseCurrency)
				.onChange(async (value) => {
					this.plugin.settings = { ...this.plugin.settings, expenseCurrency: value.trim() };
					await this.plugin.saveSettings();
					// The sidebar signature includes the currency, so a change
					// must rebuild the widget (and its derived labels).
					this.plugin.refreshAllDashboards();
				}),
		);

	// --- Music player card (desktop + tablet widget) ---
	const musicCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(musicCard)
		.setName(t('settings.widgetMusic'))
		.setDesc(t('settings.widgetMusicDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetMusicEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetMusicEnabled: value,
				};
				await this.plugin.saveSettings();
				// Disabling the widget stops playback too (no zombie audio
				// behind a hidden UI).
				if (!value) getMusicService()?.pause();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);

	renderMusicAccountSettings(musicCard);
	this.renderWidgetBackgroundSetting(musicCard, 'musicBackground');

	// --- Countdown card ---
	const countdownCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(countdownCard)
		.setName(t('settings.countdownEnabled'))
		.setDesc(t('settings.countdownEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.countdownEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					countdownEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);

	if (this.plugin.settings.countdownEnabled) {
		this.renderCountdownList(countdownCard);
	}
}

/** Widgets tab, part 1: the section heading + weather card. Kept separate
 *  from {@link renderWidgetSettings} so the calendar section can sit
 *  directly beneath the weather card in the tab's card order. */
export function renderWeatherSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.widgetTheme')).setHeading();

	// --- Quick buttons card ---
	const quickActionsCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(quickActionsCard)
		.setName(t('settings.widgetQuickActionsEnabled'))
		.setDesc(t('settings.widgetQuickActionsEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetQuickActionsEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetQuickActionsEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
			}),
		);
	this.renderWidgetBackgroundSetting(quickActionsCard, 'quickActionsBackground');

	// --- Weather card ---
	const weatherCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(weatherCard)
		.setName(t('settings.widgetWeatherEnabled'))
		.setDesc(t('settings.widgetWeatherEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetWeatherEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetWeatherEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);

	if (this.plugin.settings.widgetWeatherEnabled) {
		new Setting(weatherCard)
			.setName(t('settings.widgetWeatherCity'))
			.setDesc(t('settings.widgetWeatherCityDesc'))
			.addText((text) => {
				text.setPlaceholder(t('settings.widgetWeatherCityPlaceholder'))
					.setValue(this.plugin.settings.widgetWeatherCity)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							widgetWeatherCity: value.trim(),
						};
						await this.plugin.saveSettings();
						// The suggestion click path updates lat/lon and refreshes
						// itself; manual typing only changes the display label, so
						// refresh here to redraw the widget with the new name.
						this.plugin.refreshAllDashboards();
					});
				this.attachCitySuggest(text.inputEl);
			});
	}
}

export function renderLunarSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.widgetLunar')).setHeading();

	const lunarCard = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(lunarCard)
		.setName(t('settings.widgetLunarEnabled'))
		.setDesc(t('settings.widgetLunarEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetLunarEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetLunarEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);
}

export function renderYearProgressSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.widgetYearProgress')).setHeading();

	const card = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(card)
		.setName(t('settings.widgetYearProgressEnabled'))
		.setDesc(t('settings.widgetYearProgressEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetYearProgressEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetYearProgressEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);
	this.renderWidgetBackgroundSetting(card, 'yearProgressBackground');
}

export function attachCitySuggest(this: DashboardSettingTab, inputEl: HTMLInputElement): void {
	let dropdown: HTMLElement | null = null;
	let debounceTimer: number | null = null;

	const close = () => {
		if (dropdown) {
			dropdown.remove();
			dropdown = null;
		}
	};

	inputEl.addEventListener('input', () => {
		if (debounceTimer) window.clearTimeout(debounceTimer);
		const query = inputEl.value.trim();
		if (query.length < 2) {
			close();
			return;
		}

		debounceTimer = window.setTimeout(() => {
			void this.suggestCities(inputEl, query, dropdown, close).then((next) => {
				dropdown = next;
			});
		}, 300);
	});

	inputEl.addEventListener('blur', () => {
		window.setTimeout(close, 200);
	});
}

export async function suggestCities(
	this: DashboardSettingTab,
	inputEl: HTMLInputElement,
	query: string,
	dropdown: HTMLElement | null,
	close: () => void,
): Promise<HTMLElement | null> {
	const results = await geocodeCity(query);
	close();
	if (results.length === 0) return dropdown;

	// Global createDiv(), NOT inputEl.ownerDocument.createDiv: the
	// Node.createEl extension appends the new element to its receiver —
	// on a Document that throws HierarchyRequestError, which killed this
	// dropdown before it ever rendered. The global helper stays detached;
	// we append to body explicitly below.
	const next = createDiv({ cls: 'dashboard-city-suggest' });
	Object.assign(next.style, {
		position: 'absolute',
		zIndex: '100',
		background: 'var(--background-secondary)',
		border: '1px solid var(--background-modifier-border)',
		borderRadius: '6px',
		boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
		maxHeight: '200px',
		overflowY: 'auto',
		width: inputEl.getBoundingClientRect().width + 'px',
	});

	const rect = inputEl.getBoundingClientRect();
	next.style.left = rect.left + 'px';
	next.style.top = rect.bottom + 4 + 'px';

	for (const r of results) {
		const item = next.createDiv({ cls: 'dashboard-city-suggest-item' });
		const label = r.admin1 ? `${r.name}, ${r.admin1}, ${r.country}` : `${r.name}, ${r.country}`;
		item.textContent = label;
		Object.assign(item.style, {
			padding: '6px 10px',
			cursor: 'pointer',
			fontSize: '0.85em',
			borderBottom: '1px solid var(--background-modifier-border)',
		});
		item.addEventListener('mouseenter', () => {
			item.setCssProps({ background: 'var(--background-modifier-hover)' });
		});
		item.addEventListener('mouseleave', () => {
			item.setCssProps({ background: '' });
		});
		item.addEventListener('click', () => {
			void (async () => {
				inputEl.value = r.name;
				this.plugin.settings = {
					...this.plugin.settings,
					widgetWeatherCity: r.name,
					widgetWeatherLat: r.latitude,
					widgetWeatherLon: r.longitude,
				};
				await this.plugin.saveSettings();
				close();
				this.plugin.refreshAllDashboards();
			})();
		});
	}

	inputEl.ownerDocument.body.appendChild(next);
	return next;
}
