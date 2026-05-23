import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	type ReactNode,
	useCallback,
} from 'react';
import {getConfigService} from '../services/config/config.service.ts';
import type {Playlist, Track} from '../types/youtube-music.types.ts';
import {logger} from '../services/logger/logger.service.ts';

export type AddTrackResult = 'added' | 'duplicate';

type PlaylistState = Playlist[];

type PlaylistAction =
	| {category: 'SET_PLAYLISTS'; playlists: Playlist[]}
	| {category: 'CREATE_PLAYLIST'; playlist: Playlist}
	| {category: 'DELETE_PLAYLIST'; playlistId: string}
	| {category: 'RENAME_PLAYLIST'; playlistId: string; newName: string}
	| {category: 'ADD_TRACK'; playlistId: string; track: Track}
	| {category: 'REMOVE_TRACK'; playlistId: string; trackIndex: number};

function playlistReducer(
	state: PlaylistState,
	action: PlaylistAction,
): PlaylistState {
	switch (action.category) {
		case 'SET_PLAYLISTS':
			return action.playlists;
		case 'CREATE_PLAYLIST':
			return [...state, action.playlist];
		case 'DELETE_PLAYLIST':
			return state.filter(p => p.playlistId !== action.playlistId);
		case 'RENAME_PLAYLIST':
			return state.map(p =>
				p.playlistId === action.playlistId ? {...p, name: action.newName} : p,
			);
		case 'ADD_TRACK':
			return state.map(p =>
				p.playlistId === action.playlistId
					? {...p, tracks: [...p.tracks, action.track]}
					: p,
			);
		case 'REMOVE_TRACK':
			return state.map(p => {
				if (p.playlistId === action.playlistId) {
					const newTracks = [...p.tracks];
					newTracks.splice(action.trackIndex, 1);
					return {...p, tracks: newTracks};
				}
				return p;
			});
		default:
			return state;
	}
}

type PlaylistContextValue = {
	playlists: Playlist[];
	createPlaylist: (name: string, tracks?: Track[], id?: string) => Playlist;
	deletePlaylist: (playlistId: string) => void;
	renamePlaylist: (playlistId: string, newName: string) => void;
	addTrackToPlaylist: (
		playlistId: string,
		track: Track,
		force?: boolean,
	) => AddTrackResult;
	removeTrackFromPlaylist: (playlistId: string, trackIndex: number) => void;
};

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({children}: {children: ReactNode}) {
	const configService = getConfigService();
	const [state, dispatch] = useReducer(playlistReducer, [], () => {
		return configService.get('playlists') || [];
	});

	// Sync state changes to config service
	useEffect(() => {
		configService.set('playlists', state);
	}, [state, configService]);

	const createPlaylist = useCallback(
		(name: string, tracks: Track[] = [], id?: string) => {
			const existing = state.find(
				p => p.playlistId === id || (p.name === name && id === undefined),
			);

			if (existing) {
				logger.debug('PlaylistStore', 'Using existing playlist', {name, id});
				return existing;
			}

			const newPlaylist: Playlist = {
				playlistId: id ?? Date.now().toString(),
				name,
				tracks: tracks.map(track => ({...track})),
			};

			logger.info('PlaylistStore', 'Created new playlist', {name, id});
			dispatch({category: 'CREATE_PLAYLIST', playlist: newPlaylist});
			return newPlaylist;
		},
		[state],
	);

	const deletePlaylist = useCallback((playlistId: string) => {
		logger.info('PlaylistStore', 'Deleting playlist', {playlistId});
		dispatch({category: 'DELETE_PLAYLIST', playlistId});
	}, []);

	const renamePlaylist = useCallback((playlistId: string, newName: string) => {
		logger.info('PlaylistStore', 'Renaming playlist', {playlistId, newName});
		dispatch({category: 'RENAME_PLAYLIST', playlistId, newName});
	}, []);

	const addTrackToPlaylist = useCallback(
		(playlistId: string, track: Track, force = false): AddTrackResult => {
			const playlist = state.find(p => p.playlistId === playlistId);
			if (!playlist) return 'added';

			const isDuplicate = playlist.tracks.some(
				t => t.videoId === track.videoId,
			);
			if (isDuplicate && !force) {
				return 'duplicate';
			}

			logger.debug('PlaylistStore', 'Adding track to playlist', {
				playlistId,
				trackTitle: track.title,
			});
			dispatch({category: 'ADD_TRACK', playlistId, track});
			return 'added';
		},
		[state],
	);

	const removeTrackFromPlaylist = useCallback(
		(playlistId: string, trackIndex: number) => {
			logger.debug('PlaylistStore', 'Removing track from playlist', {
				playlistId,
				trackIndex,
			});
			dispatch({category: 'REMOVE_TRACK', playlistId, trackIndex});
		},
		[],
	);

	const value = useMemo(
		() => ({
			playlists: state,
			createPlaylist,
			deletePlaylist,
			renamePlaylist,
			addTrackToPlaylist,
			removeTrackFromPlaylist,
		}),
		[
			state,
			createPlaylist,
			deletePlaylist,
			renamePlaylist,
			addTrackToPlaylist,
			removeTrackFromPlaylist,
		],
	);

	return (
		<PlaylistContext.Provider value={value}>
			{children}
		</PlaylistContext.Provider>
	);
}

export function usePlaylist(): PlaylistContextValue {
	const context = useContext(PlaylistContext);

	if (!context) {
		throw new Error('usePlaylist must be used within PlaylistProvider');
	}

	return context;
}
