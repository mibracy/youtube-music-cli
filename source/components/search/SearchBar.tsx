// Search bar component
import {useNavigation} from '../../hooks/useNavigation.ts';
import {useState, useCallback} from 'react';
import React from 'react';
import {SEARCH_TYPE} from '../../utils/constants.ts';
import {useTheme} from '../../hooks/useTheme.ts';
import {useKeyboardBlocker} from '../../hooks/useKeyboardBlocker.tsx';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {getConfigService} from '../../services/config/config.service.ts';

type Props = {
	onInput: (input: string) => void;
	isActive?: boolean;
};

function SearchBar({onInput, isActive = true}: Props) {
	const {theme} = useTheme();
	const {state: navState, dispatch} = useNavigation();
	const [input, setInput] = useState('');
	const config = getConfigService();

	const searchTypes = Object.values(SEARCH_TYPE);

	// Handle type switching
	const cycleType = useCallback(() => {
		const currentIndex = searchTypes.indexOf(navState.searchType);
		const nextIndex = (currentIndex + 1) % searchTypes.length;
		const nextType = searchTypes[nextIndex];
		if (nextType) {
			dispatch({
				category: 'SET_SEARCH_CATEGORY',
				searchType: nextType,
			});
			if (input) {
				onInput(input);
			}
		}
	}, [navState.searchType, searchTypes, dispatch, onInput, input]);

	// Handle submit via ink-text-input's onSubmit
	const handleSubmit = useCallback(
		(value: string) => {
			if (value && isActive) {
				config.addToSearchHistory(value);
				dispatch({category: 'SET_SEARCH_QUERY', query: value});
				onInput(value);
			}
		},
		[dispatch, onInput, isActive, config],
	);

	// Direct Tab handling for search type switching
	useInput((_input, key) => {
		if (key.tab) {
			cycleType();
		}
	});

	useKeyboardBlocker(isActive);

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor={theme.colors.secondary}
			paddingX={1}
		>
			{/* Search Type Toggle */}
			<Box>
				<Text color={theme.colors.dim}>Type: </Text>
				{searchTypes.map((type, index) => (
					<Text
						key={type}
						color={
							navState.searchType === type
								? theme.colors.primary
								: theme.colors.dim
						}
						bold={navState.searchType === type}
					>
						{type}
						{index < searchTypes.length - 1 && ' '}
					</Text>
				))}
				<Text color={theme.colors.dim}> (Tab to switch)</Text>
			</Box>

			{/* Input - using ink-text-input */}
			{isActive && (
				<Box>
					<Text color={theme.colors.primary}>Search: </Text>
					<TextInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						placeholder="Type to search..."
						focus={isActive}
					/>
				</Box>
			)}
			{!isActive && (
				<Box>
					<Text color={theme.colors.primary}>Search: </Text>
					<Text color={theme.colors.dim}>{input || 'Type to search...'}</Text>
				</Box>
			)}
		</Box>
	);
}

export default React.memo(SearchBar);
