import {useCallback} from 'react';
import {Box} from 'ink';
import PlayerControls from '../player/PlayerControls.tsx';
import NowPlaying from '../player/NowPlaying.tsx';
import LiveStreamsList from '../live-streams/LiveStreamsList.tsx';
import {useNavigation} from '../../hooks/useNavigation.ts';
import {useKeyBinding} from '../../hooks/useKeyboard.tsx';
import {KEYBINDINGS} from '../../utils/constants.ts';

export default function LiveStreamsLayout() {
	const {dispatch} = useNavigation();

	const goBack = useCallback(() => {
		dispatch({category: 'GO_BACK'});
	}, [dispatch]);

	useKeyBinding(KEYBINDINGS.BACK, goBack);

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0}>
			<NowPlaying />
			<PlayerControls />
			<LiveStreamsList />
		</Box>
	);
}
