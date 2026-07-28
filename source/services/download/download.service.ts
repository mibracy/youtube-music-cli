import {existsSync, mkdirSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {getConfigService} from '../config/config.service.ts';
import {logger} from '../logger/logger.service.ts';
import {getMusicService} from '../youtube-music/api.ts';
import type {DownloadFormat} from '../../types/config.types.ts';
import type {
	Playlist,
	SearchResult,
	Track,
} from '../../types/youtube-music.types.ts';

type DownloadResult = {
	downloaded: number;
	skipped: number;
	failed: number;
	errors: string[];
};

type DownloadTarget = {
	name: string;
	tracks: Track[];
};

class DownloadService {
	private ffmpegChecked = false;
	private ffmpegAvailable = false;
	private activeDownload = false;
	private readonly config = getConfigService();
	private readonly musicService = getMusicService();

	getConfig() {
		return {
			enabled: this.config.get('downloadsEnabled') ?? false,
			directory: this.config.get('downloadDirectory') ?? '',
			format: (this.config.get('downloadFormat') ?? 'mp3') as DownloadFormat,
		};
	}

	async resolveSearchTarget(result: SearchResult): Promise<DownloadTarget> {
		if (result.type === 'song') {
			const track = result.data as Track;
			return {name: track.title, tracks: [track]};
		}

		if (result.type === 'artist') {
			const artistName =
				'name' in result.data ? (result.data as {name: string}).name : '';
			if (!artistName) {
				throw new Error('Artist name is missing.');
			}

			const response = await this.musicService.search(artistName, {
				type: 'songs',
				limit: 25,
			});
			const tracks = response.results
				.filter(row => row.type === 'song')
				.map(row => row.data as Track);

			return {name: artistName, tracks: this.uniqueTracks(tracks)};
		}

		if (result.type === 'playlist') {
			const playlistInfo = result.data as {playlistId?: string; name?: string};
			if (!playlistInfo.playlistId) {
				throw new Error('Playlist id is missing.');
			}

			const playlist = await this.musicService.getPlaylist(
				playlistInfo.playlistId,
			);
			return {
				name: playlist.name || playlistInfo.name || 'playlist',
				tracks: this.uniqueTracks(playlist.tracks),
			};
		}

		throw new Error(
			'Downloads are supported for songs, artists, and playlists.',
		);
	}

	resolvePlaylistTarget(playlist: Playlist): DownloadTarget {
		return {
			name: playlist.name,
			tracks: this.uniqueTracks(playlist.tracks),
		};
	}

	async downloadTracks(tracks: Track[]): Promise<DownloadResult> {
		if (this.activeDownload) {
			throw new Error(
				'A download is already in progress. Please wait for it to finish.',
			);
		}

		const {directory, format} = this.getConfig();
		if (!directory) {
			throw new Error('No download directory configured.');
		}

		mkdirSync(directory, {recursive: true});
		await this.ensureFfmpeg();
		this.activeDownload = true;

		const result: DownloadResult = {
			downloaded: 0,
			skipped: 0,
			failed: 0,
			errors: [],
		};

		try {
			for (const track of tracks) {
				const destination = this.getDestinationPath(track, directory, format);
				const tempSource = `${destination}.source`;
				const tempCover = `${destination}.cover.jpg`;
				try {
					logger.info('DownloadService', 'Starting track download', {
						videoId: track.videoId,
						title: track.title,
					});
					mkdirSync(path.dirname(destination), {recursive: true});
					if (existsSync(destination)) {
						result.skipped++;
						logger.debug('DownloadService', 'Skipping existing file', {
							destination,
						});
						continue;
					}

					try {
						const streamUrl = await this.musicService.getStreamUrl(
							track.videoId,
						);
						const audioBuffer = await this.fetchAudio(streamUrl);
						writeFileSync(tempSource, audioBuffer);
					} catch (streamError) {
						logger.warn(
							'DownloadService',
							'Stream URL extraction failed, falling back to yt-dlp',
							{
								videoId: track.videoId,
								error:
									streamError instanceof Error
										? streamError.message
										: String(streamError),
							},
						);
						try {
							await this.recordViaYtDlp(track.videoId, tempSource);
						} catch (ytdlpError) {
							logger.warn(
								'DownloadService',
								'yt-dlp fallback failed, falling back to mpv recording',
								{
									videoId: track.videoId,
									error:
										ytdlpError instanceof Error
											? ytdlpError.message
											: String(ytdlpError),
								},
							);
							await this.recordViaMpv(track.videoId, tempSource);
						}
					}

					const hasCover = await this.downloadCoverArt(
						track.videoId,
						tempCover,
					);
					await this.convertAudio(
						tempSource,
						destination,
						format,
						track,
						hasCover ? tempCover : undefined,
					);
					result.downloaded++;
					logger.info('DownloadService', 'Track download complete', {
						videoId: track.videoId,
						destination,
					});
				} catch (error) {
					result.failed++;
					const message =
						error instanceof Error ? error.message : 'Unknown download failure';
					result.errors.push(message);
					logger.error('DownloadService', 'Track download failed', {
						videoId: track.videoId,
						title: track.title,
						error: message,
					});
				} finally {
					if (existsSync(tempSource)) {
						unlinkSync(tempSource);
					}
					if (existsSync(tempCover)) {
						unlinkSync(tempCover);
					}
				}
			}

			return result;
		} finally {
			this.activeDownload = false;
		}
	}

	private uniqueTracks(tracks: Track[]): Track[] {
		const seen = new Set<string>();
		const unique: Track[] = [];
		for (const track of tracks) {
			if (!track?.videoId || seen.has(track.videoId)) continue;
			seen.add(track.videoId);
			unique.push(track);
		}

		return unique;
	}

	private getDestinationPath(
		track: Track,
		directory: string,
		format: DownloadFormat,
	): string {
		const artist = track.artists?.[0]?.name ?? 'Unknown Artist';
		const album = track.album?.name ?? 'Singles';
		const artistDir = this.sanitizeFilename(artist) || 'Unknown Artist';
		const albumDir = this.sanitizeFilename(album) || 'Singles';
		const fileName = this.sanitizeFilename(track.title) || track.videoId;
		return path.join(directory, artistDir, albumDir, `${fileName}.${format}`);
	}

	private sanitizeFilename(value: string): string {
		return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
	}

	private async fetchAudio(url: string): Promise<Buffer> {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch audio stream (${response.status}).`);
		}

		const audio = await response.arrayBuffer();
		return Buffer.from(audio);
	}

	private async ensureFfmpeg(): Promise<void> {
		if (this.ffmpegChecked) {
			if (!this.ffmpegAvailable) {
				throw new Error(
					'ffmpeg is required for downloads. Install ffmpeg and ensure it is available in PATH.',
				);
			}
			return;
		}

		this.ffmpegChecked = true;
		try {
			await this.runFfmpeg(['-version']);
			this.ffmpegAvailable = true;
		} catch {
			this.ffmpegAvailable = false;
			throw new Error(
				'ffmpeg is required for downloads. Install ffmpeg and ensure it is available in PATH.',
			);
		}
	}

	private async convertAudio(
		sourcePath: string,
		destinationPath: string,
		format: DownloadFormat,
		track: Track,
		coverPath?: string,
	): Promise<void> {
		const metadataArgs = this.buildMetadataArgs(track);
		if (format === 'mp3') {
			const args = ['-y', '-i', sourcePath];
			if (coverPath) {
				args.push('-i', coverPath, '-map', '0:a:0', '-map', '1:v:0');
			} else {
				args.push('-map', '0:a:0', '-vn');
			}

			args.push('-codec:a', 'libmp3lame', '-q:a', '2', ...metadataArgs);

			if (coverPath) {
				args.push(
					'-codec:v',
					'mjpeg',
					'-disposition:v:0',
					'attached_pic',
					'-metadata:s:v',
					'title=Album cover',
					'-metadata:s:v',
					'comment=Cover (front)',
				);
			}

			args.push(destinationPath);
			await this.runFfmpeg(args);
			return;
		}

		const args = ['-y', '-i', sourcePath];
		if (coverPath) {
			args.push('-i', coverPath, '-map', '0:a:0', '-map', '1:v:0');
		} else {
			args.push('-map', '0:a:0', '-vn');
		}

		args.push('-codec:a', 'aac', '-b:a', '192k', ...metadataArgs);
		if (coverPath) {
			args.push('-codec:v', 'mjpeg', '-disposition:v:0', 'attached_pic');
		}

		args.push(destinationPath);
		await this.runFfmpeg(args);
	}

	private buildMetadataArgs(track: Track): string[] {
		const artist =
			track.artists
				.map(row => row.name)
				.filter(Boolean)
				.join(', ') || 'Unknown Artist';
		const album = track.album?.name || 'Singles';
		return [
			'-metadata',
			`title=${track.title}`,
			'-metadata',
			`artist=${artist}`,
			'-metadata',
			`album=${album}`,
		];
	}

	private async runFfmpeg(args: string[]): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const process = spawn('ffmpeg', args, {windowsHide: true});
			let stderr = '';
			process.stderr.on('data', chunk => {
				stderr += String(chunk);
			});
			process.on('error', reject);
			process.on('exit', code => {
				if (code === 0) {
					resolve();
					return;
				}

				reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
			});
		});
	}

	private async recordViaYtDlp(
		videoId: string,
		outputPath: string,
	): Promise<void> {
		const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
		await new Promise<void>((resolve, reject) => {
			const process = spawn(
				'yt-dlp',
				[
					'--no-playlist',
					'--quiet',
					'--no-warnings',
					'--js-runtimes',
					'node',
					'-f',
					'bestaudio',
					'--output',
					outputPath,
					watchUrl,
				],
				{windowsHide: true},
			);
			let stderr = '';
			let stdout = '';
			process.stderr.on('data', chunk => {
				stderr += String(chunk);
			});
			process.stdout.on('data', chunk => {
				stdout += String(chunk);
			});
			process.on('error', reject);
			process.on('exit', code => {
				if (code === 0 && existsSync(outputPath)) {
					resolve();
					return;
				}

				reject(
					new Error(
						(stderr || stdout).trim() ||
							`yt-dlp exited with code ${code} and no output file`,
					),
				);
			});
		});
	}

	private async downloadCoverArt(
		videoId: string,
		outputPath: string,
	): Promise<boolean> {
		const candidates = [
			`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
			`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
		];
		for (const url of candidates) {
			try {
				const response = await fetch(url);
				if (!response.ok) continue;
				const image = Buffer.from(await response.arrayBuffer());
				if (image.length === 0) continue;
				writeFileSync(outputPath, image);
				return true;
			} catch {
				continue;
			}
		}

		return false;
	}

	private async recordViaMpv(
		videoId: string,
		outputPath: string,
	): Promise<void> {
		const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
		await new Promise<void>((resolve, reject) => {
			const process = spawn(
				'mpv',
				[
					watchUrl,
					'--no-video',
					'--ao=null',
					'--ytdl=yes',
					'--really-quiet',
					`--stream-record=${outputPath}`,
				],
				{windowsHide: true},
			);
			let stderr = '';
			process.stderr.on('data', chunk => {
				stderr += String(chunk);
			});
			process.on('error', reject);
			process.on('exit', code => {
				if (code === 0 && existsSync(outputPath)) {
					resolve();
					return;
				}

				reject(
					new Error(
						stderr.trim() || `mpv exited with code ${code} and no output file`,
					),
				);
			});
		});
	}
}

let downloadServiceInstance: DownloadService | null = null;

export function getDownloadService(): DownloadService {
	if (!downloadServiceInstance) {
		downloadServiceInstance = new DownloadService();
	}
	return downloadServiceInstance;
}
