import {expect, test} from 'bun:test';

test('player service exposes singleton without starting mpv', async () => {
	const {getPlayerService} =
		await import('../source/services/player/player.service.ts');

	const a = getPlayerService();
	const b = getPlayerService();

	expect(a).toBe(b);

	// Should allow pause/resume/stop without crashing when mpv is not running
	expect(() => {
		a.pause();
		a.resume();
		a.stop();
	}).not.toThrow();
});

// ── Shuffle reducer tests ─────────────────────────────────────────────────────

/** Build a minimal PlayerState for reducer tests */
function makeState(overrides = {}) {
	return {
		currentTrack: null,
		isPlaying: false,
		volume: 70,
		speed: 1.0,
		progress: 0,
		duration: 0,
		queue: [],
		queuePosition: 0,
		repeat: 'off',
		shuffle: false,
		isLoading: false,
		error: null,
		explicitQueueLength: 0,
		...overrides,
	};
}

/** Build a minimal Track object */
function makeTrack(id) {
	return {videoId: id, title: `Track ${id}`, artists: [], duration: 200};
}

test('TOGGLE_SHUFFLE flips shuffle from false to true', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({shuffle: false});
	const next = playerReducer(state, {category: 'TOGGLE_SHUFFLE'});
	expect(next.shuffle).toBe(true);
});

test('TOGGLE_SHUFFLE flips shuffle from true to false', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({shuffle: true});
	const next = playerReducer(state, {category: 'TOGGLE_SHUFFLE'});
	expect(next.shuffle).toBe(false);
});

test('PLAY_NEXT inserts track after current queue position', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const a = makeTrack('a');
	const b = makeTrack('b');
	const c = makeTrack('c');
	const state = makeState({
		queue: [a, b],
		queuePosition: 0,
		currentTrack: a,
		explicitQueueLength: 2,
	});
	const next = playerReducer(state, {category: 'PLAY_NEXT', track: c});
	expect(next.queue.map(track => track.videoId)).toEqual(['a', 'c', 'b']);
	expect(next.queuePosition).toBe(0);
	expect(next.explicitQueueLength).toBe(3);
});

test('ADD_TO_QUEUE appends and bumps explicitQueueLength', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const a = makeTrack('a');
	const b = makeTrack('b');
	const state = makeState({
		queue: [a],
		queuePosition: 0,
		explicitQueueLength: 1,
	});
	const next = playerReducer(state, {category: 'ADD_TO_QUEUE', track: b});
	expect(next.queue.map(track => track.videoId)).toEqual(['a', 'b']);
	expect(next.explicitQueueLength).toBe(2);
});

test('MOVE_IN_QUEUE in standalone playback keeps queuePosition when moving to front', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c'].map(makeTrack);
	const current = makeTrack('x'); // not in the queue (standalone play)
	const state = makeState({
		queue: tracks,
		queuePosition: 0,
		currentTrack: current,
	});
	const next = playerReducer(state, {category: 'MOVE_IN_QUEUE', from: 1, to: 0});
	expect(next.queue.map(track => track.videoId)).toEqual(['b', 'a', 'c']);
	// The moved track must remain the first "up next" — not orphaned
	expect(next.queuePosition).toBe(0);
	expect(next.currentTrack?.videoId).toBe('x');
});

test('MOVE_IN_QUEUE in standalone playback keeps queuePosition at mid-queue', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c', 'd', 'e'].map(makeTrack);
	const current = makeTrack('x'); // not in the queue
	const state = makeState({
		queue: tracks,
		queuePosition: 2,
		currentTrack: current,
	});
	const next = playerReducer(state, {category: 'MOVE_IN_QUEUE', from: 3, to: 2});
	expect(next.queue.map(track => track.videoId)).toEqual(['a', 'b', 'd', 'c', 'e']);
	expect(next.queuePosition).toBe(2);
	expect(next.queue[next.queuePosition]?.videoId).toBe('d');
});

test('MOVE_IN_QUEUE in-queue playback keeps current track position', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c'].map(makeTrack);
	const state = makeState({
		queue: tracks,
		queuePosition: 0,
		currentTrack: tracks[0],
	});
	const next = playerReducer(state, {category: 'MOVE_IN_QUEUE', from: 2, to: 1});
	expect(next.queue.map(track => track.videoId)).toEqual(['a', 'c', 'b']);
	expect(next.queuePosition).toBe(0);
});

test('MOVE_IN_QUEUE adjusts queuePosition when moving into the current slot (in-queue)', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c', 'd'].map(makeTrack);
	const state = makeState({
		queue: tracks,
		queuePosition: 2,
		currentTrack: tracks[2],
	});
	const next = playerReducer(state, {category: 'MOVE_IN_QUEUE', from: 3, to: 2});
	expect(next.queue.map(track => track.videoId)).toEqual(['a', 'b', 'd', 'c']);
	// queuePosition follows the current track to its new index
	expect(next.queuePosition).toBe(3);
	expect(next.currentTrack?.videoId).toBe('c');
});

test('NEXT with shuffle=true and single-track queue falls through sequentially (no-op)', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const track = makeTrack('a');
	const state = makeState({
		shuffle: true,
		queue: [track],
		queuePosition: 0,
		currentTrack: track,
		repeat: 'off',
	});
	// Only 1 track — sequential logic applies, nextPosition (1) >= queue.length (1) → return state
	const next = playerReducer(state, {category: 'NEXT'});
	expect(next.queuePosition).toBe(0); // position unchanged
});

test('NEXT with shuffle=true and multi-track queue returns a different position', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c', 'd', 'e'].map(makeTrack);
	const state = makeState({
		shuffle: true,
		queue: tracks,
		queuePosition: 2,
		currentTrack: tracks[2],
	});

	// Run many times to verify we never stay at position 2
	for (let i = 0; i < 20; i++) {
		const next = playerReducer(state, {category: 'NEXT'});
		expect(next.queuePosition).not.toBe(2);
		expect(
			next.queuePosition >= 0 && next.queuePosition < tracks.length,
			'new position must be in valid range',
		).toBe(true);
		expect(next.progress).toBe(0);
	}
});

test('NEXT with shuffle=false uses sequential order', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c'].map(makeTrack);
	const state = makeState({
		shuffle: false,
		queue: tracks,
		queuePosition: 1,
		currentTrack: tracks[1],
	});
	const next = playerReducer(state, {category: 'NEXT'});
	expect(next.queuePosition).toBe(2);
	expect(next.currentTrack?.videoId).toBe('c');
});

test('NEXT from standalone track added to queue later starts at queue start', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	// Track 'x' was started standalone, then 'a'/'b'/'c' were queued and
	// finally 'x' itself was appended (e.g. via 'q'). queuePosition is still
	// the "up next" pointer at 0, but the current track is NOT at it — NEXT
	// must play the first queued song, not skip it.
	const state = makeState({
		shuffle: false,
		queue: [...['a', 'b', 'c'].map(makeTrack), makeTrack('x')],
		queuePosition: 0,
		currentTrack: makeTrack('x'),
	});
	const next = playerReducer(state, {category: 'NEXT'});
	expect(next.currentTrack?.videoId).toBe('a');
	expect(next.queuePosition).toBe(0);
});

test('NEXT with shuffle=true and standalone track picks from all queued tracks', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['s1', 's2', 't1'].map(makeTrack);
	const state = makeState({
		shuffle: true,
		queue: tracks,
		queuePosition: 0,
		currentTrack: makeTrack('x'), // standalone, not in queue
	});

	// In standalone shuffle the first queued track (index 0) must be eligible.
	let hitZero = false;
	for (let i = 0; i < 30; i++) {
		const next = playerReducer(state, {category: 'NEXT'});
		expect(next.queuePosition).not.toBe(-1);
		if (next.queuePosition === 0) hitZero = true;
	}
	expect(hitZero).toBe(true);
});

test('standalone queue: user additions play before autoplay suggestions', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const current = makeTrack('x');

	// Play X standalone, then autoplay suggestions arrive first.
	let state = makeState({currentTrack: current, queue: [], queuePosition: 0});
	state = playerReducer(state, {
		category: 'ADD_AUTOPLAY_TRACKS',
		tracks: ['t1', 't2', 't3'].map(makeTrack),
	});
	expect(state.queue.map(t => t.videoId)).toEqual(['t1', 't2', 't3']);
	expect(state.explicitQueueLength).toBe(0);

	// User adds two songs via 'q' — they must land ahead of the suggestions.
	state = playerReducer(state, {category: 'ADD_TO_QUEUE', track: makeTrack('s1')});
	state = playerReducer(state, {category: 'ADD_TO_QUEUE', track: makeTrack('s2')});
	expect(state.queue.map(t => t.videoId)).toEqual([
		's1',
		's2',
		't1',
		't2',
		't3',
	]);
	expect(state.explicitQueueLength).toBe(2);

	// Skip must play the first user-added song, not the first suggestion.
	const next = playerReducer(state, {category: 'NEXT'});
	expect(next.currentTrack?.videoId).toBe('s1');
	expect(next.queuePosition).toBe(0);
});

test('standalone queue: suggestions appended while anchored go to the end', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');

	// User queued first, then suggestions arrived — plain append after them.
	let state = makeState({
		currentTrack: makeTrack('x'),
		queue: [],
		queuePosition: 0,
	});
	state = playerReducer(state, {category: 'ADD_TO_QUEUE', track: makeTrack('s1')});
	state = playerReducer(state, {category: 'ADD_TO_QUEUE', track: makeTrack('s2')});
	state = playerReducer(state, {
		category: 'ADD_AUTOPLAY_TRACKS',
		tracks: ['t1', 't2'].map(makeTrack),
	});
	expect(state.queue.map(t => t.videoId)).toEqual(['s1', 's2', 't1', 't2']);

	const next = playerReducer(state, {category: 'NEXT'});
	expect(next.currentTrack?.videoId).toBe('s1');
});

test('PREVIOUS is unaffected by shuffle state', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c'].map(makeTrack);
	const state = makeState({
		shuffle: true,
		queue: tracks,
		queuePosition: 2,
		currentTrack: tracks[2],
		progress: 0,
	});
	const next = playerReducer(state, {category: 'PREVIOUS'});
	expect(next.queuePosition).toBe(1); // always goes to sequential previous
	expect(next.currentTrack?.videoId).toBe('b');
});

test('NEXT with shuffle=true wraps with repeat=all using random pick', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const tracks = ['a', 'b', 'c'].map(makeTrack);
	const state = makeState({
		shuffle: true,
		queue: tracks,
		queuePosition: 0,
		currentTrack: tracks[0],
		repeat: 'all',
	});
	// Shuffle is active and queue has 3 tracks — should always return a position != 0
	for (let i = 0; i < 10; i++) {
		const next = playerReducer(state, {category: 'NEXT'});
		expect(next.queuePosition).not.toBe(0);
	}
});

test('discord rpc service no-ops when disabled', async () => {
	const {getDiscordRpcService} =
		await import('../source/services/discord/discord-rpc.service.ts');
	const rpc = getDiscordRpcService();

	rpc.setEnabled(false);
	await rpc.connect();
	await rpc.updateActivity({
		title: 'Song',
		artist: 'Artist',
		startTimestamp: Date.now(),
	});
	await rpc.clearActivity();

	expect(true).toBe(true);
});

// ── explicitQueueLength maintenance tests ─────────────────────────────────────

test('CLEAR_QUEUE resets explicitQueueLength', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({
		queue: ['a', 'b', 'c'].map(makeTrack),
		explicitQueueLength: 3,
		queuePosition: 1,
	});
	const next = playerReducer(state, {category: 'CLEAR_QUEUE'});
	expect(next.explicitQueueLength).toBe(0);
	expect(next.queue).toEqual([]);
});

test('CLEAR_QUEUE_KEEP_CURRENT resets explicitQueueLength', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({
		queue: ['a', 'b', 'c'].map(makeTrack),
		explicitQueueLength: 3,
	});
	const next = playerReducer(state, {category: 'CLEAR_QUEUE_KEEP_CURRENT'});
	expect(next.explicitQueueLength).toBe(0);
});

test('CLEAR_QUEUE_AFTER_CURRENT clamps explicitQueueLength', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({
		queue: ['a', 'b', 'c', 'd', 'e'].map(makeTrack),
		explicitQueueLength: 5,
		queuePosition: 2,
	});
	const next = playerReducer(state, {category: 'CLEAR_QUEUE_AFTER_CURRENT'});
	expect(next.explicitQueueLength).toBe(3);
	expect(next.queue.map(t => t.videoId)).toEqual(['a', 'b', 'c']);
});

test('SET_QUEUE sets explicitQueueLength to queue length', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const queue = ['x', 'y', 'z'].map(makeTrack);
	const next = playerReducer(makeState(), {category: 'SET_QUEUE', queue});
	expect(next.explicitQueueLength).toBe(3);
});

test('REMOVE_FROM_QUEUE decrements explicitQueueLength for explicit region', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({
		queue: ['a', 'b', 't1', 't2'].map(makeTrack),
		explicitQueueLength: 2,
		queuePosition: 0,
	});
	// Remove from explicit region (index 1 < explicitQueueLength 2)
	const next = playerReducer(state, {category: 'REMOVE_FROM_QUEUE', index: 1});
	expect(next.explicitQueueLength).toBe(1);
});

test('REMOVE_FROM_QUEUE does not decrement explicitQueueLength for autoplay region', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');
	const state = makeState({
		queue: ['a', 'b', 't1', 't2'].map(makeTrack),
		explicitQueueLength: 2,
		queuePosition: 0,
	});
	// Remove from autoplay region (index 2 >= explicitQueueLength 2)
	const next = playerReducer(state, {category: 'REMOVE_FROM_QUEUE', index: 2});
	expect(next.explicitQueueLength).toBe(2);
});

test('standalone queue: stale explicitQueueLength does not break user additions', async () => {
	const {playerReducer} = await import('../source/stores/player.store.tsx');

	// Simulate a previously populated queue that was cleared (CLEAR_QUEUE
	// now resets explicitQueueLength, but verify the behavior is correct
	// even when starting from a clean CLEAR_QUEUE).
	let state = makeState({
		currentTrack: makeTrack('x'),
		queue: ['a', 'b', 'c'].map(makeTrack),
		explicitQueueLength: 3,
		queuePosition: 1,
	});

	// Clear the queue (simulates user clicking a new song)
	state = playerReducer(state, {category: 'CLEAR_QUEUE'});
	expect(state.explicitQueueLength).toBe(0);

	// Autoplay suggestions arrive
	state = playerReducer(state, {
		category: 'ADD_AUTOPLAY_TRACKS',
		tracks: ['t1', 't2', 't3'].map(makeTrack),
	});

	// User queues two tracks – must land before suggestions
	state = playerReducer(state, {category: 'ADD_TO_QUEUE', track: makeTrack('s1')});
	state = playerReducer(state, {category: 'ADD_TO_QUEUE', track: makeTrack('s2')});

	expect(state.queue.map(t => t.videoId)).toEqual([
		's1',
		's2',
		't1',
		't2',
		't3',
	]);
	expect(state.explicitQueueLength).toBe(2);
});
