import {useState, useEffect, useCallback} from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../../hooks/useTheme.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {KEYBINDINGS} from '../../utils/constants.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {
	getLyricsService,
	type LyricLine,
} from '../../services/lyrics/lyrics.service.ts';
import {useTerminalSize} from '../../hooks/useTerminalSize.ts';

const CONTEXT_LINES = 4;

export default function LyricsLayout() {
	const {theme} = useTheme();
	const {state} = usePlayer();
	const {rows} = useTerminalSize();
	const [lyrics, setLyrics] = useState<{
		synced: LyricLine[] | null;
		plain: string | null;
	} | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const lyricsService = getLyricsService();
	const {dispatch} = useNavigation();

	const goBack = useCallback(() => {
		dispatch({category: 'GO_BACK'});
	}, [dispatch]);

	useKeyBinding(KEYBINDINGS.BACK, goBack);

	useEffect(() => {
		const track = state.currentTrack;
		let cancelled = false;
		if (!track) {
			queueMicrotask(() => {
				if (!cancelled) {
					setLyrics(null);
					setLoading(false);
					setError(null);
				}
			});
			return;
		}

		const artist = track.artists?.[0]?.name ?? '';
		queueMicrotask(() => {
			if (!cancelled) {
				setLoading(true);
				setError(null);
			}
		});

		void lyricsService
			.getLyrics(track.title, artist, state.duration || undefined)
			.then(result => {
				if (cancelled) {
					return;
				}

				setLyrics(result);
				setLoading(false);
				if (!result) {
					setError('No lyrics found');
				}
			})
			.catch(() => {
				if (cancelled) {
					return;
				}

				setLoading(false);
				setError('Failed to load lyrics');
			});

		return () => {
			cancelled = true;
		};
	}, [lyricsService, state.currentTrack, state.duration]);

	const track = state.currentTrack;
	const title = track?.title ?? 'No track playing';
	const artist = track?.artists?.map(a => a.name).join(', ') ?? '';

	const currentLineIndex = lyrics?.synced
		? lyricsService.getCurrentLineIndex(lyrics.synced, state.progress)
		: -1;

	const visibleLines = (() => {
		if (!lyrics?.synced) return null;

		const clampedIndex = Math.max(0, currentLineIndex);
		const total = lyrics.synced.length;
		const windowSize = CONTEXT_LINES * 2 + 1;

		const initialStart = Math.max(0, clampedIndex - CONTEXT_LINES);
		const initialEnd = Math.min(total, initialStart + windowSize);
		const start = Math.max(0, initialEnd - windowSize);
		const end = Math.min(total, start + windowSize);

		return lyrics.synced.slice(start, end).map((line, i) => ({
			line,
			globalIndex: start + i,
		}));
	})();

	return (
		<Box flexDirection="column" flexGrow={1}>
			<Box
				borderStyle="double"
				borderColor={theme.colors.secondary}
				paddingX={1}
			>
				<Text bold color={theme.colors.primary}>
					{title}
				</Text>
				{artist && <Text color={theme.colors.secondary}> — {artist}</Text>}
			</Box>

			{loading && (
				<Box flexGrow={1} alignItems="center" justifyContent="center">
					<Text color={theme.colors.accent}>Loading lyrics...</Text>
				</Box>
			)}

			{error && !loading && (
				<Box flexGrow={1} alignItems="center" justifyContent="center">
					<Text color={theme.colors.dim}>{error}</Text>
				</Box>
			)}

			{!loading && visibleLines && (
				<Box
					flexGrow={1}
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
				>
					{visibleLines.map(({line, globalIndex}) => {
						const isCurrent = globalIndex === currentLineIndex;
						const isPast = globalIndex < currentLineIndex;

						return (
							<Box
								key={globalIndex}
								flexDirection="column"
								alignItems="center"
							>
								{isCurrent && <Text> </Text>}
								<Text
									bold={isCurrent}
									underline={isCurrent}
									color={
										isCurrent
											? theme.colors.primary
											: isPast
												? theme.colors.dim
												: theme.colors.text
									}
								>
									{isCurrent ? '▶ ' : '  '}
									{line.text || '♪'}
								</Text>
								{isCurrent && <Text> </Text>}
							</Box>
						);
					})}
				</Box>
			)}

			{!loading && !lyrics?.synced && lyrics?.plain && (
				<Box
					flexGrow={1}
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
				>
					{lyrics.plain
						.split('\n')
						.slice(0, Math.max(5, rows - 8))
						.map((line, i) => (
							<Text key={i} color={theme.colors.text}>
								{line || ' '}
							</Text>
						))}
				</Box>
			)}

			<Box marginTop={1}>
				<Text color={theme.colors.dim}>
					Press <Text color={theme.colors.text}>:q</Text> to quit,{' '}
					<Text color={theme.colors.text}>l</Text> or{' '}
					<Text color={theme.colors.text}>Esc</Text> to go back
				</Text>
			</Box>
		</Box>
	);
}
