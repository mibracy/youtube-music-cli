import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {CONFIG_DIR} from '../../utils/constants.ts';
import {formatError} from '../../utils/error.ts';
import {logger} from '../logger/logger.service.ts';
import type {Track} from '../../types/youtube-music.types.ts';
import {getConfigService} from '../config/config.service.ts';

const FAVORITES_FILE = join(CONFIG_DIR, 'favorites.json');
const SCHEMA_VERSION = 1;

export interface PersistedFavorites {
	schemaVersion: number;
	tracks: Track[];
	lastUpdated: string;
}

const defaultFavorites: PersistedFavorites = {
	schemaVersion: SCHEMA_VERSION,
	tracks: [],
	lastUpdated: new Date().toISOString(),
};

let saveLock = Promise.resolve();
let favoritesFilePathOverride: string | null = null;

function getFavoritesFilePath(): string {
	return favoritesFilePathOverride ?? FAVORITES_FILE;
}

function trackFromLegacyId(videoId: string): Track {
	return {
		videoId,
		title: videoId,
		artists: [],
	};
}

async function migrateLegacyConfigFavoritesSafely(): Promise<Track[]> {
	const configService = getConfigService();
	const legacyIds = configService.getLegacyFavoriteIds();

	if (legacyIds.length === 0) {
		return [];
	}

	const existing = await loadFavoritesWithoutMigration();
	if (existing.length > 0) {
		logger.info(
			'FavoritesService',
			'Keeping existing favorites.json; skipping legacy config migration',
			{existingCount: existing.length, legacyCount: legacyIds.length},
		);
		return existing;
	}

	const tracks = legacyIds.map(trackFromLegacyId);
	logger.info('FavoritesService', 'Migrated legacy config favorites safely', {
		count: tracks.length,
	});
	await saveFavorites(tracks);
	return tracks;
}

async function loadFavoritesWithoutMigration(): Promise<Track[]> {
	const favoritesFile = getFavoritesFilePath();

	try {
		if (!existsSync(favoritesFile)) {
			logger.debug('FavoritesService', 'No favorites file found');
			return [];
		}

		const data = await readFile(favoritesFile, 'utf8');
		const persisted = JSON.parse(data) as PersistedFavorites;

		if (persisted.schemaVersion !== SCHEMA_VERSION) {
			logger.warn('FavoritesService', 'Schema version mismatch', {
				expected: SCHEMA_VERSION,
				found: persisted.schemaVersion,
			});
			return [];
		}

		if (!Array.isArray(persisted.tracks)) {
			logger.warn('FavoritesService', 'Invalid favorites format, resetting');
			return [];
		}

		logger.info('FavoritesService', 'Loaded favorites', {
			count: persisted.tracks.length,
			lastUpdated: persisted.lastUpdated,
		});

		return persisted.tracks;
	} catch (error) {
		logger.error('FavoritesService', 'Failed to load favorites', {
			error: formatError(error),
		});
		return [];
	}
}

export async function saveFavorites(tracks: Track[]): Promise<void> {
	const favoritesFile = getFavoritesFilePath();
	const currentLock = saveLock;
	let releaseLock: () => void = () => {};
	const newLock = new Promise<void>(resolve => {
		releaseLock = resolve;
	});
	saveLock = newLock;

	await currentLock.catch(() => {});

	try {
		if (!existsSync(CONFIG_DIR)) {
			await mkdir(CONFIG_DIR, {recursive: true});
		}

		const stateToSave: PersistedFavorites = {
			...defaultFavorites,
			tracks,
			lastUpdated: new Date().toISOString(),
		};

		const tempFile = `${favoritesFile}.tmp.${Date.now()}`;
		await writeFile(tempFile, JSON.stringify(stateToSave, null, 2), 'utf8');

		if (process.platform === 'win32' && existsSync(favoritesFile)) {
			await import('node:fs/promises').then(fs => fs.unlink(favoritesFile));
		}

		await import('node:fs/promises').then(fs =>
			fs.rename(tempFile, favoritesFile),
		);

		logger.debug('FavoritesService', 'Saved favorites', {
			count: tracks.length,
		});
	} catch (error) {
		logger.error('FavoritesService', 'Failed to save favorites', {
			error: formatError(error),
		});
	} finally {
		releaseLock();
	}
}

export async function loadFavorites(): Promise<Track[]> {
	const tracks = await loadFavoritesWithoutMigration();

	if (tracks.length === 0) {
		const migrated = await migrateLegacyConfigFavoritesSafely();
		if (migrated.length > 0) {
			return migrated;
		}
	}

	return tracks;
}

export class FavoritesManager {
	private tracks: Track[] = [];
	private loaded = false;
	private loadPromise: Promise<void> | null = null;

	async ensureLoaded(): Promise<void> {
		if (this.loaded) {
			return;
		}

		this.loadPromise ??= this.loadFromDisk();
		await this.loadPromise;
	}

	private async loadFromDisk(): Promise<void> {
		this.tracks = await loadFavorites();
		this.loaded = true;
	}

	getAllTracks(): Track[] {
		return [...this.tracks];
	}

	getRecentTracks(limit = 8): Track[] {
		return this.tracks.slice(0, limit);
	}

	isFavorite(videoId: string): boolean {
		return this.tracks.some(track => track.videoId === videoId);
	}

	async add(track: Track): Promise<void> {
		await this.ensureLoaded();
		if (this.isFavorite(track.videoId)) {
			return;
		}

		this.tracks = [track, ...this.tracks];
		await saveFavorites(this.tracks);
	}

	async remove(videoId: string): Promise<void> {
		await this.ensureLoaded();
		const next = this.tracks.filter(track => track.videoId !== videoId);
		if (next.length === this.tracks.length) {
			return;
		}

		this.tracks = next;
		await saveFavorites(this.tracks);
	}

	async toggle(track: Track): Promise<boolean> {
		await this.ensureLoaded();
		if (this.isFavorite(track.videoId)) {
			await this.remove(track.videoId);
			return false;
		}

		await this.add(track);
		return true;
	}

	randomOne(): Track | null {
		if (this.tracks.length === 0) {
			return null;
		}

		const index = Math.floor(Math.random() * this.tracks.length);
		return this.tracks[index] ?? null;
	}
}

let favoritesManagerInstance: FavoritesManager | null = null;

export function getFavoritesManager(): FavoritesManager {
	if (!favoritesManagerInstance) {
		favoritesManagerInstance = new FavoritesManager();
	}

	return favoritesManagerInstance;
}

export function resetFavoritesManagerForTests(): void {
	favoritesManagerInstance = null;
}

export function setFavoritesFilePathForTests(filePath: string | null): void {
	favoritesFilePathOverride = filePath;
	favoritesManagerInstance = null;
}
