// Queue management component
import {useState} from 'react';
import React from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../../hooks/useTheme.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {useFavorites} from '../../stores/favorites.store.tsx';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {ICONS} from '../../utils/icons.ts';
import {truncate} from '../../utils/format.ts';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';

const MAX_VISIBLE = 5;

function QueueList() {
	const {theme} = useTheme();
	const {
		state: playerState,
		removeFromQueue,
		moveInQueue,
		clearQueueKeepCurrent,
	} = usePlayer();
	const {isFavorite} = useFavorites();
	const {columns} = useTerminalSize();
	const [scrollOffset, setScrollOffset] = useState(0);
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Calculate responsive truncation
	const getTruncateLength = (baseLength: number) => {
		const scale = Math.min(1, columns / 100);
		return Math.max(20, Math.floor(baseLength * scale));
	};

	// When the playing track isn't part of the queue (standalone play),
	// show queued tracks from the start instead of after the queue position,
	// so tracks added with 'q' are visible.
	const currentTrackId = playerState.currentTrack?.videoId;
	const currentInQueue = playerState.queue.some(
		track => track.videoId === currentTrackId,
	);
	const startIndex = currentInQueue
		? playerState.queuePosition + 1
		: playerState.queuePosition;

	// Clamp scroll/selection at render time so stale state is never used
	// after the queue shrinks or the current track advances.
	const maxScroll = Math.max(
		0,
		playerState.queue.length - startIndex - MAX_VISIBLE,
	);
	const scroll = Math.min(scrollOffset, maxScroll);
	const visibleQueue = playerState.queue.slice(
		startIndex + scroll,
		startIndex + scroll + MAX_VISIBLE,
	);
	const hasMoreUp = scroll > 0;
	const hasMoreDown =
		startIndex + scroll + MAX_VISIBLE < playerState.queue.length;
	const selected = Math.min(
		Math.max(selectedIndex, 0),
		visibleQueue.length - 1,
	);
	const selectedAbs = startIndex + scroll + selected;

	const navigateUp = () => {
		if (selected > 0) {
			setSelectedIndex(i => i - 1);
		} else if (scroll > 0) {
			setScrollOffset(offset => offset - 1);
		}
	};

	const navigateDown = () => {
		if (selected < visibleQueue.length - 1) {
			setSelectedIndex(i => i + 1);
		} else if (hasMoreDown) {
			setScrollOffset(offset => offset + 1);
		}
	};

	const removeSelected = () => {
		if (selectedAbs >= 0 && selectedAbs < playerState.queue.length) {
			removeFromQueue(selectedAbs);
		}
	};

	const clearQueue = () => {
		clearQueueKeepCurrent();
	};

	const moveSelected = (direction: 1 | -1) => {
		const to = selectedAbs + direction;
		if (
			selectedAbs < startIndex ||
			to < startIndex ||
			to >= playerState.queue.length
		) {
			return;
		}

		moveInQueue(selectedAbs, to);

		// Follow the moved track within the visible window
		if (direction === 1 && selected === visibleQueue.length - 1) {
			setScrollOffset(offset => offset + 1);
		} else if (direction === -1 && selected === 0 && scroll > 0) {
			setScrollOffset(offset => offset - 1);
		} else {
			setSelectedIndex(i => i + direction);
		}
	};

	useKeyBinding(['up'], navigateUp);
	useKeyBinding(['down'], navigateDown);
	useKeyBinding(['k'], () => moveSelected(-1));
	useKeyBinding(['j'], () => moveSelected(1));
	useKeyBinding(['d'], removeSelected);
	useKeyBinding(['c'], clearQueue);
	useKeyBinding(['['], () => moveSelected(-1));
	useKeyBinding([']'], () => moveSelected(1));

	if (playerState.queue.length === 0) {
		return null;
	}

	if (visibleQueue.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column">
			<Box justifyContent="space-between">
				<Text color={theme.colors.dim}>
					Up next ({playerState.queue.length - startIndex} tracks)
				</Text>
				<Text color={theme.colors.dim}>
					↑/↓: select • j/k: reorder • d: remove • c: clear
				</Text>
			</Box>

			{hasMoreUp && <Text color={theme.colors.dim}>▲ {scroll} more</Text>}

			{visibleQueue.map((track, idx) => {
				const index = startIndex + scroll + idx;
				const isSelected = idx === selected;
				const artists = track.artists?.map(a => a.name).join(', ') || 'Unknown';
				const title = truncate(track.title, getTruncateLength(40));

				return (
					<Box key={`${track.videoId}-${index}`}>
						<Text
							color={isSelected ? theme.colors.highlight : theme.colors.dim}
						>
							{isSelected ? '▶ ' : ''}
							{index + 1}.{' '}
						</Text>
						<Text
							color={isSelected ? theme.colors.highlight : theme.colors.text}
							bold={isSelected}
						>
							{isFavorite(track.videoId) ? `${ICONS.HEART} ` : ''}
							{title}
						</Text>
						<Text
							color={isSelected ? theme.colors.highlight : theme.colors.dim}
						>
							{' '}
							• {artists}
						</Text>
					</Box>
				);
			})}

			{hasMoreDown && (
				<Text color={theme.colors.dim}>
					▼ {playerState.queue.length - (startIndex + scroll + MAX_VISIBLE)}{' '}
					more
				</Text>
			)}
		</Box>
	);
}

export default React.memo(QueueList);
