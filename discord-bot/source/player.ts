import {
	type AudioPlayer,
	type VoiceConnection,
	AudioPlayerStatus,
	NoSubscriberBehavior,
	StreamType,
	VoiceConnectionStatus,
	createAudioPlayer,
	createAudioResource,
	entersState,
	joinVoiceChannel,
} from '@discordjs/voice';
import {ActivityType, Client, Guild, VoiceChannel} from 'discord.js';
import {spawn, execSync} from 'node:child_process';
import {connect, type Socket} from 'node:net';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import path from 'node:path';
import {getMusicService} from '../../source/services/youtube-music/api.ts';
import {logger} from '../../source/services/logger/logger.service.ts';
import {buildMpvArgs} from '../../source/services/player/player.service.ts';
import type {Track} from '../../source/types/youtube-music.types.ts';

const DEFAULT_STATE_PATH = path.join(
	process.env.STATE_DIR || '/data',
	'discord-bot-state.json',
);

const DEFAULT_VOLUME = 69;

interface PersistedState {
	guilds: Record<string, {channelId: string}>;
}

class VoicePlayer {
	private connection: VoiceConnection | null = null;
	private player: AudioPlayer;
	private queue_: Track[] = [];
	private queuePosition_ = -1;
	private currentTrack_: Track | null = null;
	private guildId_: string;
	private volume_ = DEFAULT_VOLUME;
	private client_: Client | null = null;

	// mpv IPC + ffmpeg pipeline
	private mpvProcess: ReturnType<typeof spawn> | null = null;
	private ffmpegProcess: ReturnType<typeof spawn> | null = null;
	private ipcSocket: Socket | null = null;
	private ipcPath: string | null = null;
	private fifoPath: string | null = null;
	private mpvStderr: string[] = [];
	private ffmpegStderr: string[] = [];
	private static sessionCounter = 0;

	constructor(guildId: string, client: Client | null = null) {
		this.guildId_ = guildId;
		this.client_ = client;
		this.player = createAudioPlayer({
			behaviors: {noSubscriber: NoSubscriberBehavior.Play},
		});

		this.player.on('stateChange', (_oldState, newState) => {
			logger.debug(
				'VoicePlayer',
				`player state: ${_oldState.status} -> ${newState.status}`,
			);
			if (
				newState.status === AudioPlayerStatus.Idle &&
				_oldState.status !== AudioPlayerStatus.Idle
			) {
				void this.playNext().catch(error => {
					logger.error('VoicePlayer', 'playNext failed in idle handler', {
						error: error instanceof Error ? error.message : String(error),
					});
				});
			}
		});

		this.player.on('debug', msg => {
			logger.debug('VoicePlayer', `player debug: ${msg}`);
		});

		this.player.on('error', error => {
			logger.error('VoicePlayer', 'Player error', {
				message: error.message,
				stack: error.stack,
			});
			void this.playNext().catch(nextError => {
				logger.error('VoicePlayer', 'playNext failed after player error', {
					error:
						nextError instanceof Error ? nextError.message : String(nextError),
				});
			});
		});
	}

	get guildId(): string {
		return this.guildId_;
	}

	get currentTrack(): Track | null {
		return this.currentTrack_;
	}

	get queue(): Track[] {
		return [...this.queue_];
	}

	get queuePosition(): number {
		return this.queuePosition_;
	}

	get isPlaying(): boolean {
		return this.player.state.status === AudioPlayerStatus.Playing;
	}

	get isPaused(): boolean {
		return this.player.state.status === AudioPlayerStatus.Paused;
	}

	get volume(): number {
		return this.volume_;
	}

	isConnected(): boolean {
		if (!this.connection) {
			return false;
		}

		const status = this.connection.state.status;
		return (
			status !== VoiceConnectionStatus.Disconnected &&
			status !== VoiceConnectionStatus.Destroyed
		);
	}

	async join(channel: VoiceChannel, client: Client): Promise<void> {
		if (this.connection) {
			this.connection.destroy();
		}

		this.connection = joinVoiceChannel({
			channelId: channel.id,
			guildId: channel.guild.id,
			adapterCreator: channel.guild.voiceAdapterCreator,
			debug: true,
			selfDeaf: true,
			selfMute: false,
			group: client.user!.id,
		});

		// Apply DAVE encryption middleware (handled automatically by @discordjs/voice if @snazzah/davey is present)
		this.connection.on('stateChange', (_oldState, newState) => {
			logger.debug(
				'VoicePlayer',
				`connection state: ${_oldState.status} -> ${newState.status}`,
			);
			if (newState.status === VoiceConnectionStatus.Ready) {
				const isDaveEnabled = !!(this.connection as any).dave;
				logger.info(
					'VoicePlayer',
					`Connection ready. DAVE Encryption: ${isDaveEnabled ? 'ENABLED' : 'DISABLED (handshake pending or unsupported)'}`,
				);
			}
			if (newState.status === VoiceConnectionStatus.Disconnected) {
				logger.info(
					'VoicePlayer',
					'Disconnected, waiting to see if we can reconnect automatically...',
				);
				void this.reconnect();
			}
		});

		this.connection.on('debug', msg => {
			logger.debug('VoicePlayer', `connection debug: ${msg}`);
		});

		this.connection.subscribe(this.player);

		try {
			await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
			logger.info('VoicePlayer', 'connection ready');
		} catch (error) {
			logger.error('VoicePlayer', 'Failed to reach Ready state within 30s', {
				error: error instanceof Error ? error.message : String(error),
			});
			if (
				this.connection &&
				this.connection.state.status !== VoiceConnectionStatus.Destroyed
			) {
				this.connection.destroy();
			}
			this.connection = null;
			throw error;
		}
	}

	private async reconnect(): Promise<void> {
		if (!this.connection) {
			return;
		}

		try {
			// Wait up to 15 seconds for it to move out of Disconnected
			await Promise.race([
				entersState(this.connection, VoiceConnectionStatus.Signalling, 15_000),
				entersState(this.connection, VoiceConnectionStatus.Connecting, 15_000),
			]);
			logger.info('VoicePlayer', 'Successfully reconnected/signalling');
		} catch {
			if (
				this.connection &&
				this.connection.state.status !== VoiceConnectionStatus.Destroyed
			) {
				logger.info(
					'VoicePlayer',
					'Reconnection failed after 15s, destroying connection',
				);
				this.connection.destroy();
				this.connection = null;
			}
		}
	}

	async play(track: Track): Promise<void> {
		const isQueueEmpty = this.queue_.length === 0;
		this.queue_.push(track);

		if (isQueueEmpty) {
			this.queuePosition_ = 0;
			this.currentTrack_ = track;
			await this.playCurrent();
		}
	}

	async playNext(): Promise<void> {
		const nextPos = this.queuePosition_ + 1;

		if (nextPos < this.queue_.length) {
			this.queuePosition_ = nextPos;
			this.currentTrack_ = this.queue_[nextPos] ?? null;
			try {
				await this.playCurrent();
			} catch (error) {
				logger.error('VoicePlayer', 'Failed to play next track, skipping', {
					error: error instanceof Error ? error.message : String(error),
				});
				await this.playNext();
			}
		} else {
			this.currentTrack_ = null;
			this.queuePosition_ = -1;
			this.setupBotActivity(null);
		}
	}

	private getIpcPath(): string {
		VoicePlayer.sessionCounter++;
		return `/tmp/discord-mpvsocket-${process.pid}-${VoicePlayer.sessionCounter}`;
	}

	private getFifoPath(): string {
		VoicePlayer.sessionCounter++;
		return `/tmp/discord-pcm-${process.pid}-${VoicePlayer.sessionCounter}`;
	}

	private sendIpcCommand(command: unknown[]): void {
		if (!this.ipcSocket || this.ipcSocket.destroyed) {
			logger.warn(
				'VoicePlayer',
				'Cannot send IPC command: socket not connected',
			);
			return;
		}

		const message = JSON.stringify({command}) + '\n';
		this.ipcSocket.write(message);
	}

	private async connectIpc(
		ipcPath: string,
		urlToLoad?: string,
		maxRetries = 10,
	): Promise<void> {
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				await this.connectIpcOnce(ipcPath, urlToLoad);
				return;
			} catch (err) {
				const lastAttempt = attempt === maxRetries - 1;
				logger.debug('VoicePlayer', 'IPC connection attempt failed', {
					attempt: attempt + 1,
					error: err instanceof Error ? err.message : String(err),
				});
				if (lastAttempt) {
					throw new Error(
						`Failed to connect to IPC socket after ${maxRetries} attempts: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				await new Promise(r => setTimeout(r, 100));
			}
		}
	}

	private connectIpcOnce(ipcPath: string, urlToLoad?: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = connect(ipcPath);
			let resolved = false;

			const cleanup = () => {
				socket.removeAllListeners();
			};

			const onConnect = () => {
				this.ipcSocket = socket;

				// Send loadfile only if explicitly provided (bot passes URL on
				// command line now, so this is only for future extensibility).
				if (urlToLoad) {
					this.sendIpcCommand(['loadfile', urlToLoad]);
				}

				if (!resolved) {
					resolved = true;
					cleanup();
					resolve();
				}
			};

			const onError = (err: Error) => {
				socket.destroy();
				if (!resolved) {
					resolved = true;
					cleanup();
					reject(err);
				}
			};

			socket.on('connect', onConnect);
			socket.on('error', onError);
		});
	}

	private setupBotActivity(track: Track | null): void {
		if (!this.client_?.user) {
			return;
		}

		if (track) {
			const artistStr =
				track.artists?.map(a => a.name).join(', ') || 'Unknown';
			void this.client_.user.setActivity({
				name: `${track.title} — ${artistStr}`,
				type: ActivityType.Listening,
			});
		} else {
			void this.client_.user.setActivity();
		}
	}

	private killProcesses(): void {
		if (this.ipcSocket) {
			this.ipcSocket.destroy();
			this.ipcSocket = null;
		}

		if (this.ffmpegProcess) {
			this.ffmpegProcess.kill();
			this.ffmpegProcess = null;
		}

		if (this.mpvProcess) {
			this.mpvProcess.kill('SIGTERM');
			this.mpvProcess = null;
		}

		if (this.fifoPath) {
			try {
				unlinkSync(this.fifoPath);
			} catch {
				/* ignore */
			}

			this.fifoPath = null;
		}

		this.ipcPath = null;
		this.mpvStderr = [];
		this.ffmpegStderr = [];
	}

	private async playCurrent(): Promise<void> {
		const track = this.currentTrack_;
		if (!track) {
			return;
		}

		// Kill existing processes
		this.killProcesses();

		const musicService = getMusicService();
		let streamUrl: string;
		try {
			streamUrl = await musicService.getStreamUrl(track.videoId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('VoicePlayer', 'Failed to extract stream URL', {
				videoId: track.videoId,
				error: message,
			});
			throw new Error(
				`Could not get audio stream for **${track.title}**: ${message}`,
			);
		}

		const ipcPath = this.getIpcPath();
		this.ipcPath = ipcPath;

		const fifoPath = this.getFifoPath();
		this.fifoPath = fifoPath;

		logger.info(
			'VoicePlayer',
			`playCurrent: ${track.title} (${track.videoId})`,
		);

		try {
			// Create a named pipe for mpv → ffmpeg PCM audio. mpv fully buffers
			// stdout when piped through Node streams, so writing to a FIFO lets
			// ffmpeg consume the raw PCM via an OS pipe instead.
			try {
				execSync(`mkfifo -m 0666 ${fifoPath}`);
			} catch (error) {
				throw new Error(
					`Failed to create PCM FIFO: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			// Build mpv args using CLI's helper for audio filters + IPC, then add
			// Discord-specific PCM output options.
			const mpvBaseArgs = buildMpvArgs(ipcPath, {
				volume: this.volume_,
				audioNormalization: true,
				gaplessPlayback: true,
				idle: false,
			});

			const mpvArgs = [
				...mpvBaseArgs,
				'--no-config',
				'--ao=pcm',
				`--ao-pcm-file=${fifoPath}`,
				'--ao-pcm-waveheader=no',
				'--audio-samplerate=48000',
				'--audio-channels=stereo',
				'--audio-format=s16',
				'--referrer=https://www.youtube.com/',
				'--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
				streamUrl,
			];

			logger.debug('VoicePlayer', 'Starting mpv + ffmpeg pipeline', {
				ipcPath,
				fifoPath,
				url: streamUrl,
			});

			// Spawn ffmpeg first so it opens the FIFO for reading; mpv will block
			// until a reader is available.
			const ffmpeg = spawn('ffmpeg', [
				'-f',
				's16le',
				'-ar',
				'48000',
				'-ac',
				'2',
				'-i',
				fifoPath,
				'-c:a',
				'libopus',
				'-b:a',
				'128k',
				'-f',
				'ogg',
				'-loglevel',
				'error',
				'pipe:1',
			]);
			this.ffmpegProcess = ffmpeg;

			// Spawn mpv with the direct audio URL on the command line so it starts
			// playing immediately. Stdout is unused because audio goes to the FIFO.
			const mpv = spawn('mpv', mpvArgs, {
				stdio: ['ignore', 'ignore', 'pipe'],
			});
			this.mpvProcess = mpv;

			mpv.on('error', err => {
				logger.error('VoicePlayer', 'mpv spawn error', err);
			});

			mpv.stderr?.on('data', (data: Buffer) => {
				const msg = data.toString();
				this.mpvStderr.push(msg);
				if (this.mpvStderr.length > 20) {
					this.mpvStderr.shift();
				}

				const trimmed = msg.trim();
				if (trimmed) {
					logger.error('VoicePlayer', 'mpv stderr', {msg: trimmed});
				}
			});

			mpv.on('exit', (code, signal) => {
				logger.info('VoicePlayer', `mpv exited code=${code} signal=${signal}`);
				if (this.mpvProcess === mpv) {
					this.mpvProcess = null;
				}
			});

			ffmpeg.stderr!.on('data', (data: Buffer) => {
				const msg = data.toString();
				this.ffmpegStderr.push(msg);
				if (this.ffmpegStderr.length > 20) {
					this.ffmpegStderr.shift();
				}

				const trimmed = msg.trim();
				if (trimmed) {
					logger.warn('VoicePlayer', 'ffmpeg stderr', {msg: trimmed});
				}
			});

			ffmpeg.on('exit', (code, signal) => {
				logger.info(
					'VoicePlayer',
					`ffmpeg exited code=${code} signal=${signal}`,
				);
				mpv.kill();
				if (this.ffmpegProcess === ffmpeg) {
					this.ffmpegProcess = null;
				}
			});

			ffmpeg.on('error', (err: Error) => {
				logger.error('VoicePlayer', 'ffmpeg spawn error', err);
				mpv.kill();
				if (this.ffmpegProcess === ffmpeg) {
					this.ffmpegProcess = null;
				}
			});

			// Connect IPC socket in the background for pause/resume/stop control.
			// We do NOT wait for it — audio starts immediately from the command-line URL.
			this.connectIpc(ipcPath)
				.then(() => {
					logger.info('VoicePlayer', 'IPC connected (control only)');
				})
				.catch(error => {
					logger.warn(
						'VoicePlayer',
						'IPC connection failed — pause/resume unavailable',
						{
							error: error instanceof Error ? error.message : String(error),
						},
					);
				});

			logger.debug('VoicePlayer', 'Creating audio resource (OggOpus)...');

			const resource = createAudioResource(ffmpeg.stdout, {
				inputType: StreamType.OggOpus,
			});

			this.player.play(resource);

			// Confirm audio actually starts before telling the user it's playing.
			try {
				await entersState(this.player, AudioPlayerStatus.Playing, 10_000);
				logger.info('VoicePlayer', 'Playback started');
				this.setupBotActivity(this.currentTrack_);
			} catch (error) {
				const lastMpvErr = this.mpvStderr.join('').trim();
				const lastFfmpegErr = this.ffmpegStderr.join('').trim();
				logger.error('VoicePlayer', 'Playback did not start in time', {
					mpvExitCode: mpv.exitCode,
					ffmpegExitCode: ffmpeg.exitCode,
					mpvStderr: lastMpvErr,
					ffmpegStderr: lastFfmpegErr,
				});
				this.killProcesses();

				let detail = 'Audio never started.';
				if (lastMpvErr) {
					detail += ` mpv: ${lastMpvErr.slice(0, 200)}`;
				} else if (lastFfmpegErr) {
					detail += ` ffmpeg: ${lastFfmpegErr.slice(0, 200)}`;
				} else if (mpv.exitCode !== null) {
					detail += ` mpv exited with code ${mpv.exitCode}.`;
				} else if (ffmpeg.exitCode !== null) {
					detail += ` ffmpeg exited with code ${ffmpeg.exitCode}.`;
				}

				throw new Error(detail);
			}
		} catch (error) {
			logger.error('VoicePlayer', 'Failed to play track', {
				error: error instanceof Error ? error.message : String(error),
			});
			this.killProcesses();
			throw error;
		}
	}

	skip(): Track | null {
		const skipped = this.currentTrack_;
		if (this.queuePosition_ < this.queue_.length - 1) {
			void this.playNext().catch(error => {
				logger.error('VoicePlayer', 'skip: playNext failed', {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		} else {
			this.currentTrack_ = null;
			this.queuePosition_ = -1;
			this.queue_ = [];
			this.stop();
		}

		return skipped;
	}

	pause(): void {
		this.player.pause();
		this.sendIpcCommand(['set_property', 'pause', true]);
		logger.debug('VoicePlayer', 'Paused');
	}

	resume(): void {
		this.player.unpause();
		this.sendIpcCommand(['set_property', 'pause', false]);
		logger.debug('VoicePlayer', 'Resumed');
	}

	stop(): void {
		this.queue_ = [];
		this.queuePosition_ = -1;
		this.currentTrack_ = null;
		this.player.stop(true);
		this.killProcesses();
		this.setupBotActivity(null);
	}

	leave(): void {
		this.stop();
		if (this.connection) {
			this.connection.destroy();
			this.connection = null;
		}
	}

	setVolume(volume: number): void {
		this.volume_ = Math.max(0, Math.min(100, volume));
		this.sendIpcCommand(['set_property', 'volume', this.volume_]);
		logger.debug('VoicePlayer', `Volume set to ${this.volume_}`);
	}

	addToQueue(track: Track): void {
		this.queue_.push(track);
	}

	removeFromQueue(index: number): boolean {
		if (index < 0 || index >= this.queue_.length) {
			return false;
		}

		this.queue_.splice(index, 1);
		if (index < this.queuePosition_) {
			this.queuePosition_--;
		} else if (index === this.queuePosition_) {
			if (this.queuePosition_ >= this.queue_.length) {
				this.queuePosition_ = this.queue_.length - 1;
			}
		}

		return true;
	}

	getState() {
		return {
			currentTrack: this.currentTrack_,
			isPlaying: this.isPlaying,
			isPaused: this.isPaused,
			queue: this.queue_,
			queuePosition: this.queuePosition_,
			volume: this.volume_,
		};
	}
}

class VoicePlayerManager {
	private players = new Map<string, VoicePlayer>();
	private statePath: string;

	constructor(statePath?: string) {
		this.statePath = statePath || DEFAULT_STATE_PATH;
	}

	async restoreChannels(client: Client): Promise<void> {
		const state = await this.readState();

		for (const [guildId, {channelId}] of Object.entries(state.guilds)) {
			const guild = client.guilds.cache.get(guildId);

			if (!guild) {
				await this.removePersistence(guildId);
				continue;
			}

			const channel = guild.channels.cache.get(channelId);

			if (!channel?.isVoiceBased()) {
				await this.removePersistence(guildId);
				continue;
			}

			const player = new VoicePlayer(guildId, client);

			try {
				await player.join(channel as VoiceChannel, client);
				this.players.set(guildId, player);
				logger.info(
					'VoicePlayerManager',
					`Rejoined channel ${channelId} in guild ${guildId}`,
				);
			} catch (error) {
				logger.error(
					'VoicePlayerManager',
					`Failed to rejoin guild ${guildId}`,
					{error: error instanceof Error ? error.message : String(error)},
				);
				await this.removePersistence(guildId);
			}
		}
	}

	async ensureJoined(
		guild: Guild,
		userId: string,
		client: Client,
	): Promise<VoicePlayer> {
		const existing = this.players.get(guild.id);

		if (existing?.isConnected()) {
			return existing;
		}

		const member = guild.members.cache.get(userId);
		const channel = member?.voice.channel;

		if (!channel) {
			throw new Error('You must be in a voice channel to use this command.');
		}

		const player = new VoicePlayer(guild.id, client);
		await player.join(channel as VoiceChannel, client);
		this.players.set(guild.id, player);
		await this.savePersistence(guild.id, channel.id);

		return player;
	}

	get(guildId: string): VoicePlayer | undefined {
		return this.players.get(guildId);
	}

	async remove(guildId: string): Promise<void> {
		const player = this.players.get(guildId);

		if (player) {
			player.leave();
			this.players.delete(guildId);
		}

		await this.removePersistence(guildId);
	}

	private async savePersistence(
		guildId: string,
		channelId: string,
	): Promise<void> {
		try {
			const state = await this.readState();
			state.guilds[guildId] = {channelId};
			await this.writeState(state);
		} catch (error) {
			logger.error('Persistence', 'Failed to save', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async removePersistence(guildId: string): Promise<void> {
		try {
			const state = await this.readState();
			delete state.guilds[guildId];
			await this.writeState(state);
		} catch (error) {
			logger.error('Persistence', 'Failed to remove', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async readState(): Promise<PersistedState> {
		try {
			const data = await readFile(this.statePath, 'utf-8');
			return JSON.parse(data) as PersistedState;
		} catch {
			return {guilds: {}};
		}
	}

	private async writeState(state: PersistedState): Promise<void> {
		await mkdir(path.dirname(this.statePath), {recursive: true});
		await writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
	}

	cleanup(): void {
		for (const player of this.players.values()) {
			player.leave();
		}

		this.players.clear();
	}
}

export {VoicePlayer, VoicePlayerManager};
