import {expect, test} from 'bun:test';

test('mpv-event-policy: suppresses pause only when advancing or after EOF', async () => {
	const {EOF_PAUSE_SUPPRESSION_MS, shouldApplyMpvPauseSync} =
		await import('../source/services/player/mpv-event-policy.ts');

	const now = 10_000;

	expect(
		shouldApplyMpvPauseSync({
			paused: true,
			isAdvancing: true,
			eofTimestamp: 0,
			now,
		}),
	).toBe(false);
	expect(
		shouldApplyMpvPauseSync({
			paused: true,
			eofTimestamp: now - (EOF_PAUSE_SUPPRESSION_MS - 1),
			now,
		}),
	).toBe(false);
	expect(
		shouldApplyMpvPauseSync({
			paused: true,
			eofTimestamp: 0,
			advanceGraceUntil: now + 5000,
			now,
		}),
	).toBe(false);
	expect(
		shouldApplyMpvPauseSync({
			paused: true,
			eofTimestamp: now - EOF_PAUSE_SUPPRESSION_MS,
			advanceGraceUntil: now - 1,
			now,
		}),
	).toBe(true);
	expect(
		shouldApplyMpvPauseSync({
			paused: true,
			eofTimestamp: 0,
			now,
		}),
	).toBe(true);
	expect(shouldApplyMpvPauseSync({paused: false, eofTimestamp: 0, now})).toBe(
		true,
	);
});

test('mpv-event-policy: debounces EOF advance', async () => {
	const {ADVANCE_DEBOUNCE_MS, shouldDebounceAdvance} =
		await import('../source/services/player/mpv-event-policy.ts');

	expect(shouldDebounceAdvance(0, ADVANCE_DEBOUNCE_MS - 1)).toBe(true);
	expect(shouldDebounceAdvance(0, ADVANCE_DEBOUNCE_MS)).toBe(false);
	expect(
		shouldDebounceAdvance(-ADVANCE_DEBOUNCE_MS, ADVANCE_DEBOUNCE_MS - 1),
	).toBe(false);
});

test('mpv-event-policy: advances on EOF only when the track produced progress', async () => {
	const {shouldAdvanceOnEof} =
		await import('../source/services/player/mpv-event-policy.ts');

	// Normal track end: progress was received, so advance to the next track.
	expect(shouldAdvanceOnEof(true)).toBe(true);

	// Failed/silent load: no progress ever arrived (mpv dropped to idle),
	// so EOF must NOT advance — otherwise the next song in the queue gets
	// skipped for a track that never played.
	expect(shouldAdvanceOnEof(false)).toBe(false);
});
