import {Box, Text, useInput} from 'ink';
import {throttleArrowKey} from '../../hooks/useKeyboard.tsx';
import {useState, useEffect} from 'react';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {getMusicService} from '../../services/youtube-music/api.ts';
import type {Genre, Release} from '../../types/youtube-music.types.ts';

interface GenreSection {
	title: string;
	genres: Genre[];
}

export default function GenresLayout() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const {dispatch: playerDispatch} = usePlayer();
	const [sections, setSections] = useState<GenreSection[]>([]);
	const [sectionIndex, setSectionIndex] = useState(0);
	const [genreIndex, setGenreIndex] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Detail view state
	const [viewMode, setViewMode] = useState<'genres' | 'playlists'>('genres');
	const [playlists, setPlaylists] = useState<Release[]>([]);
	const [playlistIndex, setPlaylistIndex] = useState(0);
	const [activeGenreTitle, setActiveGenreTitle] = useState('');

	useEffect(() => {
		let cancelled = false;
		getMusicService()
			.getGenres()
			.then(results => {
				if (!cancelled) {
					setSections(results);
					setIsLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : 'Failed to load genres',
					);
					setIsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const loadPlaylistsForGenre = async (genre: Genre) => {
		setIsLoading(true);
		setError(null);
		try {
			const results = await getMusicService().getGenrePlaylists(
				genre.browseId,
				genre.params,
			);
			setPlaylists(results);
			setPlaylistIndex(0);
			setActiveGenreTitle(genre.title);
			setViewMode('playlists');
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to load playlists');
		} finally {
			setIsLoading(false);
		}
	};

	const currentSection = sections[sectionIndex];
	const genres = currentSection?.genres ?? [];

	useInput((input, key) => {
		if (key.escape) {
			if (viewMode === 'playlists') {
				setViewMode('genres');
				setPlaylists([]);
			} else {
				dispatch({category: 'GO_BACK'});
			}
			return;
		}

		if (
			(key.upArrow || input === 'k' || key.downArrow || input === 'j') &&
			throttleArrowKey()
		)
			return;

		if (viewMode === 'genres') {
			if (key.leftArrow || input === 'h') {
				setSectionIndex(i => Math.max(0, i - 1));
				setGenreIndex(0);
			} else if (key.rightArrow || input === 'l') {
				setSectionIndex(i => Math.min(sections.length - 1, i + 1));
				setGenreIndex(0);
			} else if (key.upArrow || input === 'k') {
				setGenreIndex(i => Math.max(0, i - 1));
			} else if (key.downArrow || input === 'j') {
				setGenreIndex(i => Math.min(genres.length - 1, i + 1));
			} else if (key.return) {
				const genre = genres[genreIndex];
				if (genre) void loadPlaylistsForGenre(genre);
			}
		} else if (viewMode === 'playlists') {
			if (key.upArrow || input === 'k') {
				setPlaylistIndex(i => Math.max(0, i - 1));
			} else if (key.downArrow || input === 'j') {
				setPlaylistIndex(i => Math.min(playlists.length - 1, i + 1));
			} else if (key.return) {
				const release = playlists[playlistIndex];
				if (release?.browseId) {
					setIsLoading(true);
					getMusicService()
						.getReleaseTracks(release.browseId)
						.then(tracks => {
							setIsLoading(false);
							if (tracks.length > 0) {
								playerDispatch({category: 'CLEAR_QUEUE'});
								playerDispatch({category: 'SET_QUEUE', queue: tracks});
								playerDispatch({category: 'PLAY', track: tracks[0]!});
							} else {
								setError('No tracks found in playlist');
							}
						})
						.catch((err: unknown) => {
							setIsLoading(false);
							setError(
								err instanceof Error
									? err.message
									: 'Failed to load playlist tracks',
							);
						});
				}
			}
		}
	});

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0} padding={1}>
			<Box marginBottom={1}>
				<Text color={theme.colors.primary} bold>
					{viewMode === 'genres'
						? '🎭 Moods & Genres'
						: `🎭 ${activeGenreTitle} Playlists`}
				</Text>
			</Box>

			{isLoading ? (
				<Text color={theme.colors.dim}>Loading...</Text>
			) : error ? (
				<Text color={theme.colors.error}>{error}</Text>
			) : viewMode === 'genres' && sections.length === 0 ? (
				<Text color={theme.colors.dim}>No genres found</Text>
			) : viewMode === 'playlists' && playlists.length === 0 ? (
				<Text color={theme.colors.dim}>No playlists found for this genre</Text>
			) : viewMode === 'genres' ? (
				<>
					{/* Section tabs */}
					<Box marginBottom={1} gap={2}>
						{sections.map((section, index) => (
							<Text
								key={section.title + String(index)}
								color={
									index === sectionIndex
										? theme.colors.primary
										: theme.colors.dim
								}
								bold={index === sectionIndex}
								underline={index === sectionIndex}
							>
								{section.title}
							</Text>
						))}
					</Box>

					{/* Genre list */}
					{genres.map((genre, index) => {
						const isSelected = index === genreIndex;
						return (
							<Box key={genre.browseId + String(index)}>
								<Text
									color={isSelected ? theme.colors.primary : theme.colors.dim}
								>
									{isSelected ? '▶ ' : `${String(index + 1).padStart(2)}. `}
								</Text>
								<Text
									color={isSelected ? theme.colors.primary : theme.colors.text}
									bold={isSelected}
								>
									{genre.title}
								</Text>
							</Box>
						);
					})}
				</>
			) : (
				<>
					{/* Playlists list */}
					{playlists.map((release, index) => {
						const isSelected = index === playlistIndex;
						return (
							<Box key={release.browseId + String(index)}>
								<Text
									color={isSelected ? theme.colors.primary : theme.colors.dim}
								>
									{isSelected ? '▶ ' : `${String(index + 1).padStart(2)}. `}
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
				</>
			)}

			<Box marginTop={1}>
				<Text color={theme.colors.dim}>
					{viewMode === 'genres'
						? '←/→ Sections | ↑/↓ Genres | Enter Open | Esc Back'
						: '↑/↓ Playlists | Enter Play | Esc Back'}
				</Text>
			</Box>
		</Box>
	);
}
