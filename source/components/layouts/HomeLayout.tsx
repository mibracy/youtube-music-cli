// Home / Startup screen component
import {Box, Text, useInput} from 'ink';
import {useState, useEffect, useCallback} from 'react';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {useHistory} from '../../stores/history.store.tsx';
import {useFavorites} from '../../stores/favorites.store.tsx';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {VIEW, KEYBINDINGS} from '../../utils/constants.ts';
import {
	useKeyBinding,
	subscribeToQuitSequence,
	getQuitSequence,
	setHighlightedTrack,
} from '../../hooks/useKeyboard.tsx';
import {truncate, formatTime} from '../../utils/format.ts';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';
import {ICONS} from '../../utils/icons.ts';
import {getMusicService} from '../../services/youtube-music/api.ts';
import {type Track} from '../../types/youtube-music.types.ts';

type TabId = 'quicklinks' | 'recentlyplayed' | 'favorites';
const TAB_ORDER: TabId[] = ['quicklinks', 'recentlyplayed', 'favorites'];

export default function HomeLayout() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const {history} = useHistory();
	const {favorites} = useFavorites();
	const {state: playerState, play} = usePlayer();
	const {columns, rows} = useTerminalSize();

	const [activeTab, setActiveTab] = useState<TabId>('quicklinks');
	const [tabIndices, setTabIndices] = useState<Record<TabId, number>>({
		quicklinks: 0,
		recentlyplayed: 0,
		favorites: 0,
	});
	const [quitState, setQuitState] = useState(getQuitSequence);

	useEffect(() => subscribeToQuitSequence(setQuitState), []);

	const RANDOM_QUERIES = [
		'top hits 2024',
		'popular songs',
		'trending music',
		'chill vibes',
		'rock classics',
		'indie hits',
		'hip hop bangers',
		'electronic dance',
		'acoustic favorites',
		'feel good music',
		'jazz essentials',
		'r&b hits',
		'summer songs',
	];

	const handlePlayRandom = () => {
		const query =
			RANDOM_QUERIES[Math.floor(Math.random() * RANDOM_QUERIES.length)]!;
		getMusicService()
			.search(query, {type: 'songs', limit: 10})
			.then(response => {
				const tracks = response.results
					.filter(r => r.type === 'song')
					.map(r => r.data as Track);
				if (tracks.length > 0) {
					const track = tracks[Math.floor(Math.random() * tracks.length)]!;
					play(track, {clearQueue: true});
				}
			})
			.catch(() => {});
	};

	const handlePlayRandomFavorite = () => {
		if (favorites.length === 0) {
			return;
		}
		const randomIndex = Math.floor(Math.random() * favorites.length);
		const track = favorites[randomIndex];
		if (track) {
			play(track, {clearQueue: true});
		}
	};

	type QuickLink =
		| {label: string; view: (typeof VIEW)[keyof typeof VIEW]; action?: never}
		| {label: string; view?: never; action: () => void};

	// Quick links
	const quickLinks: QuickLink[] = [
		{label: '🔍 Search', view: VIEW.SEARCH},
		{label: '📜 Playlists', view: VIEW.PLAYLISTS},
		{label: '🔥 Trending', view: VIEW.TRENDING},
		{label: '🆕 New Releases', view: VIEW.NEW_RELEASES},
		{label: '📻 Radio Streams', view: VIEW.RADIO},
		{label: '📡 Live Streams', view: VIEW.LIVE_STREAMS},
		{label: '💘 Favorites', view: VIEW.FAVORITES},
		{label: '🕒 History', view: VIEW.HISTORY},
		{label: '🎵 Queue', view: VIEW.PLAYER},
		{label: '🎲 Random Song', action: handlePlayRandom},
		{label: '🎲 Random Favorite', action: handlePlayRandomFavorite},
	];

	// Calculate how many items fit per section based on terminal height
	const headerRows = 3;
	const progressRows =
		playerState.currentTrack || playerState.playbackMode === 'stream' ? 4 : 0;
	const footerRows = rows >= 25 ? 3 : 1;
	const sectionBorderTitleRows = 3;

	const shouldHideMenus =
		rows < 35 &&
		(playerState.currentTrack !== null ||
			playerState.playbackMode === 'stream');

	const availableForRightColumn = rows - headerRows - progressRows - footerRows;
	const itemsPerSection = Math.max(
		1,
		Math.floor(availableForRightColumn / 2) - sectionBorderTitleRows,
	);

	const recentHistory = history.slice(0, itemsPerSection + 5);
	const recentFavorites = favorites.slice(0, itemsPerSection);

	const maxTitleLength = Math.max(20, columns - 40);

	const getTabMaxIndex = (tab: TabId) => {
		switch (tab) {
			case 'quicklinks':
				return quickLinks.length - 1;
			case 'recentlyplayed':
				return Math.max(0, recentHistory.length - 1);
			case 'favorites':
				return Math.max(0, recentFavorites.length - 1);
			default:
				return 0;
		}
	};

	// Register the highlighted track for "add to queue" ('q')
	useEffect(() => {
		const idx = tabIndices[activeTab];
		const track =
			activeTab === 'recentlyplayed'
				? (recentHistory[idx]?.track ?? null)
				: activeTab === 'favorites'
					? (recentFavorites[idx] ?? null)
					: null;
		setHighlightedTrack(track);

		return () => {
			setHighlightedTrack(null);
		};
	}, [activeTab, tabIndices, recentHistory, recentFavorites]);

	const cycleTab = useCallback((direction: 1 | -1) => {
		setActiveTab(prev => {
			const currentIndex = TAB_ORDER.indexOf(prev);
			const nextIndex =
				(currentIndex + direction + TAB_ORDER.length) % TAB_ORDER.length;
			return TAB_ORDER[nextIndex]!;
		});
	}, []);

	const handleSelect = useCallback(() => {
		if (shouldHideMenus) return;
		const idx = tabIndices[activeTab];

		if (activeTab === 'quicklinks') {
			const link = quickLinks[idx];
			if (link) {
				if (link.action) {
					link.action();
				} else {
					dispatch({category: 'NAVIGATE', view: link.view});
				}
			}
		} else if (activeTab === 'recentlyplayed') {
			const entry = recentHistory[idx];
			if (entry) play(entry.track, {clearQueue: true});
		} else if (activeTab === 'favorites') {
			const track = recentFavorites[idx];
			if (track) play(track, {clearQueue: true});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		activeTab,
		tabIndices,
		shouldHideMenus,
		recentHistory,
		recentFavorites,
		play,
		dispatch,
	]);

	useKeyBinding(KEYBINDINGS.UP, () => {
		if (shouldHideMenus) return;
		setTabIndices(prev => {
			const max = getTabMaxIndex(activeTab);
			return {
				...prev,
				[activeTab]: prev[activeTab] <= 0 ? max : prev[activeTab] - 1,
			};
		});
	});

	useKeyBinding(KEYBINDINGS.DOWN, () => {
		if (shouldHideMenus) return;
		setTabIndices(prev => {
			const max = getTabMaxIndex(activeTab);
			return {
				...prev,
				[activeTab]: prev[activeTab] >= max ? 0 : prev[activeTab] + 1,
			};
		});
	});

	useKeyBinding(KEYBINDINGS.SELECT, handleSelect);
	useKeyBinding(KEYBINDINGS.SEARCH, () =>
		dispatch({category: 'NAVIGATE', view: VIEW.SEARCH}),
	);

	useInput((_input, key) => {
		if (shouldHideMenus) return;
		if (key.tab) {
			cycleTab(key.shift ? -1 : 1);
		}
	});

	// Progress bar calculation
	const progress = Math.max(
		0,
		Math.min(playerState.progress, playerState.duration || 0),
	);
	const duration = playerState.duration || 0;
	const barWidth = Math.max(10, columns - 8);
	const filledWidth =
		duration > 0 ? Math.floor((progress / duration) * barWidth) : 0;

	// Extract artist string from current track
	const currentTrackArtists =
		playerState.currentTrack?.artists?.map(a => a.name).join(', ') ?? '';

	const renderTabHeader = (label: string) => {
		return (
			<Box marginBottom={0}>
				<Text bold color={theme.colors.secondary}>
					{label}
				</Text>
			</Box>
		);
	};

	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			minHeight={0}
			paddingX={1}
			paddingY={0}
		>
			{(rows >= 55 || rows <= 35) && (
				<Box
					paddingX={1}
					justifyContent="center"
					borderStyle={rows < 25 ? 'single' : 'double'}
					borderColor={theme.colors.primary}
				>
					<Text bold color={theme.colors.primary}>
						🎵 {ICONS.PLAY} youtube-music-cli {ICONS.PLAY} 🎵
					</Text>
				</Box>
			)}

			{/* Main Content Area */}
			{!shouldHideMenus ? (
				<Box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
					{/* Left Column: Quick Links */}
					<Box
						flexDirection="column"
						width="25%"
						borderStyle="round"
						borderColor={
							activeTab === 'quicklinks'
								? theme.colors.primary
								: theme.colors.dim
						}
						paddingX={1}
					>
						{renderTabHeader('Quick Links')}
						{quickLinks.map((link, index) => {
							const isSelected =
								activeTab === 'quicklinks' && tabIndices.quicklinks === index;
							return (
								<Box key={link.label}>
									<Text
										backgroundColor={
											isSelected ? theme.colors.primary : undefined
										}
										color={
											isSelected ? theme.colors.background : theme.colors.text
										}
									>
										{isSelected ? '> ' : '  '}
										{link.label}
									</Text>
								</Box>
							);
						})}
					</Box>

					{/* Right Column: Activity */}
					<Box flexDirection="column" flexGrow={1} minHeight={0}>
						{/* Recently Played */}
						<Box
							flexDirection="column"
							flexGrow={1}
							minHeight={0}
							borderStyle="round"
							borderColor={
								activeTab === 'recentlyplayed'
									? theme.colors.primary
									: theme.colors.dim
							}
							paddingX={1}
						>
							{renderTabHeader('🕒 Recently Played')}
							{recentHistory.length === 0 ? (
								<Text color={theme.colors.dim}> No history yet</Text>
							) : (
								recentHistory.map((entry, index) => {
									const isSelected =
										activeTab === 'recentlyplayed' &&
										tabIndices.recentlyplayed === index;
									return (
										<Box key={`${entry.playedAt}-${entry.track.videoId}`}>
											<Text
												backgroundColor={
													isSelected ? theme.colors.primary : undefined
												}
												color={
													isSelected
														? theme.colors.background
														: theme.colors.text
												}
											>
												{isSelected ? '> ' : '  '}
												{truncate(entry.track.title, maxTitleLength)}
											</Text>
											<Text color={theme.colors.dim} wrap="truncate">
												{' '}
												- {entry.track.artists?.[0]?.name}
											</Text>
										</Box>
									);
								})
							)}
						</Box>

						{/* Favorites */}
						<Box
							flexDirection="column"
							flexGrow={1}
							minHeight={0}
							borderStyle="round"
							borderColor={
								activeTab === 'favorites'
									? theme.colors.primary
									: theme.colors.dim
							}
							paddingX={1}
						>
							{renderTabHeader(`${ICONS.HEART} Recent Favorites`)}
							{recentFavorites.length === 0 ? (
								<Text color={theme.colors.dim}>
									{' '}
									No favorites yet (press 'f' while playing)
								</Text>
							) : (
								recentFavorites.map((track, index) => {
									const isSelected =
										activeTab === 'favorites' && tabIndices.favorites === index;
									return (
										<Box key={track.videoId}>
											<Text
												backgroundColor={
													isSelected ? theme.colors.primary : undefined
												}
												color={
													isSelected
														? theme.colors.background
														: theme.colors.text
												}
											>
												{isSelected ? '> ' : '  '}
												{truncate(track.title, maxTitleLength)}
											</Text>
											<Text color={theme.colors.dim} wrap="truncate">
												{' '}
												- {track.artists?.[0]?.name}
											</Text>
										</Box>
									);
								})
							)}
						</Box>
					</Box>
				</Box>
			) : (
				// Empty box above to help center the player vertically when menus are hidden
				<Box flexGrow={1} minHeight={0}></Box>
			)}

			{/* Player Status / Progress Bar */}
			{playerState.currentTrack && (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={theme.colors.primary}
					paddingX={1}
					marginY={0}
				>
					<Box justifyContent="space-between">
						<Box>
							<Text color={theme.colors.secondary}>
								{playerState.isPlaying ? ICONS.PLAY : ICONS.PAUSE} Currently
								playing:{' '}
							</Text>
							<Text bold color={theme.colors.primary}>
								{truncate(
									`${playerState.currentTrack.title}${
										currentTrackArtists ? ' - ' + currentTrackArtists : ''
									}`,
									columns - 45,
								)}
							</Text>
						</Box>
						<Text color={theme.colors.dim}>
							{formatTime(progress)} / {formatTime(duration)}
						</Text>
					</Box>
					<Box justifyContent="center">
						<Text color={theme.colors.primary}>
							{'█'.repeat(Math.min(filledWidth, barWidth - 2))}
						</Text>
						<Text color={theme.colors.dim}>
							{'░'.repeat(Math.max(0, barWidth - (filledWidth + 2)))}
						</Text>
					</Box>
				</Box>
			)}
			{playerState.playbackMode === 'stream' &&
				playerState.currentStation &&
				!playerState.currentTrack && (
					<Box
						flexDirection="column"
						borderStyle="round"
						borderColor={theme.colors.secondary}
						paddingX={1}
						marginY={0}
					>
						<Box justifyContent="space-between">
							<Box>
								<Text color={theme.colors.accent} bold>
									📻 {playerState.currentStation.name}
								</Text>
								<Text color={theme.colors.success}> LIVE</Text>
							</Box>
							{playerState.currentStation.region && (
								<Text color={theme.colors.dim}>
									{playerState.currentStation.region}
								</Text>
							)}
						</Box>
						{playerState.streamNowPlaying && (
							<Box>
								<Text color={theme.colors.secondary}>Now: </Text>
								<Text color={theme.colors.text}>
									{playerState.streamNowPlaying.artist &&
									playerState.streamNowPlaying.title
										? `${playerState.streamNowPlaying.artist} — ${playerState.streamNowPlaying.title}`
										: (playerState.streamNowPlaying.raw ?? '')}
								</Text>
							</Box>
						)}
						{playerState.isLoading && (
							<Text color={theme.colors.dim}>Loading stream...</Text>
						)}
					</Box>
				)}

			{shouldHideMenus && (
				// Empty box below to help center the player vertically when menus are hidden
				<Box flexGrow={1} minHeight={0}></Box>
			)}

			{/* Footer / Shortcuts */}
			<Box
				paddingX={1}
				borderStyle={rows < 25 ? undefined : 'single'}
				borderColor={theme.colors.dim}
				flexDirection="row"
				justifyContent="space-between"
			>
				<Box>
					<Text color={theme.colors.dim}>
						{rows < 25
							? 'Arrows: Nav • Enter: Select • /: Search • '
							: 'Navigate: Arrows • Select: Enter • Tab: Switch • Search: / • '}
						Quit{' '}
						<Text
							color={quitState >= 1 ? theme.colors.success : theme.colors.dim}
						>
							:
						</Text>
						<Text
							color={quitState >= 2 ? theme.colors.success : theme.colors.dim}
						>
							q
						</Text>
						{/* <Text> • Detach </Text>
						<Text
							color={quitState >= 1 ? theme.colors.success : theme.colors.dim}
						>
							:
						</Text>
						<Text
							color={quitState >= 3 ? theme.colors.success : theme.colors.dim}
						>
							d
						</Text> */}
					</Text>
				</Box>
				{rows >= 25 && columns >= 130 && (
					<Box>
						<Text color={theme.colors.dim}>
							Favorites: f • History: Sft+H • Stats: o • Settings: ,
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
}
