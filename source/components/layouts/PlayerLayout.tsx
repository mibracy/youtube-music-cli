import {usePlayer} from '../../hooks/usePlayer.ts';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {KEYBINDINGS} from '../../utils/constants.ts';
import NowPlaying from '../player/NowPlaying.tsx';
import PlayerControls from '../player/PlayerControls.tsx';
import QueueList from '../player/QueueList.tsx';
import {Box} from 'ink';

export default function PlayerLayout() {
	const {state: playerState} = usePlayer();
	const {dispatch} = useNavigation();

	useKeyBinding(KEYBINDINGS.BACK, () => {
		dispatch({category: 'GO_BACK'});
	});

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0}>
			<NowPlaying />
			<PlayerControls />
			{playerState.queue.length > 0 && <QueueList />}
		</Box>
	);
}
