import {Box, Text, useInput} from 'ink';
import {throttleArrowKey} from '../../hooks/useKeyboard.tsx';
import {useState, useEffect} from 'react';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {getMusicService} from '../../services/youtube-music/api.ts';
import type {Genre, Release} from '../../types/youtube-music.types.ts';

export default function NewReleasesLayout() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const {dispatch: playerDispatch} = usePlayer();

	const [sections, setSections] = useState<
		Array<{title: string; releases: Release[]}>
	>([]);
	const [genres, setGenres] = useState<Genre[]>([]);
	const [genreIndex, setGenreIndex] = useState(0);
	const [genreReleases, setGenreReleases] = useState<Release[]>([]);
	const [releaseIndex, setReleaseIndex] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void Promise.all([
			getMusicService().getNewReleases(),
			getMusicService().getGenres(),
		])
			.then(([releaseSections, genreSections]) => {
				if (cancelled) return;

				setSections(releaseSections);

				const allGenres: Genre[] = [];
				const seen = new Set<string>();
				for (const section of genreSections) {
					for (const genre of section.genres) {
						if (!seen.has(genre.title)) {
							seen.add(genre.title);
							allGenres.push(genre);
						}
					}
				}

				setGenres(allGenres);
				setIsLoading(false);
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Failed to load');
					setIsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!(genreIndex > 0) || !genres[genreIndex - 1]) {
			return;
		}

		let cancelled = false;
		const genre = genres[genreIndex - 1]!;
		void getMusicService()
			.getGenrePlaylists(genre.browseId, genre.params)
			.then(results => {
				if (!cancelled) {
					setGenreReleases(results);
					setIsLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Failed to load genre');
					setIsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [genreIndex, genres]);

	const VISIBLE_COUNT = 42;

	const currentReleases =
		genreIndex === 0 ? sections.flatMap(s => s.releases) : genreReleases;

	const halfWindow = Math.floor(VISIBLE_COUNT / 2);
	const sliceStart = Math.max(
		0,
		Math.min(
			releaseIndex - halfWindow,
			Math.max(0, currentReleases.length - VISIBLE_COUNT),
		),
	);
	const windowedReleases = currentReleases.slice(
		sliceStart,
		sliceStart + VISIBLE_COUNT,
	);
	const hasMoreAbove = sliceStart > 0;
	const hasMoreBelow = sliceStart + VISIBLE_COUNT < currentReleases.length;

	const allLabels = ['All', ...genres.map(g => g.title)];

	useInput((input, key) => {
		if (key.escape) {
			dispatch({category: 'GO_BACK'});
			return;
		}

		if (
			(key.upArrow || input === 'k' || key.downArrow || input === 'j') &&
			throttleArrowKey()
		)
			return;

		if (key.tab && key.shift) {
			setGenreIndex(i => Math.max(0, i - 1));
			setReleaseIndex(0);
		} else if (key.tab && !key.shift) {
			setGenreIndex(i => Math.min(allLabels.length - 1, i + 1));
			setReleaseIndex(0);
		} else if (key.upArrow || input === 'k') {
			setReleaseIndex(i => Math.max(0, i - 1));
		} else if (key.downArrow || input === 'j') {
			setReleaseIndex(i => Math.min(currentReleases.length - 1, i + 1));
		} else if (key.return) {
			const release = currentReleases[releaseIndex];
			if (release?.browseId) {
				setIsLoading(true);
				void getMusicService()
					.getReleaseTracks(release.browseId)
					.then(tracks => {
						setIsLoading(false);
						if (tracks.length > 0) {
							playerDispatch({category: 'CLEAR_QUEUE'});
							playerDispatch({
								category: 'SET_QUEUE',
								queue: tracks,
							});
							playerDispatch({
								category: 'PLAY',
								track: tracks[0]!,
							});
						} else {
							setError('No tracks found in release');
						}
					})
					.catch((err: unknown) => {
						setIsLoading(false);
						setError(
							err instanceof Error ? err.message : 'Failed to load tracks',
						);
					});
			}
		}
	});

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0} padding={1}>
			<Box marginBottom={1}>
				<Text color={theme.colors.primary} bold>
					🌟 New Releases
				</Text>
			</Box>

			<Box marginBottom={1} flexWrap="wrap">
				<Text>
					{allLabels.map((label, i) => (
						<Text
							key={label}
							color={i === genreIndex ? theme.colors.primary : theme.colors.dim}
							bold={i === genreIndex}
							underline={i === genreIndex}
						>
							{i > 0 ? ' · ' : ''}
							{label}
						</Text>
					))}
				</Text>
			</Box>

			{isLoading ? (
				<Text color={theme.colors.dim}>Loading...</Text>
			) : error ? (
				<Text color={theme.colors.error}>{error}</Text>
			) : currentReleases.length === 0 ? (
				<Text color={theme.colors.dim}>No releases found</Text>
			) : (
				<Box flexDirection="column">
					{hasMoreAbove && <Text color={theme.colors.dim}>··</Text>}
					{windowedReleases.map((release, i) => {
						const absoluteIndex = sliceStart + i;
						const isSelected = absoluteIndex === releaseIndex;
						return (
							<Box key={release.browseId + String(absoluteIndex)}>
								<Text
									color={isSelected ? theme.colors.primary : theme.colors.dim}
								>
									{isSelected
										? '▶ '
										: `${String(absoluteIndex + 1).padStart(2)}. `}
								</Text>
								<Text
									color={isSelected ? theme.colors.primary : theme.colors.text}
									bold={isSelected}
								>
									{release.title}
								</Text>
								<Text color={theme.colors.dim}> — {release.artist}</Text>
							</Box>
						);
					})}
					{hasMoreBelow && <Text color={theme.colors.dim}>··</Text>}
				</Box>
			)}

			<Box marginTop={1}>
				<Text color={theme.colors.dim}>
					Tab/Shift+Tab Genres | ↑/↓ Releases | Enter Play | Esc Back
				</Text>
			</Box>
		</Box>
	);
}
