// Settings component
import {useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {getConfigService} from '../../services/config/config.service.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {KEYBINDINGS, VIEW} from '../../utils/constants.ts';
import {useSleepTimer} from '../../hooks/useSleepTimer.ts';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';
import {formatTime} from '../../utils/format.ts';
import type {
	DownloadFormat,
	EqualizerPreset,
} from '../../types/config.types.ts';

const QUALITIES: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
const DOWNLOAD_FORMATS: DownloadFormat[] = ['mp3', 'm4a'];
const CROSSFADE_PRESETS = [0, 1, 2, 3, 5];
const EQUALIZER_PRESETS: EqualizerPreset[] = [
	'flat',
	'bass_boost',
	'vocal',
	'bright',
	'warm',
];
const VOLUME_FADE_PRESETS = [0, 1, 2, 3, 5];

const SETTINGS_ITEMS = [
	'Stream Quality',
	'Audio Normalization',
	'Gapless Playback',
	'Crossfade Duration',
	'Volume Fade Duration',
	'Equalizer Preset',
	'Subtitles',
	'Notifications',
	'Discord Rich Presence',
	'LLM Enabled',
	'LLM API Key',
	'LLM Model',
	'LLM Temperature',
	'LLM Endpoint',
	'LLM Base URL',
	'Downloads Enabled',
	'Download Folder',
	'Download Format',
	'Sleep Timer',
	'Import Playlists',
	'Export Playlists',
	'Custom Keybindings',
	'Manage Plugins',
] as const;

export default function Settings() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const config = getConfigService();
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [quality, setQuality] = useState(config.get('streamQuality') || 'high');
	const [audioNormalization, setAudioNormalization] = useState(
		config.get('audioNormalization') ?? false,
	);
	const [gaplessPlayback, setGaplessPlayback] = useState(
		config.get('gaplessPlayback') ?? true,
	);
	const [crossfadeDuration, setCrossfadeDuration] = useState(
		config.get('crossfadeDuration') ?? 0,
	);
	const [volumeFadeDuration, setVolumeFadeDuration] = useState(
		config.get('volumeFadeDuration') ?? 0,
	);
	const [equalizerPreset, setEqualizerPreset] = useState<EqualizerPreset>(
		config.get('equalizerPreset') ?? 'flat',
	);
	const [subtitlesEnabled, setSubtitlesEnabled] = useState(
		config.get('subtitlesEnabled') ?? false,
	);
	const [notifications, setNotifications] = useState(
		config.get('notifications') ?? false,
	);
	const [discordRpc, setDiscordRpc] = useState(
		config.get('discordRichPresence') ?? false,
	);
	const [downloadsEnabled, setDownloadsEnabled] = useState(
		config.get('downloadsEnabled') ?? false,
	);
	const [downloadDirectory, setDownloadDirectory] = useState(
		config.get('downloadDirectory') ?? '',
	);
	const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>(
		config.get('downloadFormat') ?? 'mp3',
	);
	const [llmEnabled, setLLMEnabled] = useState(config.getLLMEnabled());
	const [llmApiKey, setLLMApiKey] = useState(config.getLLMApiKey() ?? '');
	const [llmModel, setLLMModel] = useState(
		config.getLLMConfig()?.model ?? 'gemini-2.0-flash',
	);
	const [llmTemperature, setLLMTemperature] = useState(
		config.getLLMConfig()?.temperature ?? 0.7,
	);
	const [llmEndpoint, setLLMEndpoint] = useState(
		config.getLLMConfig()?.endpoint ?? '',
	);
	const [llmBaseUrl, setLLMBaseUrl] = useState(
		config.getLLMConfig()?.baseUrl ?? '',
	);
	const [isEditingDownloadDirectory, setIsEditingDownloadDirectory] =
		useState(false);
	const [isEditingApiKey, setIsEditingApiKey] = useState(false);
	const [isEditingBaseUrl, setIsEditingBaseUrl] = useState(false);
	const {
		isActive,
		activeMinutes,
		remainingSeconds,
		startTimer,
		cancelTimer,
		presets,
	} = useSleepTimer();

	const {rows} = useTerminalSize();
	const maxVisible = Math.max(1, Math.floor((rows - 6) / 3));
	const [scrollOffset, setScrollOffset] = useState(0);
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset + maxVisible < SETTINGS_ITEMS.length;
	const visibleSettings = SETTINGS_ITEMS.slice(scrollOffset, scrollOffset + maxVisible);

	const navigateUp = () => {
		if (isEditingApiKey || isEditingDownloadDirectory || isEditingBaseUrl) {
			return;
		}
		if (selectedIndex > 0) {
			setSelectedIndex(prev => prev - 1);
		} else if (canScrollUp) {
			setScrollOffset(offset => offset - 1);
		}
	};

	const navigateDown = (): void => {
		if (isEditingApiKey || isEditingDownloadDirectory || isEditingBaseUrl) {
			return;
		}
		if (selectedIndex < visibleSettings.length - 1) {
			setSelectedIndex(prev => prev + 1);
		} else if (canScrollDown) {
			setScrollOffset(offset => offset + 1);
		}
	};

	const toggleQuality = () => {
		const currentIndex = QUALITIES.indexOf(quality);
		const nextQuality = QUALITIES[(currentIndex + 1) % QUALITIES.length]!;
		setQuality(nextQuality);
		config.set('streamQuality', nextQuality);
	};

	const toggleNormalization = () => {
		const next = !audioNormalization;
		setAudioNormalization(next);
		config.set('audioNormalization', next);
	};

	const toggleGaplessPlayback = () => {
		const next = !gaplessPlayback;
		setGaplessPlayback(next);
		config.set('gaplessPlayback', next);
	};

	const cycleCrossfadeDuration = () => {
		const currentIndex = CROSSFADE_PRESETS.indexOf(crossfadeDuration);
		const nextIndex =
			currentIndex === -1 ? 0 : (currentIndex + 1) % CROSSFADE_PRESETS.length;
		const next = CROSSFADE_PRESETS[nextIndex] ?? 0;
		setCrossfadeDuration(next);
		config.set('crossfadeDuration', next);
	};

	const cycleVolumeFadeDuration = () => {
		const currentIndex = VOLUME_FADE_PRESETS.indexOf(volumeFadeDuration);
		const nextIndex =
			currentIndex === -1 ? 0 : (currentIndex + 1) % VOLUME_FADE_PRESETS.length;
		const next = VOLUME_FADE_PRESETS[nextIndex] ?? 0;
		setVolumeFadeDuration(next);
		config.set('volumeFadeDuration', next);
	};

	const cycleEqualizerPreset = () => {
		const currentIndex = EQUALIZER_PRESETS.indexOf(equalizerPreset);
		const nextPreset =
			EQUALIZER_PRESETS[(currentIndex + 1) % EQUALIZER_PRESETS.length]!;
		setEqualizerPreset(nextPreset);
		config.set('equalizerPreset', nextPreset);
	};

	const toggleSubtitles = () => {
		const next = !subtitlesEnabled;
		setSubtitlesEnabled(next);
		config.set('subtitlesEnabled', next);
	};

	const formatEqualizerLabel = (preset: EqualizerPreset) =>
		preset
			.split('_')
			.map(segment => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
			.join(' ');

	const toggleNotifications = () => {
		const next = !notifications;
		setNotifications(next);
		config.set('notifications', next);
	};

	const toggleDiscordRpc = () => {
		const next = !discordRpc;
		setDiscordRpc(next);
		config.set('discordRichPresence', next);
	};

	const toggleDownloadsEnabled = () => {
		const next = !downloadsEnabled;
		setDownloadsEnabled(next);
		config.set('downloadsEnabled', next);
	};

	const cycleDownloadFormat = () => {
		const currentIndex = DOWNLOAD_FORMATS.indexOf(downloadFormat);
		const nextFormat =
			DOWNLOAD_FORMATS[(currentIndex + 1) % DOWNLOAD_FORMATS.length]!;
		setDownloadFormat(nextFormat);
		config.set('downloadFormat', nextFormat);
	};

	const toggleLLMEnabled = () => {
		const next = !llmEnabled;
		setLLMEnabled(next);
		config.setLLMEnabled(next);
	};

	const cycleLLMModel = () => {
		const models = [
			'gemini-2.0-flash',
			'gemini-2.0-flash-lite',
			'gemini-1.5-flash',
			'kilo-auto/free',
			'kilo-auto/pro',
		];
		const currentIndex = models.indexOf(llmModel);
		const nextModel = models[(currentIndex + 1) % models.length]!;
		setLLMModel(nextModel);
		config.setLLMConfig({...config.getLLMConfig(), model: nextModel});
	};

	const cycleLLMTemperature = () => {
		const temps = [0.3, 0.5, 0.7, 0.9, 1.1];
		const currentIndex = temps.indexOf(llmTemperature);
		const nextTemp = temps[(currentIndex + 1) % temps.length]!;
		setLLMTemperature(nextTemp);
		config.setLLMConfig({...config.getLLMConfig(), temperature: nextTemp});
	};

	const cycleLLMEndpoint = () => {
		const endpoints = [
			'',
			'https://api.kilogateway.com/v1/chat/completions',
			'https://api.openai.com/v1/chat/completions',
		];
		const currentIndex = endpoints.indexOf(llmEndpoint);
		const nextEndpoint = endpoints[(currentIndex + 1) % endpoints.length]!;
		setLLMEndpoint(nextEndpoint);
		config.setLLMConfig({...config.getLLMConfig(), endpoint: nextEndpoint});
	};

	const cycleSleepTimer = () => {
		if (isActive) {
			cancelTimer();
			return;
		}
		// Find next preset (start from first if none active)
		const currentPresetIndex = activeMinutes
			? presets.indexOf(activeMinutes as (typeof presets)[number])
			: -1;
		const nextPreset = presets[(currentPresetIndex + 1) % presets.length]!;
		startTimer(nextPreset);
	};

	const handleSelect = () => {
		const actualIndex = scrollOffset + selectedIndex;
		if (actualIndex === 0) {
			toggleQuality();
		} else if (actualIndex === 1) {
			toggleNormalization();
		} else if (actualIndex === 2) {
			toggleGaplessPlayback();
		} else if (actualIndex === 3) {
			cycleCrossfadeDuration();
		} else if (actualIndex === 4) {
			cycleVolumeFadeDuration();
		} else if (actualIndex === 5) {
			cycleEqualizerPreset();
		} else if (actualIndex === 6) {
			toggleSubtitles();
		} else if (actualIndex === 7) {
			toggleNotifications();
		} else if (actualIndex === 8) {
			toggleDiscordRpc();
		} else if (actualIndex === 9) {
			toggleLLMEnabled();
		} else if (actualIndex === 10) {
			setIsEditingApiKey(true);
		} else if (actualIndex === 11) {
			cycleLLMModel();
		} else if (actualIndex === 12) {
			cycleLLMTemperature();
		} else if (actualIndex === 13) {
			cycleLLMEndpoint();
		} else if (actualIndex === 14) {
			setIsEditingBaseUrl(true);
		} else if (actualIndex === 15) {
			toggleDownloadsEnabled();
		} else if (actualIndex === 16) {
			setIsEditingDownloadDirectory(true);
		} else if (actualIndex === 17) {
			cycleDownloadFormat();
		} else if (actualIndex === 18) {
			cycleSleepTimer();
		} else if (actualIndex === 19) {
			dispatch({category: 'NAVIGATE', view: VIEW.IMPORT});
		} else if (actualIndex === 20) {
			dispatch({category: 'NAVIGATE', view: VIEW.EXPORT_PLAYLISTS});
		} else if (actualIndex === 21) {
			dispatch({category: 'NAVIGATE', view: VIEW.KEYBINDINGS});
		} else if (actualIndex === 22) {
			dispatch({category: 'NAVIGATE', view: VIEW.PLUGINS});
		}
	};

	useKeyBinding(KEYBINDINGS.UP, navigateUp);
	useKeyBinding(KEYBINDINGS.DOWN, navigateDown);
	useKeyBinding(KEYBINDINGS.SELECT, handleSelect);

	const sleepTimerLabel =
		isActive && remainingSeconds !== null
			? `Sleep Timer: ${formatTime(remainingSeconds)} remaining (Enter to cancel)`
			: 'Sleep Timer: Off (Enter to set)';

	const renderSettingItem = (actualIndex: number, isSelected: boolean) => {
		const bg = isSelected ? theme.colors.highlight : undefined;

		const box = (content: string) => (
			<Box key={actualIndex} paddingX={1}>
				<Text backgroundColor={bg} color={theme.colors.text} bold={isSelected}>
					{content}
				</Text>
			</Box>
		);

		switch (actualIndex) {
			case 0: return box(`Stream Quality: ${quality.toUpperCase()}`);
			case 1: return box(`Audio Normalization: ${audioNormalization ? 'ON' : 'OFF'}`);
			case 2: return box(`Gapless Playback: ${gaplessPlayback ? 'ON' : 'OFF'}`);
			case 3: return box(`Crossfade: ${crossfadeDuration === 0 ? 'Off' : `${crossfadeDuration}s`}`);
			case 4: return box(`Volume Fade: ${volumeFadeDuration === 0 ? 'Off' : `${volumeFadeDuration}s`}`);
			case 5: return box(`Equalizer: ${formatEqualizerLabel(equalizerPreset)}`);
			case 6: return box(`Subtitles: ${subtitlesEnabled ? 'ON' : 'OFF'}`);
			case 7: return box(`Desktop Notifications: ${notifications ? 'ON' : 'OFF'}`);
			case 8: return box(`Discord Rich Presence: ${discordRpc ? 'ON' : 'OFF'}`);
			case 9: return box(`AI Assistant: ${llmEnabled ? 'ON' : 'OFF'}`);
			case 10:
				if (isEditingApiKey && isSelected) {
					return (
						<Box key={10} paddingX={1}>
							<TextInput
								value={llmApiKey}
								onChange={setLLMApiKey}
								onSubmit={value => {
									const trimmed = value.trim();
									setLLMApiKey(trimmed);
									config.setLLMApiKey(trimmed);
									setIsEditingApiKey(false);
								}}
								placeholder="Enter your Gemini API key"
								focus
							/>
						</Box>
					);
				}
				return box(`API Key: ${llmApiKey ? `${llmApiKey.slice(0, 4)}...${llmApiKey.slice(-4)}` : '(not set)'}`);
			case 11: return box(`Model: ${llmModel}`);
			case 12: return box(`Temperature: ${llmTemperature.toFixed(1)}`);
			case 13: return box(`Endpoint: ${llmEndpoint ? llmEndpoint.replace('https://', '').substring(0, 30) : 'Default (Gemini)'}`);
			case 14:
				if (isEditingBaseUrl && isSelected) {
					return (
						<Box key={14} paddingX={1}>
							<TextInput
								value={llmBaseUrl}
								onChange={setLLMBaseUrl}
								onSubmit={value => {
									const trimmed = value.trim();
									setLLMBaseUrl(trimmed);
									config.setLLMConfig({...config.getLLMConfig(), baseUrl: trimmed});
									setIsEditingBaseUrl(false);
								}}
								placeholder="Enter base URL (e.g., https://api.kilogateway.com/v1)"
								focus
							/>
						</Box>
					);
				}
				return box(`Base URL: ${llmBaseUrl ? llmBaseUrl.replace('https://', '').substring(0, 30) : '(not set)'}`);
			case 15: return box(`Download Feature: ${downloadsEnabled ? 'ON' : 'OFF'}`);
			case 16:
				if (isEditingDownloadDirectory && isSelected) {
					return (
						<Box key={16} paddingX={1}>
							<TextInput
								value={downloadDirectory}
								onChange={setDownloadDirectory}
								onSubmit={value => {
									const normalized = value.trim();
									if (!normalized) {
										setIsEditingDownloadDirectory(false);
										return;
									}
									setDownloadDirectory(normalized);
									config.set('downloadDirectory', normalized);
									setIsEditingDownloadDirectory(false);
								}}
								placeholder="Download directory"
								focus
							/>
						</Box>
					);
				}
				return box(`Download Folder: ${downloadDirectory}`);
			case 17: return box(`Download Format: ${downloadFormat.toUpperCase()}`);
			case 18:
				return (
					<Box key={18} paddingX={1}>
						<Text
							backgroundColor={bg}
							color={
								isSelected
									? theme.colors.background
									: isActive
										? theme.colors.accent
										: theme.colors.text
							}
							bold={isSelected}
						>
							{sleepTimerLabel}
						</Text>
					</Box>
				);
			case 19: return box('Import Playlists →');
			case 20: return box('Export Playlists →');
			case 21: return box('Custom Keybindings →');
			case 22: return box('Manage Plugins');
			default: return null;
		}
	};

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0} gap={0}>
			<Box
				borderStyle="double"
				borderColor={theme.colors.secondary}
				paddingX={1}
				marginBottom={1}
			>
				<Text bold color={theme.colors.primary}>
					Settings
				</Text>
			</Box>

			{canScrollUp && (
				<Text color={theme.colors.dim}>▲ {scrollOffset} more</Text>
			)}

			{visibleSettings.map((_item, index) =>
				renderSettingItem(scrollOffset + index, index === selectedIndex),
			)}

			{canScrollDown && (
				<Text color={theme.colors.dim}>
					▼ {SETTINGS_ITEMS.length - scrollOffset - maxVisible} more
				</Text>
			)}

			{/* Info */}
			<Box marginTop={1}>
				<Text color={theme.colors.dim}>
					Arrows to navigate, Enter to select, Esc/q to go back
				</Text>
			</Box>
		</Box>
	);
}
