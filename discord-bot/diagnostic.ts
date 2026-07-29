import {spawn, execSync} from 'node:child_process';
import {unlinkSync} from 'node:fs';
import {getMusicService} from '../source/services/youtube-music/api.ts';

const TEST_VIDEO_ID = 'jNQXAC9IVRw';

function section(title: string): void {
	console.log(`\n--- ${title} ---`);
}

function check(label: string, ok: boolean, detail?: string): void {
	console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function run(): Promise<void> {
	console.log('Discord Bot Diagnostic');

	section('Voice encryption / codec libs');

	try {
		const stablelib = await import('@stablelib/xchacha20poly1305');
		check(
			'@stablelib/xchacha20poly1305',
			typeof stablelib.XChaCha20Poly1305 === 'function',
		);
	} catch (error) {
		check(
			'@stablelib/xchacha20poly1305',
			false,
			error instanceof Error ? error.message : String(error),
		);
	}

	try {
		const opusscript = await import('opusscript');
		const encoder = new opusscript.default(48000, 2);
		check('opusscript', true);
		encoder.delete();
	} catch (error) {
		check(
			'opusscript',
			false,
			error instanceof Error ? error.message : String(error),
		);
	}

	try {
		const davey = await import('@snazzah/davey');
		check(
			'@snazzah/davey',
			typeof davey.DAVESession !== 'undefined',
			`protocol version ${davey.DAVESession.DAVE_PROTOCOL_VERSION}`,
		);
	} catch (error) {
		check(
			'@snazzah/davey',
			false,
			error instanceof Error ? error.message : String(error),
		);
	}

	section('Media tools');

	try {
		const mpvVersion = execSync('mpv --version', {encoding: 'utf8'}).split(
			'\n',
		)[0];
		check('mpv', true, mpvVersion);
	} catch (error) {
		check('mpv', false, error instanceof Error ? error.message : String(error));
	}

	try {
		const ffmpegVersion = execSync('ffmpeg -version', {encoding: 'utf8'}).split(
			'\n',
		)[0];
		check('ffmpeg', true, ffmpegVersion);
	} catch (error) {
		check(
			'ffmpeg',
			false,
			error instanceof Error ? error.message : String(error),
		);
	}

	section('YouTube stream extraction');

	let streamUrl: string | undefined;
	try {
		const musicService = getMusicService();
		streamUrl = await musicService.getStreamUrl(TEST_VIDEO_ID);
		check('getStreamUrl', true, `url length ${streamUrl.length}`);
	} catch (error) {
		check(
			'getStreamUrl',
			false,
			error instanceof Error ? error.message : String(error),
		);
	}

	section('mpv → ffmpeg PCM/Opus pipeline');

	if (!streamUrl) {
		check('PCM → OggOpus pipeline', false, 'no stream URL available');
		console.log('\nDiagnostic complete.');
		return;
	}

	const pipelineOk = await new Promise<boolean>(resolve => {
		const fifoPath = `/tmp/discord-diag-pcm-${process.pid}`;
		try {
			unlinkSync(fifoPath);
		} catch {
			/* ignore if it does not exist */
		}

		try {
			execSync(`mkfifo -m 0666 ${fifoPath}`);
		} catch (error) {
			console.error(
				'mkfifo failed:',
				error instanceof Error ? error.message : String(error),
			);
			resolve(false);
			return;
		}

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
			'-t',
			'3',
			'pipe:1',
		]);

		const mpv = spawn(
			'mpv',
			[
				'--no-config',
				'--no-video',
				'--really-quiet',
				'--msg-level=all=error',
				'--audio-samplerate=48000',
				'--audio-channels=stereo',
				'--audio-format=s16',
				'--ao=pcm',
				`--ao-pcm-file=${fifoPath}`,
				'--ao-pcm-waveheader=no',
				'--referrer=https://www.youtube.com/',
				'--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
				streamUrl,
			],
			{
				stdio: ['ignore', 'ignore', 'pipe'],
			},
		);

		let bytes = 0;
		let failed = false;

		if (!ffmpeg.stdout) {
			resolve(false);
			return;
		}

		ffmpeg.stdout.on('data', (chunk: Buffer) => {
			bytes += chunk.length;
		});

		const cleanup = () => {
			mpv.kill('SIGTERM');
			ffmpeg.kill('SIGTERM');
			try {
				unlinkSync(fifoPath);
			} catch {
				/* ignore */
			}
		};

		mpv.on('error', () => {
			failed = true;
			cleanup();
		});

		mpv.stderr?.on('data', (data: Buffer) => {
			console.error(`mpv: ${data.toString().trim()}`);
		});

		ffmpeg.on('error', () => {
			failed = true;
			cleanup();
		});

		ffmpeg.stderr?.on('data', (data: Buffer) => {
			console.error(`ffmpeg: ${data.toString().trim()}`);
		});

		const timer = setTimeout(() => {
			console.log(`pipeline timeout: bytes=${bytes}, failed=${failed}`);
			cleanup();
			resolve(!failed && bytes > 1_000);
		}, 15_000);

		ffmpeg.on('exit', () => {
			console.log(`pipeline exit: bytes=${bytes}, failed=${failed}`);
			clearTimeout(timer);
			cleanup();
			resolve(!failed && bytes > 1_000);
		});
	});

	check('PCM → OggOpus pipeline', pipelineOk);

	console.log('\nDiagnostic complete.');
}

run().catch(error => {
	console.error('Diagnostic failed:', error);
	process.exit(1);
});
