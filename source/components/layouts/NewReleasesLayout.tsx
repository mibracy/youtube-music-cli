import {Box, Text, useInput} from 'ink';
import {throttleArrowKey} from '../../hooks/useKeyboard.tsx';
import {useState, useEffect} from 'react';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {usePlayer} from '../../hooks/usePlayer.ts';
import {getMusicService} from '../../services/youtube-music/api.ts';
import type {Release} from '../../types/youtube-music.types.ts';

interface Section {
	title: string;
	releases: Release[];
}

export default function NewReleasesLayout() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const {dispatch: playerDispatch} = usePlayer();
	const [sections, setSections] = useState<Section[]>([]);
	const [sectionIndex, setSectionIndex] = useState(0);
	const [releaseIndex, setReleaseIndex] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getMusicService()
			.getNewReleases()
			.then(results => {
				if (!cancelled) {
					setSections(results);
					setIsLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : 'Failed to load new releases',
					);
					setIsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const currentSection = sections[sectionIndex];
	const releases = currentSection?.releases ?? [];

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

		if (key.leftArrow || input === 'h') {
			setSectionIndex(i => Math.max(0, i - 1));
			setReleaseIndex(0);
		} else if (key.rightArrow || input === 'l') {
			setSectionIndex(i => Math.min(sections.length - 1, i + 1));
			setReleaseIndex(0);
		} else if (key.upArrow || input === 'k') {
			setReleaseIndex(i => Math.max(0, i - 1));
		} else if (key.downArrow || input === 'j') {
			setReleaseIndex(i => Math.min(releases.length - 1, i + 1));
		} else if (key.return) {
			const release = releases[releaseIndex];
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
							setError('No tracks found in release');
						}
					})
					.catch((err: unknown) => {
						setIsLoading(false);
						setError(
							err instanceof Error
								? err.message
								: 'Failed to load release tracks',
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

			{isLoading ? (
				<Text color={theme.colors.dim}>Loading new releases...</Text>
			) : error ? (
				<Text color={theme.colors.error}>{error}</Text>
			) : sections.length === 0 ? (
				<Text color={theme.colors.dim}>No new releases found</Text>
			) : (
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

					{/* Release list */}
					{releases.map((release, index) => {
						const isSelected = index === releaseIndex;
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
					←/→ Sections | ↑/↓ Releases | Enter Play | Esc Back
				</Text>
			</Box>
		</Box>
	);
}
