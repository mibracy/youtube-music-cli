import {useState, useCallback, useEffect, useMemo} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {useTheme} from '../../hooks/useTheme.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {useKeyboardBlocker} from '../../hooks/useKeyboardBlocker.tsx';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';
import {KEYBINDINGS} from '../../utils/constants.ts';
import {truncate} from '../../utils/format.ts';
import type {RadioStation} from '../../types/radio-station.types.ts';
import {RADIO_COUNTRY_OPTIONS} from '../../types/radio-station.types.ts';
import {
	flattenRadioStations,
	loadBrowseStations,
	loadRandomStation,
} from '../../services/radio-stations/radio-stations.service.ts';
import {
	getRadioFavorites,
	isRadioFavorite,
	toggleRadioFavorite,
} from '../../services/radio-stations/radio-favorites.service.ts';

type ListMode = 'browse' | 'search';

type ListRow =
	| {kind: 'header'; id: string; label: string}
	| {kind: 'station'; id: string; station: RadioStation};

function buildRows(
	favorites: readonly RadioStation[],
	remote: RadioStation[],
	remoteLabel: string,
): ListRow[] {
	const rows: ListRow[] = [];
	const favoriteIds = new Set(favorites.map(station => station.id));

	if (favorites.length > 0) {
		rows.push({kind: 'header', id: 'hdr-fav', label: 'Favorites'});
		for (const station of favorites) {
			rows.push({kind: 'station', id: `fav-${station.id}`, station});
		}
	}

	rows.push({kind: 'header', id: 'hdr-remote', label: remoteLabel});
	for (const station of remote) {
		if (favoriteIds.has(station.id)) {
			continue;
		}
		rows.push({kind: 'station', id: station.id, station});
	}

	return rows;
}

function countryLabel(code: string): string {
	return (
		RADIO_COUNTRY_OPTIONS.find(option => option.code === code)?.label ?? code
	);
}

function friendlyNetworkError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.includes('ECONNRESET') ||
		message.includes('ECONNREFUSED') ||
		message.includes('ETIMEDOUT') ||
		message.includes('abort') ||
		message.includes('fetch failed')
	) {
		return 'Network error talking to Radio Browser (will retry / use cache)';
	}
	return message;
}

function matchesQuery(station: RadioStation, query: string): boolean {
	const q = query.toLowerCase();
	return (
		station.name.toLowerCase().includes(q) ||
		(station.region?.toLowerCase().includes(q) ?? false) ||
		(station.genre?.toLowerCase().includes(q) ?? false)
	);
}

export default function RadioStationsList() {
	const {theme} = useTheme();
	const {playStream, state: playerState} = usePlayer();
	const {dispatch} = useNavigation();
	const {columns, rows: termRows} = useTerminalSize();

	const [favorites, setFavorites] = useState<readonly RadioStation[]>(() =>
		getRadioFavorites(),
	);
	const [remote, setRemote] = useState<RadioStation[]>([]);
	const [mode, setMode] = useState<ListMode>('browse');
	const [countryIndex, setCountryIndex] = useState(0);
	const [isSearching, setIsSearching] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [loading, setLoading] = useState(true);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);

	useKeyboardBlocker(isSearching);

	const country =
		RADIO_COUNTRY_OPTIONS[countryIndex] ?? RADIO_COUNTRY_OPTIONS[0]!;

	const remoteLabel =
		mode === 'search' && searchQuery.trim()
			? `Filter: ${searchQuery.trim()}`
			: `Browse · ${country.label}`;

	const filteredRemote = useMemo(() => {
		if (!searchQuery.trim()) {
			return remote;
		}

		const q = searchQuery.trim().toLowerCase();
		return remote.filter(s => matchesQuery(s, q));
	}, [remote, searchQuery]);

	const listRows = useMemo(
		() => buildRows(favorites, filteredRemote, remoteLabel),
		[favorites, filteredRemote, remoteLabel],
	);

	const stations = useMemo(
		() => flattenRadioStations({favorites, remote: filteredRemote}),
		[favorites, filteredRemote],
	);

	const selectableIndexes = useMemo(
		() =>
			listRows
				.map((row, index) => (row.kind === 'station' ? index : -1))
				.filter(index => index >= 0),
		[listRows],
	);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			setLoading(true);
			setError(null);
			try {
				const list = await loadBrowseStations({
					countrycode: country.code,
				});
				if (cancelled) {
					return;
				}
				setRemote(list.remote);
				setMode('browse');
				setFavorites(getRadioFavorites());
				const cacheNote = list.fromCache
					? list.stale
						? ' · cached (offline)'
						: ' · cached'
					: '';
				setStatus(
					`${list.remote.length} ${countryLabel(country.code)} stations${cacheNote}`,
				);
			} catch (loadError) {
				if (cancelled) {
					return;
				}
				setRemote([]);
				setError(friendlyNetworkError(loadError));
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [country.code]);

	const effectiveSelectedIndex = useMemo(() => {
		if (selectableIndexes.length === 0) {
			return 0;
		}

		if (selectableIndexes.includes(selectedIndex)) {
			return selectedIndex;
		}

		return selectableIndexes[0] ?? 0;
	}, [selectableIndexes, selectedIndex]);

	const moveSelection = useCallback(
		(direction: -1 | 1) => {
			if (selectableIndexes.length === 0) {
				return;
			}

			const currentPos = selectableIndexes.indexOf(effectiveSelectedIndex);
			const nextPos =
				currentPos === -1
					? 0
					: Math.max(
							0,
							Math.min(selectableIndexes.length - 1, currentPos + direction),
						);
			setSelectedIndex(selectableIndexes[nextPos] ?? 0);
		},
		[selectableIndexes, effectiveSelectedIndex],
	);

	const navigateUp = useCallback(() => {
		moveSelection(-1);
	}, [moveSelection]);

	const navigateDown = useCallback(() => {
		moveSelection(1);
	}, [moveSelection]);

	const playSelected = useCallback(() => {
		const row = listRows[effectiveSelectedIndex];
		if (row?.kind === 'station') {
			playStream(row.station);
		}
	}, [listRows, effectiveSelectedIndex, playStream]);

	const goBack = useCallback(() => {
		if (isSearching) {
			setIsSearching(false);
			return;
		}

		if (mode === 'search') {
			setSearchQuery('');
			setMode('browse');
			setStatus(null);
			setSelectedIndex(0);
			return;
		}

		dispatch({category: 'GO_BACK'});
	}, [dispatch, isSearching, mode]);

	const startSearch = useCallback(() => {
		setIsSearching(true);
		setSearchQuery('');
		setError(null);
		setStatus('Type to filter stations by name, region or genre');
	}, []);

	const submitSearch = useCallback(() => {
		const query = searchQuery.trim();
		setIsSearching(false);
		if (!query) {
			return;
		}

		const count = remote.filter(s => matchesQuery(s, query)).length;
		setMode('search');
		setStatus(`${count} results for "${query}"`);
		setSelectedIndex(0);
	}, [searchQuery, remote]);

	const playRandom = useCallback(async () => {
		setStatus('Picking random station…');
		setError(null);
		try {
			const station = await loadRandomStation({countrycode: country.code});
			if (!station) {
				setStatus('No random station found');
				return;
			}

			setStatus(`Random: ${station.name}`);
			playStream(station);
		} catch (randomError) {
			setError(friendlyNetworkError(randomError));
		}
	}, [playStream, country.code]);

	const cycleCountry = useCallback(() => {
		if (isSearching || mode === 'search') {
			return;
		}

		setCountryIndex(prev => (prev + 1) % RADIO_COUNTRY_OPTIONS.length);
		setSelectedIndex(0);
	}, [isSearching, mode]);

	const toggleFavoriteSelected = useCallback(() => {
		const row = listRows[effectiveSelectedIndex];
		if (row?.kind !== 'station') {
			return;
		}

		const added = toggleRadioFavorite(row.station);
		setFavorites(getRadioFavorites());
		setStatus(
			added
				? `Favorited ${row.station.name}`
				: `Removed ${row.station.name} from favorites`,
		);
	}, [listRows, effectiveSelectedIndex]);

	useKeyBinding(KEYBINDINGS.UP, navigateUp);
	useKeyBinding(KEYBINDINGS.DOWN, navigateDown);
	useKeyBinding(KEYBINDINGS.SELECT, playSelected);
	useKeyBinding(KEYBINDINGS.QUIT, goBack);
	useKeyBinding(KEYBINDINGS.BACK, goBack);
	useKeyBinding(KEYBINDINGS.SEARCH, startSearch);
	useKeyBinding(['r'], () => {
		void playRandom();
	});
	useKeyBinding(['c'], cycleCountry);
	useKeyBinding(['f'], toggleFavoriteSelected);

	const ITEMS_PER_PAGE = Math.max(5, Math.min(35, termRows - 20));
	const startIdx = Math.max(
		0,
		Math.min(
			effectiveSelectedIndex - Math.floor(ITEMS_PER_PAGE / 2),
			Math.max(0, listRows.length - ITEMS_PER_PAGE),
		),
	);
	const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, listRows.length);
	const visibleItems = listRows.slice(startIdx, endIdx);

	const currentLabel =
		playerState.playbackMode === 'stream' && playerState.currentStation
			? playerState.currentStation.name
			: null;

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color={theme.colors.accent} bold>
					📻 Radio Streams ({stations.length})
				</Text>
				<Text color={theme.colors.dim}> • </Text>
				<Text color={theme.colors.dim}>
					[Enter] Play • [/] Search • [c] Country • [f] Fav • [r] Random •
					[Esc/q] Back
				</Text>
			</Box>

			{currentLabel ? (
				<Box marginBottom={1}>
					<Text color={theme.colors.secondary}>
						Now streaming: {truncate(currentLabel, Math.floor(columns * 0.5))}
					</Text>
				</Box>
			) : null}

			{isSearching ? (
				<Box marginBottom={1}>
					<Text color={theme.colors.primary}>Search: </Text>
					<TextInput
						value={searchQuery}
						onChange={setSearchQuery}
						onSubmit={() => {
							void submitSearch();
						}}
						placeholder="station name…"
						focus
					/>
				</Box>
			) : null}

			{loading ? (
				<Box marginBottom={1}>
					<Text color={theme.colors.dim}>Loading stations…</Text>
				</Box>
			) : null}

			{error ? (
				<Box marginBottom={1}>
					<Text color={theme.colors.error}>{error}</Text>
				</Box>
			) : null}

			{status && !loading ? (
				<Box marginBottom={1}>
					<Text color={theme.colors.dim}>{status}</Text>
				</Box>
			) : null}

			{startIdx > 0 && <Text color={theme.colors.dim}>▲ {startIdx} more</Text>}

			{visibleItems.map((row, idx) => {
				const realIndex = startIdx + idx;
				if (row.kind === 'header') {
					return (
						<Box key={row.id} marginTop={idx === 0 ? 0 : 1}>
							<Text color={theme.colors.accent} bold>
								── {row.label} ──
							</Text>
						</Box>
					);
				}

				const {station} = row;
				const isSelected = realIndex === effectiveSelectedIndex;
				const meta = [station.region, station.genre]
					.filter(Boolean)
					.join(' · ');
				const favorited = isRadioFavorite(station.id);

				return (
					<Box key={row.id}>
						<Text color={isSelected ? theme.colors.primary : theme.colors.dim}>
							{isSelected ? '> ' : '  '}
						</Text>
						{favorited ? <Text color={theme.colors.accent}>♥ </Text> : null}
						<Text
							color={isSelected ? theme.colors.primary : theme.colors.text}
							bold={isSelected}
						>
							{truncate(station.name, Math.floor(columns * 0.45))}
						</Text>
						{meta ? (
							<Text color={theme.colors.dim}>
								{' '}
								• {truncate(meta, Math.floor(columns * 0.25))}
							</Text>
						) : null}
						{playerState.currentStation?.id === station.id ? (
							<Text color={theme.colors.accent}> LIVE</Text>
						) : null}
					</Box>
				);
			})}

			{endIdx < listRows.length && (
				<Text color={theme.colors.dim}>▼ {listRows.length - endIdx} more</Text>
			)}

			{!loading && remote.length === 0 && mode === 'browse' && !error ? (
				<Box marginTop={1}>
					<Text color={theme.colors.dim}>No remote stations loaded</Text>
				</Box>
			) : null}
		</Box>
	);
}
