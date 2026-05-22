import {useState} from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../../hooks/useTheme.ts';
import {useHistory} from '../../stores/history.store.tsx';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {useFavorites} from '../../stores/favorites.store.tsx';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';
import {truncate} from '../../utils/format.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {KEYBINDINGS} from '../../utils/constants.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	dateStyle: 'medium',
	timeStyle: 'short',
});

function formatTimestamp(iso: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}

	return DATE_FORMATTER.format(date);
}

export default function HistoryLayout() {
	const {theme} = useTheme();
	const {history} = useHistory();
	const {columns, rows} = useTerminalSize();
	const {dispatch} = useNavigation();
	const {play} = usePlayer();
	const {toggleFavorite} = useFavorites();

	const [scrollOffset, setScrollOffset] = useState(0);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const maxVisible = Math.max(1, Math.floor((rows - 5) / 3));
	const maxTitleLength = Math.max(30, columns - 20);
	const visibleHistory = history.slice(
		scrollOffset,
		scrollOffset + maxVisible,
	);
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset + maxVisible < history.length;

	useKeyBinding(KEYBINDINGS.BACK, () => {
		dispatch({category: 'GO_BACK'});
	});

	useKeyBinding(KEYBINDINGS.UP, () => {
		if (selectedIndex > 0) {
			setSelectedIndex(i => i - 1);
		} else if (canScrollUp) {
			setScrollOffset(offset => offset - 1);
		}
	});

	useKeyBinding(KEYBINDINGS.DOWN, () => {
		if (selectedIndex < visibleHistory.length - 1) {
			setSelectedIndex(i => i + 1);
		} else if (canScrollDown) {
			setScrollOffset(offset => offset + 1);
		}
	});

	useKeyBinding(KEYBINDINGS.SELECT, () => {
		const entry = visibleHistory[selectedIndex];
		if (entry) {
			play(entry.track, {clearQueue: true});
		}
	});

	useKeyBinding(KEYBINDINGS.TOGGLE_FAVORITE, () => {
		const entry = visibleHistory[selectedIndex];
		if (entry) {
			toggleFavorite(entry.track);
		}
	});

	return (
		<Box flexDirection="column" padding={1} gap={0}>
			<Box marginBottom={1}>
				<Text color={theme.colors.primary} bold>
					Recently Played ({history.length})
				</Text>
			</Box>

			{canScrollUp && (
				<Text color={theme.colors.dim}>▲ {scrollOffset} more</Text>
			)}

			{history.length === 0 ? (
				<Text color={theme.colors.dim}>No listening history yet.</Text>
			) : (
				visibleHistory.map((entry, index) => {
					const isSelected = index === selectedIndex;
					const artists = entry.track.artists
						?.map(artist => artist.name)
						.join(', ')
						.trim();
					return (
						<Box
							key={`${entry.playedAt}-${entry.track.videoId}`}
							flexDirection="column"
							paddingX={1}
							paddingY={0}
							backgroundColor={
								isSelected ? theme.colors.highlight : undefined
							}
						>
							<Box>
								<Text
									color={
										isSelected ? theme.colors.text : theme.colors.secondary
									}
									bold={isSelected}
								>
									{isSelected ? '> ' : '  '}
									{formatTimestamp(entry.playedAt)}
								</Text>
							</Box>
							<Box>
								<Text
									color={theme.colors.text}
									bold={isSelected}
								>
									{truncate(entry.track.title, maxTitleLength)}
								</Text>
								<Text
									color={
										isSelected ? theme.colors.text : theme.colors.dim
									}
								>
									{artists ? ` • ${artists}` : ''}
								</Text>
							</Box>
							{entry.track.album?.name && (
								<Text
									color={
										isSelected ? theme.colors.text : theme.colors.dim
									}
								>
									Album: {entry.track.album.name}
								</Text>
							)}
						</Box>
					);
				})
			)}

			{canScrollDown && (
				<Text color={theme.colors.dim}>
					▼ {history.length - scrollOffset - maxVisible} more
				</Text>
			)}

			<Box marginTop={1}>
				<Text color={theme.colors.dim}>
					↑↓ Navigate • Enter Play • f Favorite • Esc back
				</Text>
			</Box>
		</Box>
	);
}
