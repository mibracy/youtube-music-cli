// Custom keybindings editor — shows all actions and their bound keys
import {Box, Text, useInput} from 'ink';
import {throttleArrowKey} from '../../hooks/useKeyboard.tsx';
import {useState} from 'react';
import {useTheme} from '../../hooks/useTheme.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {getConfigService} from '../../services/config/config.service.ts';
import {KEYBINDINGS} from '../../utils/constants.ts';

type BindingEntry = {
	action: string;
	label: string;
	keys: string[];
};

function buildEntries(): BindingEntry[] {
	const config = getConfigService();
	return Object.entries(KEYBINDINGS).map(([action, defaultKeys]) => {
		const custom = config.getKeybinding(action);
		return {
			action,
			label: action
				.toLowerCase()
				.replace(/_/g, ' ')
				.replace(/\b\w/g, c => c.toUpperCase()),
			keys: custom ?? ([...defaultKeys] as string[]),
		};
	});
}

export default function KeybindingsLayout() {
	const {theme} = useTheme();
	const {dispatch} = useNavigation();
	const [entries, setEntries] = useState<BindingEntry[]>(buildEntries);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isCapturing, setIsCapturing] = useState(false);
	const [statusMessage, setStatusMessage] = useState('');

	useInput((input, key) => {
		if (isCapturing) {
			// Build key string from the pressed key
			const parts: string[] = [];
			if (key.ctrl) parts.push('ctrl');
			if (key.meta) parts.push('meta');
			if (key.shift) parts.push('shift');

			let keyName = input;
			if (key.upArrow) keyName = 'up';
			else if (key.downArrow) keyName = 'down';
			else if (key.leftArrow) keyName = 'left';
			else if (key.rightArrow) keyName = 'right';
			else if (key.return) keyName = 'enter';
			else if (key.tab) keyName = 'tab';
			else if (key.backspace || key.delete) keyName = 'backspace';
			else if (key.escape) {
				setIsCapturing(false);
				setStatusMessage('Cancelled');
				return;
			}

			if (!keyName || keyName.length === 0) return;
			parts.push(keyName);
			const newKey = parts.join('+');

			// Persist new binding
			const entry = entries[selectedIndex];
			if (!entry) return;

			getConfigService().setKeybinding(entry.action, [newKey]);
			setEntries(buildEntries());
			setIsCapturing(false);
			setStatusMessage(`Bound ${entry.action} to "${newKey}"`);
			return;
		}

		if (key.escape) {
			dispatch({category: 'GO_BACK'});
			return;
		}

		if (
			(key.upArrow || input === 'k' || key.downArrow || input === 'j') &&
			throttleArrowKey()
		)
			return;

		if (key.upArrow || input === 'k') {
			setSelectedIndex(i => Math.max(0, i - 1));
		} else if (key.downArrow || input === 'j') {
			setSelectedIndex(i => Math.min(entries.length - 1, i + 1));
		} else if (key.return) {
			setIsCapturing(true);
			setStatusMessage('Press any key to bind...');
		} else if (input === 'r') {
			// Reset selected binding to default
			const entry = entries[selectedIndex];
			if (!entry) return;
			const defaultKeys = KEYBINDINGS[entry.action as keyof typeof KEYBINDINGS];
			if (defaultKeys) {
				getConfigService().setKeybinding(entry.action, [
					...defaultKeys,
				] as string[]);
				setEntries(buildEntries());
				setStatusMessage(`Reset ${entry.action} to default`);
			}
		}
	});

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0} padding={1}>
			<Box marginBottom={1}>
				<Text color={theme.colors.primary} bold>
					Custom Keybindings
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color={theme.colors.dim}>
					↑/↓ Navigate | Enter Edit | r Reset | Esc Back
				</Text>
			</Box>

			{statusMessage ? (
				<Box marginBottom={1}>
					<Text color={theme.colors.secondary}>{statusMessage}</Text>
				</Box>
			) : null}

			{entries.map((entry, index) => {
				const isSelected = index === selectedIndex;
				return (
					<Box key={entry.action} marginBottom={0}>
						<Text
							color={isSelected ? theme.colors.primary : theme.colors.text}
							bold={isSelected}
						>
							{isSelected ? '▶ ' : '  '}
						</Text>
						<Text
							color={isSelected ? theme.colors.primary : theme.colors.text}
							bold={isSelected}
						>
							{entry.label.padEnd(25)}
						</Text>
						<Text color={theme.colors.secondary}>{entry.keys.join(', ')}</Text>
					</Box>
				);
			})}

			{isCapturing ? (
				<Box
					marginTop={1}
					borderStyle="single"
					borderColor={theme.colors.secondary}
					padding={1}
				>
					<Text color={theme.colors.secondary} bold>
						Press any key combination...{' '}
					</Text>
					<Text color={theme.colors.dim}>(Esc to cancel)</Text>
				</Box>
			) : null}
		</Box>
	);
}
