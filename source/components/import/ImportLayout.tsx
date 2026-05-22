// Import layout component for playlist import
import {useState, useCallback, useEffect} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {KEYBINDINGS} from '../../utils/constants.ts';
import {getImportService} from '../../services/import/import.service.ts';
import type {ImportSource, ImportProgress} from '../../types/import.types.ts';
import ImportProgressComponent from './ImportProgress.tsx';

const SOURCES: Array<{key: ImportSource; label: string}> = [
	{key: 'spotify', label: 'Spotify'},
	{key: 'youtube', label: 'YouTube'},
];

export default function ImportLayout() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const importService = getImportService();

	const [step, setStep] = useState<
		'source' | 'url' | 'name' | 'importing' | 'result'
	>('source');
	const [selectedSource, setSelectedSource] = useState<number>(0);
	const [url, setUrl] = useState('');
	const [customName, setCustomName] = useState('');
	const [progress, setProgress] = useState<ImportProgress | null>(null);
	const [result, setResult] = useState<{
		playlistName: string;
		matched: number;
		total: number;
		errors: string[];
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	const goBack = useCallback(() => {
		if (step === 'source') {
			dispatch({category: 'GO_BACK'});
		} else if (step === 'url') {
			setStep('source');
		} else if (step === 'name') {
			setStep('url');
		} else if (step === 'result') {
			setStep('source');
			setResult(null);
		}
	}, [step, dispatch]);

	const selectSource = useCallback(() => {
		setStep('url');
	}, []);

	const submitUrl = useCallback(() => {
		if (url.trim()) {
			setStep('name');
		}
	}, [url]);

	const startImport = useCallback(async () => {
		setStep('importing');
		setError(null);

		try {
			const unsubscribe = importService.onProgress(prog => {
				setProgress(prog);
			});

			const source = SOURCES[selectedSource]!.key;
			const importResult = await importService.importPlaylist(
				source,
				url,
				customName || undefined,
			);

			unsubscribe();

			setResult({
				playlistName: importResult.playlistName,
				matched: importResult.matched,
				total: importResult.total,
				errors: importResult.errors,
			});
			setStep('result');
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setStep('source');
		}
	}, [selectedSource, url, customName, importService]);

	const submitName = useCallback(() => {
		startImport();
	}, [startImport]);

	// Keyboard bindings
	useKeyBinding(KEYBINDINGS.UP, () => {
		if (step === 'source') {
			setSelectedSource(prev => Math.max(0, prev - 1));
		}
	});

	useKeyBinding(KEYBINDINGS.DOWN, () => {
		if (step === 'source') {
			setSelectedSource(prev => Math.min(SOURCES.length - 1, prev + 1));
		}
	});

	useKeyBinding(KEYBINDINGS.SELECT, () => {
		if (step === 'source') selectSource();
		else if (step === 'url') submitUrl();
		else if (step === 'name') submitName();
		else if (step === 'result') goBack();
	});

	useKeyBinding(KEYBINDINGS.BACK, goBack);

	// Escape key for skip name
	useEffect(() => {
		if (step === 'name') {
			const handleEscape = () => {
				startImport();
			};

			const stdin = process.stdin;
			stdin.on('keypress', handleEscape);

			return () => {
				stdin.off('keypress', handleEscape);
			};
		}
		return undefined;
	}, [step, startImport]);

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0} gap={1} paddingX={1}>
			{/* Header */}
			<Box
				borderStyle="double"
				borderColor={theme.colors.secondary}
				paddingX={1}
				marginBottom={1}
			>
				<Text bold color={theme.colors.primary}>
					Import Playlist
				</Text>
			</Box>

			{/* Error display */}
			{error && (
				<Box paddingX={1}>
					<Text color={theme.colors.error}>Error: {error}</Text>
				</Box>
			)}

			{/* Step: Source selection */}
			{step === 'source' && (
				<Box flexDirection="column" gap={1}>
					<Text color={theme.colors.dim}>Select playlist source:</Text>
					{SOURCES.map((source, index) => (
						<Box key={source.key} paddingX={1}>
							<Text
								backgroundColor={
									index === selectedSource ? theme.colors.highlight : undefined
								}
								color={theme.colors.text}
								bold={index === selectedSource}
							>
								{index === selectedSource ? '► ' : '  '}
								{source.label}
							</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Step: URL input */}
			{step === 'url' && (
				<Box flexDirection="column" gap={1}>
					<Text color={theme.colors.dim}>
						Enter {SOURCES[selectedSource]!.label} playlist URL or ID:
					</Text>
					<Box paddingX={1}>
						<TextInput
							value={url}
							onChange={setUrl}
							onSubmit={submitUrl}
							placeholder="Paste URL or ID here..."
							focus
						/>
					</Box>
					<Text color={theme.colors.dim}>
						Examples:{' '}
						{SOURCES[selectedSource]!.key === 'spotify'
							? 'https://open.spotify.com/playlist/...'
							: 'https://www.youtube.com/playlist?list=...'}
					</Text>
				</Box>
			)}

			{/* Step: Custom name (optional) */}
			{step === 'name' && (
				<Box flexDirection="column" gap={1}>
					<Text color={theme.colors.dim}>
						Custom playlist name (optional, Esc to skip):
					</Text>
					<Box paddingX={1}>
						<TextInput
							value={customName}
							onChange={setCustomName}
							onSubmit={submitName}
							placeholder="Leave empty to use original name"
							focus
						/>
					</Box>
					<Text color={theme.colors.dim}>
						Press Enter to import or Esc to skip
					</Text>
				</Box>
			)}

			{/* Step: Importing */}
			{step === 'importing' && progress && (
				<ImportProgressComponent progress={progress} />
			)}

			{/* Step: Result */}
			{step === 'result' && result && (
				<Box flexDirection="column" gap={1}>
					<Box paddingX={1}>
						<Text color={theme.colors.success} bold>
							✓ Import completed!
						</Text>
					</Box>
					<Box paddingX={1}>
						<Text>Playlist: {result.playlistName}</Text>
					</Box>
					<Box paddingX={1}>
						<Text>
							Matched:{' '}
							<Text color={theme.colors.primary}>{result.matched}</Text>/
							{result.total} tracks
						</Text>
					</Box>
					{result.errors.length > 0 && (
						<Box flexDirection="column" gap={1} marginTop={1}>
							<Text color={theme.colors.dim} bold>
								Errors ({result.errors.length}):
							</Text>
							{result.errors.slice(0, 5).map((err, i) => (
								<Box key={i} paddingX={2}>
									<Text color={theme.colors.error}>• {err}</Text>
								</Box>
							))}
							{result.errors.length > 5 && (
								<Box paddingX={2}>
									<Text color={theme.colors.dim}>
										... and {result.errors.length - 5} more
									</Text>
								</Box>
							)}
						</Box>
					)}
					<Box marginTop={1} paddingX={1}>
						<Text color={theme.colors.dim}>Press Enter to continue</Text>
					</Box>
				</Box>
			)}

			{/* Help text */}
			{step !== 'importing' && step !== 'result' && (
				<Box marginTop={1}>
					<Text color={theme.colors.dim}>
						{step === 'source'
							? '↑↓ to select, Enter to continue, Esc/q to go back'
							: 'Enter to continue, Esc to go back'}
					</Text>
				</Box>
			)}
		</Box>
	);
}
