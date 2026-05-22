// YouTube Music API wrapper service
import type {
	Track,
	Album,
	Artist,
	Playlist,
	Genre,
	Release,
	SearchOptions,
	SearchResponse,
	SearchResult,
} from '../../types/youtube-music.types.ts';
import type {
	VideoSearchResult,
	ChannelSearchResult,
	SearchResponse as YoutubeiSearchResponse,
} from '../../types/youtubei.types.ts';
import {Innertube, Log} from 'youtubei.js';
import {logger} from '../logger/logger.service.ts';
import {getSearchCache} from '../cache/cache.service.ts';

// Initialize YouTube client
let ytClient: Innertube | null = null;

type MusicSearchItem = {
	id?: string;
	item_type?: string;
	title?: string;
	name?: string;
	duration?: {seconds?: number} | number;
	artists?: Array<{name?: string; channel_id?: string; id?: string}>;
	author?: {name?: string; channel_id?: string; id?: string};
};

type MusicSearchLike = {
	songs?: {contents?: unknown[]};
	videos?: {contents?: unknown[]};
	albums?: {contents?: unknown[]};
	artists?: {contents?: unknown[]};
	playlists?: {contents?: unknown[]};
	contents?: unknown[];
};

function toMusicSearchType(
	searchType: SearchOptions['type'] | undefined,
): 'all' | 'song' | 'album' | 'artist' | 'playlist' {
	switch (searchType) {
		case 'songs': {
			return 'song';
		}

		case 'albums': {
			return 'album';
		}

		case 'artists': {
			return 'artist';
		}

		case 'playlists': {
			return 'playlist';
		}

		default: {
			return 'all';
		}
	}
}

function getMusicShelfItems(shelf: unknown): MusicSearchItem[] {
	if (!shelf || typeof shelf !== 'object') {
		return [];
	}

	const contents = (shelf as {contents?: unknown[]}).contents;
	if (!Array.isArray(contents)) {
		return [];
	}

	return contents.filter(
		(item): item is MusicSearchItem => !!item && typeof item === 'object',
	);
}

function parseVideoId(value: string): string | null {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	if (!trimmedValue.includes('://') && !trimmedValue.includes('/')) {
		return trimmedValue;
	}

	try {
		const parsedUrl = new URL(trimmedValue);
		const vParam = parsedUrl.searchParams.get('v');
		if (vParam) {
			return vParam;
		}

		const host = parsedUrl.hostname.toLowerCase();
		const isYouTubeHost =
			host === 'youtu.be' ||
			host === 'youtube.com' ||
			host.endsWith('.youtube.com') ||
			host === 'music.youtube.com';
		if (!isYouTubeHost) {
			return null;
		}

		if (host === 'youtu.be') {
			const pathId = parsedUrl.pathname.split('/').filter(Boolean)[0];
			if (pathId) {
				return pathId;
			}
		}

		const pathId = parsedUrl.pathname
			.split('/')
			.filter(Boolean)
			.find(part => part.length >= 8);
		return pathId ?? null;
	} catch {
		return null;
	}
}

function toTrack(item: MusicSearchItem): Track | null {
	const rawId = item.id?.trim() ?? '';
	const videoId = rawId ? parseVideoId(rawId) : null;
	if (!videoId) {
		return null;
	}

	const artists =
		item.artists && item.artists.length > 0
			? item.artists.map(artist => ({
					artistId: artist.channel_id || artist.id || '',
					name: artist.name ?? 'Unknown',
				}))
			: [
					{
						artistId: item.author?.channel_id || item.author?.id || '',
						name: item.author?.name ?? 'Unknown',
					},
				];

	return {
		videoId,
		title: item.title || item.name || 'Unknown',
		artists,
		duration:
			typeof item.duration === 'number'
				? item.duration
				: (item.duration?.seconds ?? 0),
	};
}

async function getClient() {
	if (!ytClient) {
		// Suppress noisy youtubei.js parser warnings in TUI output.
		Log.setLevel(Log.Level.ERROR);
		ytClient = await Innertube.create();
	}
	return ytClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getItemId(item: any): string {
	if (typeof item.id === 'string' && item.id.trim()) {
		return item.id.trim();
	}
	if (typeof item.playlistId === 'string' && item.playlistId.trim()) {
		return item.playlistId.trim();
	}
	if (typeof item.videoId === 'string' && item.videoId.trim()) {
		return item.videoId.trim();
	}
	if (typeof item.content_id === 'string' && item.content_id.trim()) {
		return item.content_id.trim();
	}

	// Check endpoints
	const endpoint = item.endpoint || item.navigationEndpoint;
	if (endpoint?.payload) {
		if (
			typeof endpoint.payload.playlistId === 'string' &&
			endpoint.payload.playlistId.trim()
		) {
			return endpoint.payload.playlistId.trim();
		}
		if (
			typeof endpoint.payload.videoId === 'string' &&
			endpoint.payload.videoId.trim()
		) {
			return endpoint.payload.videoId.trim();
		}
		if (
			typeof endpoint.payload.browseId === 'string' &&
			endpoint.payload.browseId.trim()
		) {
			return endpoint.payload.browseId.trim();
		}
	}

	return '';
}

function getItemTitle(item: MusicSearchItem): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyItem = item as any;

	// Handle LockupView (used in general search)
	if (anyItem.type === 'LockupView' && anyItem.metadata?.title?.text) {
		return anyItem.metadata.title.text;
	}

	const title = item.title || item.name;
	if (title && typeof title === 'string') {
		return title;
	}

	// Try to get title from youtubei.js object if it has a toString or text property
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const titleObj = title as any;
	if (titleObj && typeof titleObj === 'object') {
		if (typeof titleObj.text === 'string') {
			return titleObj.text;
		}
		if (
			typeof titleObj.toString === 'function' &&
			titleObj.toString() !== '[object Object]'
		) {
			return titleObj.toString();
		}
	}

	// Some youtubei.js renderers have runs
	if (anyItem.title?.runs?.[0]?.text) {
		return anyItem.title.runs[0].text;
	}

	const flexColumns = (item as Record<string, unknown>).flex_columns as
		| Array<{title?: {text?: string}; runs?: Array<{text?: string}>}>
		| undefined;

	if (flexColumns && flexColumns.length > 0) {
		for (const column of flexColumns) {
			if (column.title?.text) {
				return column.title.text;
			}
			if (column.runs && column.runs.length > 0 && column.runs[0]?.text) {
				return column.runs[0].text;
			}
		}
	}

	// Fallback for some specific renderer types
	if (anyItem.text?.runs?.[0]?.text) {
		return anyItem.text.runs[0].text;
	}

	// Last ditch effort: search for any 'text' property
	if (anyItem.text && typeof anyItem.text === 'string') {
		return anyItem.text;
	}

	return '';
}

class MusicService {
	private readonly searchCache = getSearchCache();

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResponse> {
		const searchType = options.type || 'all';
		const resultLimit = options.limit ?? 20;
		const cacheKey = `search:${searchType}:${resultLimit}:${query}`;

		// Return cached result if available
		const cached = this.searchCache.get(cacheKey) as SearchResponse | null;
		if (cached) {
			logger.debug('MusicService', 'Returning cached search results', {
				query,
				resultCount: cached.results.length,
			});
			return cached;
		}

		const results: SearchResult[] = [];

		try {
			const yt = await getClient();
			const musicSearch = (await yt.music.search(query, {
				type: toMusicSearchType(searchType),
			})) as unknown as MusicSearchLike;

			// Gather items from all possible sections/shelves
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const allShelves: any[] = [];
			if (musicSearch.contents) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				allShelves.push(...(musicSearch as any).contents);
			}
			// Named shelves as well (compatibility)
			if (musicSearch.songs) allShelves.push(musicSearch.songs);
			if (musicSearch.videos) allShelves.push(musicSearch.videos);
			if (musicSearch.playlists) allShelves.push(musicSearch.playlists);
			if (musicSearch.artists) allShelves.push(musicSearch.artists);
			if (musicSearch.albums) allShelves.push(musicSearch.albums);

			for (const shelf of allShelves) {
				const shelfItems = getMusicShelfItems(shelf);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const shelfTitle = (shelf as any).title?.toString().toLowerCase() || '';

				for (const item of shelfItems) {
					const id = getItemId(item);
					if (!id) continue;

					const title = getItemTitle(item);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const anyItem = item as any;

					// Determine type
					let type: SearchResult['type'] | null = null;

					// Explicit item_type from API
					if (
						anyItem.item_type === 'song' ||
						(anyItem.type === 'MusicResponsiveListItem' &&
							(anyItem.videoId || anyItem.video_id))
					) {
						type = 'song';
					} else if (
						anyItem.item_type === 'playlist' ||
						id.startsWith('VL') ||
						id.startsWith('PL')
					) {
						type = 'playlist';
					} else if (
						anyItem.item_type === 'artist' ||
						(anyItem.subscribers && !anyItem.song_count)
					) {
						type = 'artist';
					} else if (
						anyItem.item_type === 'album' ||
						anyItem.year ||
						anyItem.song_count
					) {
						type = 'album';
					}

					// Infer from shelf title if still unknown
					if (!type) {
						if (shelfTitle.includes('song') || shelfTitle.includes('video'))
							type = 'song';
						else if (shelfTitle.includes('playlist')) type = 'playlist';
						else if (shelfTitle.includes('artist')) type = 'artist';
						else if (shelfTitle.includes('album')) type = 'album';
					}

					if (!type && searchType !== 'all') {
						type = toMusicSearchType(searchType) as SearchResult['type'];
					}

					if (
						type === 'song' &&
						(searchType === 'all' || searchType === 'songs')
					) {
						const track = toTrack(item);
						if (track) results.push({type: 'song', data: track});
					} else if (
						type === 'playlist' &&
						(searchType === 'all' || searchType === 'playlists')
					) {
						results.push({
							type: 'playlist',
							data: {
								playlistId: id,
								name: title || 'Unknown Playlist',
								tracks: [],
							},
						});
					} else if (
						type === 'artist' &&
						(searchType === 'all' || searchType === 'artists')
					) {
						results.push({
							type: 'artist',
							data: {
								artistId: id,
								name: title || anyItem.author?.name || 'Unknown Artist',
							},
						});
					} else if (
						type === 'album' &&
						(searchType === 'all' || searchType === 'albums')
					) {
						results.push({
							type: 'album',
							data: {
								albumId: id,
								name: title || 'Unknown Album',
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								artists: (anyItem.artists ?? []).map((artist: any) => ({
									artistId: artist.channel_id || artist.id || '',
									name: artist.name ?? 'Unknown',
								})),
								tracks: [],
							},
						});
					}
				}
			}

			if (results.length === 0) {
				const search = (await yt.search(
					query,
				)) as unknown as YoutubeiSearchResponse;

				if (searchType === 'all' || searchType === 'songs') {
					const videos = search.videos as VideoSearchResult[] | undefined;
					if (videos) {
						for (const video of videos) {
							const id = getItemId(video);
							if (!id) continue;

							results.push({
								type: 'song',
								data: {
									videoId: id,
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									title: getItemTitle(video as any) || 'Unknown',
									artists: [
										{
											artistId: video.channel_id || video.channel?.id || '',
											name:
												(typeof video.author === 'string'
													? video.author
													: video.author?.name) || 'Unknown',
										},
									],
									duration:
										(typeof video.duration === 'number'
											? video.duration
											: video.duration?.seconds) || 0,
								},
							});
						}
					}
				}

				if (searchType === 'all' || searchType === 'playlists') {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const playlists = (search as any).playlists;
					if (playlists) {
						for (const playlist of playlists) {
							const id = getItemId(playlist);
							if (!id) continue;

							results.push({
								type: 'playlist',
								data: {
									playlistId: id,
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									name: getItemTitle(playlist as any) || 'Unknown Playlist',
									tracks: [],
								},
							});
						}
					}
				}

				if (searchType === 'all' || searchType === 'artists') {
					const channels = search.channels as ChannelSearchResult[] | undefined;
					if (channels) {
						for (const channel of channels) {
							const id = getItemId(channel);
							if (!id) continue;

							results.push({
								type: 'artist',
								data: {
									artistId: id,
									name:
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										getItemTitle(channel as any) ||
										channel.name ||
										'Unknown Artist',
								},
							});
						}
					}
				}
			}
		} catch (error) {
			logger.error('MusicService', 'Search failed', {
				query,
				searchType,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// For 'all' search, guarantee variety while maintaining relevance (Weighted Variety)
		if (searchType === 'all' && results.length > 0) {
			const seenIds = new Set<string>();
			const uniqueResults: SearchResult[] = [];

			// First pass: Filter duplicates and organize by type
			const byType: Record<string, SearchResult[]> = {
				song: [],
				playlist: [],
				artist: [],
				album: [],
			};

			for (const r of results) {
				const id =
					r.type === 'song'
						? (r.data as Track).videoId
						: r.type === 'playlist'
							? (r.data as Playlist).playlistId
							: r.type === 'artist'
								? (r.data as Artist).artistId
								: (r.data as Album).albumId;

				const uniqueId = `${r.type}:${id}`;
				if (seenIds.has(uniqueId)) continue;
				seenIds.add(uniqueId);

				byType[r.type]?.push(r);
				uniqueResults.push(r);
			}

			const balanced: SearchResult[] = [];
			let remainingLimit = resultLimit;
			const typesToInclude = ['artist', 'album', 'playlist'];
			const includedFromTypes = new Set<string>();

			// 1. Ensure at least one from each non-song type if available
			for (const type of typesToInclude) {
				const items = byType[type];
				if (items && items.length > 0 && remainingLimit > 0) {
					balanced.push(items[0]!);
					includedFromTypes.add(`${type}:${0}`);
					remainingLimit--;
				}
			}

			// 2. Fill the rest with highest-ranked original results that aren't already included
			for (const r of uniqueResults) {
				if (remainingLimit <= 0) break;

				const type = r.type;
				const indexInType = byType[type]?.indexOf(r) ?? -1;
				const typeKey = `${type}:${indexInType}`;

				if (!includedFromTypes.has(typeKey)) {
					balanced.push(r);
					remainingLimit--;
				}
			}

			results.length = 0;
			results.push(...balanced);
		}

		const response: SearchResponse = {
			results: results.slice(0, resultLimit),
			hasMore: false,
		};

		// Cache the result
		this.searchCache.set(cacheKey, response as unknown);

		return response;
	}

	async getTrack(videoId: string): Promise<Track | null> {
		const normalizedVideoId = parseVideoId(videoId);
		if (!normalizedVideoId) {
			logger.warn('MusicService', 'Invalid track id/url provided', {videoId});
			return null;
		}

		return {
			videoId: normalizedVideoId,
			title: 'Unknown Track',
			artists: [],
		};
	}

	async getAlbum(albumId: string): Promise<Album> {
		try {
			const yt = await getClient();
			const albumData = await yt.music.getAlbum(albumId);
			logger.debug('MusicService', 'getAlbum data', {albumData});
			const tracks: Track[] = (albumData.contents || []).map((item: any) => ({
				videoId: item.video_id || item.id,
				title: item.title || 'Unknown Title',
				artists: (item.artists || []).map((a: any) => ({
					artistId: a.channel_id,
					name: a.name,
				})),
				duration:
					typeof item.duration === 'number'
						? item.duration
						: (item.duration?.seconds ?? 0),
			}));

			return {
				albumId,
				name: (albumData as any).title || 'Unknown Album',
				artists: ((albumData as any).artists || []).map((a: any) => ({
					artistId: a.channel_id,
					name: a.name,
				})),
				tracks,
			} as Album;
		} catch (error) {
			logger.error('MusicService', 'getAlbum failed', {
				albumId,
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				albumId,
				name: 'Unknown Album',
				artists: [],
				tracks: [],
			};
		}
	}

	async getArtist(artistId: string): Promise<Artist> {
		return {
			artistId,
			name: 'Unknown Artist',
		};
	}

	async getPlaylist(playlistId: string): Promise<Playlist> {
		try {
			const yt = await getClient();
			const playlistData = (await yt.music.getPlaylist(playlistId)) as {
				title?: string;
				name?: string;
				contents?: Array<{
					id?: string;
					video_id?: string;
					title?: string | {text?: string};
					artists?: Array<{name?: string; channel_id?: string; id?: string}>;
					duration?: number | {seconds?: number};
				}>;
				tracks?: Array<{
					id?: string;
					video_id?: string;
					title?: string | {text?: string};
					artists?: Array<{name?: string; channel_id?: string; id?: string}>;
					duration?: number | {seconds?: number};
				}>;
			};

			const rows = [
				...(playlistData.contents ?? []),
				...(playlistData.tracks ?? []),
			];
			const seen = new Set<string>();
			const tracks: Track[] = [];

			for (const row of rows) {
				const videoId = row.id || row.video_id;
				if (!videoId || seen.has(videoId)) continue;
				seen.add(videoId);
				tracks.push({
					videoId,
					title:
						(typeof row.title === 'string' ? row.title : row.title?.text) ??
						'Unknown',
					artists: (row.artists ?? []).map(artist => ({
						artistId: artist.channel_id || artist.id || '',
						name: artist.name ?? 'Unknown',
					})),
					duration:
						typeof row.duration === 'number'
							? row.duration
							: (row.duration?.seconds ?? 0),
				});
			}

			return {
				playlistId,
				name: playlistData.title || playlistData.name || 'Unknown Playlist',
				tracks,
			};
		} catch (error) {
			logger.error('MusicService', 'getPlaylist failed', {
				playlistId,
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				playlistId,
				name: 'Unknown Playlist',
				tracks: [],
			};
		}
	}

	async getTrending(): Promise<Track[]> {
		try {
			const yt = await getClient();
			const explore = (await yt.music.getExplore()) as unknown as {
				sections?: Array<{
					header?: {title?: {toString(): string} | string};
					contents?: Array<{
						type?: string;
						id?: string;
						video_id?: string;
						title?: string | {text?: string} | {toString(): string};
						subtitle?: {toString(): string};
						author?: string | {name?: string};
						duration?: number | {seconds?: number};
						artists?: Array<{name?: string; channel_id?: string; id?: string}>;
						authors?: Array<{name?: string; channel_id?: string; id?: string}>;
					}>;
				}>;
			};

			const trendingSection = explore.sections?.find(section => {
				const title = section.header?.title?.toString() || '';
				return title.toLowerCase().includes('trending');
			});

			if (!trendingSection || !trendingSection.contents) {
				return [];
			}

			const tracks: Track[] = [];
			for (const item of trendingSection.contents) {
				const videoId = item.id || item.video_id;
				if (!videoId) continue;

				// Parse artists/authors
				const artistsData = item.artists || item.authors || [];
				const artists =
					artistsData.length > 0
						? artistsData.map(a => ({
								artistId: a.channel_id || a.id || '',
								name: a.name || 'Unknown',
							}))
						: [
								{
									artistId: '',
									name: 'Unknown Artist',
								},
							];

				// Try to extract artist from subtitle/author if artists array is empty
				if (artists[0]?.name === 'Unknown Artist') {
					const subtitle = item.subtitle?.toString();
					if (subtitle) {
						// Subtitle format often "Artist • Album • Views • Duration"
						const parts = subtitle.split(' • ');
						if (parts.length > 0) {
							artists[0]!.name = parts[0]!;
						}
					} else if (item.author) {
						artists[0]!.name =
							(typeof item.author === 'string'
								? item.author
								: item.author?.name) || 'Unknown Artist';
					}
				}

				tracks.push({
					videoId,
					title: item.title?.toString() ?? 'Unknown',
					artists,
					duration:
						typeof item.duration === 'number'
							? item.duration
							: (item.duration?.seconds ?? 0),
				});
			}

			return tracks.slice(0, 25);
		} catch (error) {
			logger.error('MusicService', 'getTrending failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getExploreSections(): Promise<Array<{title: string; tracks: Track[]}>> {
		try {
			const yt = await getClient();
			const music = yt.music;
			const explore = (await music.getExplore()) as unknown as {
				sections?: Array<{
					header?: {title?: string | {text?: string}};
					contents?: Array<{
						id?: string;
						video_id?: string;
						title?: string | {text?: string};
						author?: string | {name?: string};
						duration?: number | {seconds?: number};
					}>;
				}>;
			};

			const result: Array<{title: string; tracks: Track[]}> = [];
			for (const section of explore.sections ?? []) {
				const title =
					(typeof section.header?.title === 'string'
						? section.header.title
						: section.header?.title?.text) ?? 'Featured';
				const tracks: Track[] = [];

				for (const item of section.contents ?? []) {
					const videoId = item.id || item.video_id;
					if (!videoId) continue;
					tracks.push({
						videoId,
						title:
							(typeof item.title === 'string'
								? item.title
								: item.title?.text) ?? 'Unknown',
						artists: [
							{
								artistId: '',
								name:
									(typeof item.author === 'string'
										? item.author
										: item.author?.name) ?? 'Unknown',
							},
						],
						duration:
							(typeof item.duration === 'number'
								? item.duration
								: item.duration?.seconds) ?? 0,
					});
				}

				if (tracks.length > 0) {
					result.push({title, tracks: tracks.slice(0, 10)});
				}
			}

			return result;
		} catch (error) {
			logger.error('MusicService', 'getExploreSections failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getSuggestions(trackId: string): Promise<Track[]> {
		try {
			const yt = await getClient();

			// Use music.getUpNext with automix — avoids the yt.getInfo() ParsingError
			// caused by YouTube "Remove ads" menu items that youtubei.js can't parse.
			const panel = await yt.music.getUpNext(trackId, true);

			const tracks: Track[] = [];

			for (const item of panel.contents) {
				const video = item as unknown as {
					video_id?: string;
					title?: string | {text?: string};
					artists?: Array<{name?: string; channel_id?: string}>;
					duration?: {seconds?: number};
				};

				const videoId = video.video_id;
				if (!videoId || videoId === trackId) continue;

				const title =
					typeof video.title === 'string'
						? video.title
						: (video.title?.text ?? '');
				if (!title) continue;

				tracks.push({
					videoId,
					title,
					artists: (video.artists ?? []).map(a => ({
						artistId: a.channel_id ?? '',
						name: a.name ?? 'Unknown',
					})),
					duration: video.duration?.seconds ?? 0,
				});
			}

			logger.debug('MusicService', 'getSuggestions success', {
				trackId,
				count: tracks.length,
			});

			return tracks.slice(0, 15);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.warn('MusicService', 'getSuggestions failed', {error: message});
			return [];
		}
	}

	async getGenres(): Promise<Array<{title: string; genres: Genre[]}>> {
		try {
			const yt = await getClient();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const response: any = await yt.actions.execute('/browse', {
				browseId: 'FEmusic_moods_and_genres',
				client: 'YTMUSIC',
			});

			const result: Array<{title: string; genres: Genre[]}> = [];

			const tabs =
				response.data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
			if (!tabs) return result;

			const contents =
				tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

			for (const section of contents) {
				const header =
					section.gridRenderer?.header?.gridHeaderRenderer?.title?.runs?.[0]
						?.text || 'Genres';
				const items = section.gridRenderer?.items || [];

				const genres: Genre[] = [];
				for (const item of items) {
					const btn = item.musicNavigationButtonRenderer;
					if (!btn) continue;

					const title = btn.buttonText?.runs?.[0]?.text;
					const browseId = btn.clickCommand?.browseEndpoint?.browseId;
					const params = btn.clickCommand?.browseEndpoint?.params;

					if (title && browseId) {
						genres.push({title, browseId, params});
					}
				}

				if (genres.length > 0) {
					result.push({title: header, genres});
				}
			}

			return result;
		} catch (error) {
			logger.error('MusicService', 'getGenres failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getNewReleases(): Promise<Array<{title: string; releases: Release[]}>> {
		try {
			const yt = await getClient();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const response: any = await yt.actions.execute('/browse', {
				browseId: 'FEmusic_new_releases',
				client: 'YTMUSIC',
			});

			const result: Array<{title: string; releases: Release[]}> = [];

			const tabs =
				response.data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
			if (!tabs) return result;

			const contents =
				tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

			for (const section of contents) {
				const header =
					section.musicCarouselShelfRenderer?.header
						?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text ||
					'New Releases';
				const items =
					section.musicCarouselShelfRenderer?.contents ||
					section.musicShelfRenderer?.contents ||
					section.gridRenderer?.items ||
					[];

				const releases: Release[] = [];
				for (const item of items) {
					const renderer = item.musicTwoRowItemRenderer;
					if (!renderer) continue;

					const titleRuns = renderer.title?.runs || [];
					const subtitleRuns = renderer.subtitle?.runs || [];

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const title = titleRuns.map((r: any) => r.text).join('');
					const browseId =
						renderer.navigationEndpoint?.browseEndpoint?.browseId;

					const artist =
						subtitleRuns
							.filter(
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								(r: any) => r.navigationEndpoint?.browseEndpoint?.browseId,
							)
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							.map((r: any) => r.text)
							.join(', ') ||
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						subtitleRuns.map((r: any) => r.text).join('') ||
						'Unknown Artist';
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const subtitleText = subtitleRuns.map((r: any) => r.text).join('');

					if (title && browseId) {
						releases.push({title, browseId, artist, subtitle: subtitleText});
					}
				}

				if (releases.length > 0) {
					result.push({title: header, releases});
				}
			}

			return result;
		} catch (error) {
			logger.error('MusicService', 'getNewReleases failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getGenrePlaylists(
		browseId: string,
		params?: string,
	): Promise<Release[]> {
		try {
			const yt = await getClient();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const payload: any = {browseId, client: 'YTMUSIC'};
			if (params) payload.params = params;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const response = (await yt.actions.execute('/browse', payload)) as any;
			const releases: Release[] = [];

			const contents =
				response.data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]
					?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

			for (const section of contents) {
				const items =
					section.musicCarouselShelfRenderer?.contents ||
					section.musicShelfRenderer?.contents ||
					section.gridRenderer?.items ||
					[];

				for (const item of items) {
					const renderer = item.musicTwoRowItemRenderer;
					if (!renderer) continue;

					const titleRuns = renderer.title?.runs || [];
					const subtitleRuns = renderer.subtitle?.runs || [];

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const title = titleRuns.map((r: any) => r.text).join('');
					const itemBrowseId =
						renderer.navigationEndpoint?.browseEndpoint?.browseId;

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const subtitleText = subtitleRuns.map((r: any) => r.text).join('');

					if (title && itemBrowseId) {
						releases.push({
							title,
							browseId: itemBrowseId,
							artist: subtitleText,
							subtitle: subtitleText,
						});
					}
				}
			}

			return releases;
		} catch (error) {
			logger.error('MusicService', 'getGenrePlaylists failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getReleaseTracks(browseId: string): Promise<Track[]> {
		try {
			const yt = await getClient();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let items: any[] = [];

			if (browseId.startsWith('MPREb')) {
				const album = await yt.music.getAlbum(browseId);
				items = album.contents || [];
			} else {
				const playlistId = browseId.replace(/^VL/, '');
				const playlist = await yt.music.getPlaylist(playlistId);
				items = playlist.items || [];
			}

			return (
				items
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					.map((item: any) => ({
						videoId: item.video_id || item.id,
						title: item.title || 'Unknown Title',
						artists:
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							item.artists?.map((a: any) => ({
								name: a.name,
								artistId: a.channel_id,
							})) || [],
					}))
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					.filter((t: any) => t.videoId)
			);
		} catch (error) {
			logger.error('MusicService', 'getReleaseTracks failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getStreamUrl(videoId: string): Promise<string> {
		logger.info('MusicService', 'Starting stream extraction', {videoId});
		const isBunRuntime =
			typeof (globalThis as {Bun?: unknown}).Bun !== 'undefined';

		// Try Method 1: @distube/ytdl-core (skip under Bun due undici incompatibility)
		if (isBunRuntime) {
			logger.warn(
				'MusicService',
				'Skipping ytdl-core extraction on Bun runtime',
				{videoId},
			);
		} else {
			try {
				logger.debug('MusicService', 'Attempting ytdl-core extraction', {
					videoId,
				});
				const ytdl = await import('@distube/ytdl-core');
				const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

				const info = await ytdl.default.getInfo(videoUrl);
				logger.debug('MusicService', 'ytdl-core getInfo succeeded', {
					formatCount: info.formats.length,
				});

				const audioFormats = ytdl.default.filterFormats(
					info.formats,
					'audioonly',
				);
				logger.debug('MusicService', 'ytdl-core audio formats filtered', {
					audioFormatCount: audioFormats.length,
				});

				if (audioFormats.length > 0) {
					// Get highest quality audio
					const bestAudio = audioFormats.sort((a, b) => {
						const aBitrate = Number.parseInt(String(a.audioBitrate || 0));
						const bBitrate = Number.parseInt(String(b.audioBitrate || 0));
						return bBitrate - aBitrate;
					})[0];

					if (bestAudio?.url) {
						logger.info('MusicService', 'Using ytdl-core stream', {
							bitrate: bestAudio.audioBitrate,
							urlLength: bestAudio.url.length,
							mimeType: bestAudio.mimeType,
						});
						return bestAudio.url;
					}
				}

				logger.warn(
					'MusicService',
					'ytdl-core: No audio formats with URL found',
				);
			} catch (error) {
				logger.error('MusicService', 'ytdl-core extraction failed', {
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
			}
		}

		// Try Method 2: youtube-ext (lightweight, no parser path)
		try {
			logger.debug('MusicService', 'Attempting youtube-ext extraction', {
				videoId,
			});
			const {videoInfo, getFormats} = await import('youtube-ext');
			const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
			const info = await videoInfo(videoUrl);
			logger.debug('MusicService', 'youtube-ext videoInfo succeeded');

			// Decode stream URLs first
			const decodedFormats = await getFormats(info.stream);
			logger.debug('MusicService', 'youtube-ext formats decoded', {
				formatCount: decodedFormats.length,
			});

			// Get best audio format from decoded adaptive formats
			const audioFormats = decodedFormats.filter(
				f => f.mimeType?.includes('audio') && f.url,
			);
			logger.debug('MusicService', 'youtube-ext audio formats filtered', {
				audioFormatCount: audioFormats.length,
			});

			if (audioFormats.length > 0) {
				// Sort by bitrate descending and get best quality
				const bestAudio = audioFormats.sort(
					(a, b) => (b.bitrate || 0) - (a.bitrate || 0),
				)[0];
				if (bestAudio?.url) {
					logger.info('MusicService', 'Using youtube-ext stream', {
						bitrate: bestAudio.bitrate,
						urlLength: bestAudio.url.length,
					});
					return bestAudio.url;
				}
			}

			logger.warn(
				'MusicService',
				'youtube-ext: No audio formats with URL found',
			);
		} catch (error) {
			logger.error('MusicService', 'youtube-ext extraction failed', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		// Try Method 3: Invidious API (last resort)
		try {
			logger.debug('MusicService', 'Attempting Invidious extraction', {
				videoId,
			});
			const url = await this.getInvidiousStreamUrl(videoId);
			logger.info('MusicService', 'Using Invidious stream', {
				urlLength: url.length,
			});
			return url;
		} catch (error) {
			logger.error('MusicService', 'Invidious extraction failed', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		// All methods failed
		logger.error('MusicService', 'All stream extraction methods failed', {
			videoId,
		});
		throw new Error('All stream extraction methods failed');
	}

	private async getInvidiousStreamUrl(videoId: string): Promise<string> {
		// Try multiple Invidious instances as fallback
		const instances = [
			'https://vid.puffyan.us',
			'https://invidious.perennialte.ch',
			'https://yewtu.be',
		];

		for (const instance of instances) {
			try {
				logger.debug('MusicService', 'Trying Invidious instance', {instance});
				const response = await fetch(`${instance}/api/v1/videos/${videoId}`);

				if (!response.ok) {
					logger.debug('MusicService', 'Invidious instance returned non-OK', {
						instance,
						status: response.status,
					});
					continue;
				}

				const videoData = (await response.json()) as {
					adaptiveFormats?: Array<{url?: string; type?: string}>;
					formatStreams?: Array<{url?: string; type?: string}>;
				};

				// Look for audio-only streams
				const audioFormats = [
					...(videoData.adaptiveFormats || []),
					...(videoData.formatStreams || []),
				].filter(f => f.type?.toLowerCase().includes('audio'));

				logger.debug('MusicService', 'Invidious audio formats found', {
					instance,
					count: audioFormats.length,
				});

				if (audioFormats.length > 0) {
					const firstAudio = audioFormats[0];
					if (firstAudio?.url) {
						logger.debug('MusicService', 'Invidious stream URL obtained', {
							instance,
							urlLength: firstAudio.url.length,
							type: firstAudio.type,
						});
						return firstAudio.url;
					}
				}
			} catch (error) {
				logger.debug('MusicService', 'Invidious instance error', {
					instance,
					error: error instanceof Error ? error.message : String(error),
				});
				// Try next instance
				continue;
			}
		}

		// If all Invidious instances fail, throw error instead of returning watch URL
		throw new Error('No Invidious instance returned a valid stream URL');
	}
}

// Singleton instance
let musicServiceInstance: MusicService | null = null;

export function getMusicService(): MusicService {
	if (!musicServiceInstance) {
		musicServiceInstance = new MusicService();
	}

	return musicServiceInstance;
}
