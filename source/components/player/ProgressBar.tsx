// Progress bar component
import {Box, Text} from 'ink';
import {useTheme} from '../../hooks/useTheme.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';
import {formatTime} from '../../utils/format.ts';

export default function ProgressBar() {
	const {theme} = useTheme();
	const {state: playerState} = usePlayer();
	const {columns} = useTerminalSize();

	if (!playerState.currentTrack || !playerState.duration) {
		return null;
	}

	// Clamp values to valid range
	const progress = Math.max(
		0,
		Math.min(playerState.progress, playerState.duration),
	);
	const duration = playerState.duration;
	const totalBarWidth = Math.max(10, columns - 8);
	const filledWidth =
		duration > 0 ? Math.floor((progress / duration) * totalBarWidth) : 0;

	return (
		<Box>
			<Text color={theme.colors.text}>{formatTime(progress)}</Text>
			<Text color={theme.colors.dim}>/</Text>
			<Text color={theme.colors.text}>{formatTime(duration)}</Text>
			<Text> </Text>
			<Text color={theme.colors.primary}>
				{'█'.repeat(Math.min(filledWidth, totalBarWidth))}
			</Text>
			<Text color={theme.colors.dim}>
				{'░'.repeat(Math.max(0, totalBarWidth - filledWidth))}
			</Text>
			<Text color={theme.colors.dim}>
				{' '}
				{duration > 0 ? Math.floor((progress / duration) * 100) : 0}%
			</Text>
		</Box>
	);
}
