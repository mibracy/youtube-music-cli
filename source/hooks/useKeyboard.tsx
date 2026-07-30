// Keyboard input handling hook
import {useEffect, useRef} from 'react';
import {useInput} from 'ink';
import {logger} from '../services/logger/logger.service.ts';
import {getPlayerService} from '../services/player/player.service.ts';
import {useKeyboardBlockContext} from './useKeyboardBlocker.tsx';

type KeyHandler = () => void;
type RegistryEntry = {
	keys: readonly string[];
	handler: KeyHandler;
	bypassBlock?: boolean;
};

// Global registry for key handlers
const registry: Set<RegistryEntry> = new Set();

// Shared throttle for arrow key events (prevents mouse scroll from jumping multiple items)
let lastArrowTime = 0;
export function throttleArrowKey(): boolean {
	const now = Date.now();
	if (now - lastArrowTime < 80) return true;
	lastArrowTime = now;
	return false;
}

// Callback to navigate to home (registered by MainLayout)
let goHomeCallback: (() => void) | null = null;

/**
 * Register a callback to navigate to home (used for Ctrl+C in certain views)
 */
export function registerGoHomeCallback(callback: () => void): void {
	goHomeCallback = callback;
}

/**
 * Function to set the current view for Ctrl+C handling
 * This should be called by the app to track which view we're in
 */
let currentView: string = 'home';

export function setCurrentViewForCtrlC(view: string): void {
	currentView = view;
}

/**
 * Hook to bind keyboard shortcuts.
 * This uses a centralized manager to avoid multiple useInput calls and memory leaks.
 * Uses a ref-based approach to always call the latest handler without stale closures.
 */
export function useKeyBinding(
	keys: readonly string[],
	handler: () => void,
	options?: {bypassBlock?: boolean},
): void {
	const handlerRef = useRef(handler);

	useEffect(() => {
		handlerRef.current = handler;
	});

	useEffect(() => {
		const entry: RegistryEntry = {
			keys,
			handler: () => handlerRef.current(),
			bypassBlock: options?.bypassBlock,
		};

		// Log registration of volume down key for debugging
		if (keys.includes('-') || keys.some(k => k.includes('-'))) {
			logger.debug('KeyboardManager', 'Registered keybinding for "-"', {
				keys,
				bypassBlock: options?.bypassBlock,
				stack: new Error().stack,
			});
		}

		registry.add(entry);

		return () => {
			registry.delete(entry);
			if (keys.includes('-') || keys.some(k => k.includes('-'))) {
				logger.debug('KeyboardManager', 'Unregistered keybinding for "-"', {
					keys,
				});
			}
		};
	}, [keys, options?.bypassBlock]); // keys and bypassBlock are deps; handlerRef is a stable ref
}

/**
 * Global Keyboard Manager Component
 * This should be rendered once at the root of the app.
 */
// :q quit sequence state
let quitSequence = 0; // 0=idle, 1=colon pressed, 2=q pressed after colon
const quitSequenceListeners: Set<(state: number) => void> = new Set();

export function subscribeToQuitSequence(
	listener: (state: number) => void,
): () => void {
	quitSequenceListeners.add(listener);
	return () => {
		quitSequenceListeners.delete(listener);
	};
}

export function getQuitSequence(): number {
	return quitSequence;
}

// Search type cycle signal
const cycleSearchTypeCallbacks: Set<(shiftHeld: boolean) => void> = new Set();

export function subscribeToSearchTypeCycle(
	callback: (shiftHeld: boolean) => void,
): () => void {
	cycleSearchTypeCallbacks.add(callback);
	return () => {
		cycleSearchTypeCallbacks.delete(callback);
	};
}

function triggerSearchTypeCycle(shiftHeld: boolean): void {
	for (const cb of cycleSearchTypeCallbacks) {
		cb(shiftHeld);
	}
}

function setQuitSequence(state: number): void {
	quitSequence = state;
	for (const listener of quitSequenceListeners) {
		listener(state);
	}
}

export function KeyboardManager() {
	const {blockCount} = useKeyboardBlockContext();
	const lastNavTime = useRef(0);

	useEffect(() => {
		// Explicitly disable various terminal mouse reporting modes to prevent
		// interference from mouse clicks/scrolls being misinterpreted as keyboard input.
		// Standard, VT200, Any-event, SGR, and URXVT modes.
		process.stdout.write(
			'\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l',
		);
	}, []);

	useInput((input, key) => {
		// 1. Filter out mouse sequences and other non-keyboard input.
		// Special keys recognized by Ink (Arrows, Return, etc.) are allowed even if they start with \x1b.
		const isKnownSpecialKey =
			key.upArrow ||
			key.downArrow ||
			key.leftArrow ||
			key.rightArrow ||
			key.return ||
			key.escape ||
			key.backspace ||
			key.delete ||
			key.tab ||
			key.pageUp ||
			key.pageDown ||
			key.home ||
			key.end;

		// Ignore ANSI sequences that Ink didn't recognize as special keys.
		if (input.startsWith('\x1b') && !isKnownSpecialKey) {
			return;
		}

		// Ignore multi-character input that isn't recognized (likely mouse chunks or paste).
		if (input.length > 1 && !isKnownSpecialKey) {
			return;
		}

		// :q quit sequence
		if (quitSequence === 0 && input === ':' && !key.ctrl && !key.meta) {
			setQuitSequence(1);
			return;
		}

		if (quitSequence === 1) {
			if (input === 'q' && !key.ctrl && !key.meta) {
				setQuitSequence(2);
				return;
			}

			setQuitSequence(0);
		} else if (quitSequence === 2) {
			if (key.return) {
				process.exit(0);
			}

			setQuitSequence(0);
		}

		if (blockCount > 0) {
			// When keyboard input is blocked (e.g., within a focused text input),
			// check if any entry has bypassBlock flag and matches this key.
			// First check for Ctrl+C special case - go to home in search view

			// Tab to cycle search type
			if (key.tab && currentView === 'search') {
				triggerSearchTypeCycle(key.shift ?? false);
				return;
			}

			if (key.ctrl && input === 'c') {
				if (currentView === 'search') {
					if (goHomeCallback) {
						goHomeCallback();
					}

					return;
				}

				// In other views, quit the app
				process.exit(0);
			}

			for (const entry of registry) {
				if (entry.bypassBlock) {
					for (const binding of entry.keys) {
						const lowerBinding = binding.toLowerCase();

						// Check for ESC key (most common bypass case)
						if (lowerBinding === 'escape' && key.escape) {
							entry.handler();
							return;
						}

						// Handle other bypass keys
						const isMatch =
							((lowerBinding === 'return' || lowerBinding === 'enter') &&
								key.return) ||
							(lowerBinding === 'backspace' && key.backspace) ||
							(lowerBinding === 'tab' && key.tab) ||
							(lowerBinding === 'up' && key.upArrow) ||
							(lowerBinding === 'down' && key.downArrow) ||
							(lowerBinding === 'left' && key.leftArrow) ||
							(lowerBinding === 'right' && key.rightArrow) ||
							(lowerBinding === 'pageup' && key.pageUp) ||
							(lowerBinding === 'pagedown' && key.pageDown) ||
							(() => {
								// Throttle bypass arrow keys too
								if (
									key.upArrow ||
									key.downArrow ||
									key.leftArrow ||
									key.rightArrow
								) {
									if (throttleArrowKey()) return false;
								}
								const parts = lowerBinding.split('+');
								const hasCtrl = parts.includes('ctrl');
								const hasMeta = parts.includes('meta') || parts.includes('alt');
								const hasShift = parts.includes('shift');

								// Robust main key detection (handles '+' correctly)
								let mainKey = '';
								if (lowerBinding === '+') {
									mainKey = '+';
								} else if (lowerBinding.endsWith('++')) {
									mainKey = '+';
								} else if (lowerBinding.endsWith('+') && parts.length > 1) {
									mainKey = '+';
								} else {
									mainKey = parts[parts.length - 1]!;
								}

								if (hasCtrl && !key.ctrl) return false;
								if (hasMeta && !key.meta) return false;
								if (hasShift && !key.shift) return false;

								// Check arrow keys
								if (mainKey === 'up' && key.upArrow) return true;
								if (mainKey === 'down' && key.downArrow) return true;
								if (mainKey === 'left' && key.leftArrow) return true;
								if (mainKey === 'right' && key.rightArrow) return true;

								// Handle '=' and '+'
								if (mainKey === '=' && input === '=') return true;
								if (mainKey === '+' && input === '+') return true;
								if (mainKey === '+' && key.shift && input === '=') return true;

								return (
									input.toLowerCase() === mainKey && !key.ctrl && !key.meta
								);
							})();

						if (isMatch) {
							logger.debug(
								'KeyboardManager',
								'Bypass block: handler triggered',
								{
									binding,
									input,
									key: {ctrl: key.ctrl, shift: key.shift, meta: key.meta},
								},
							);
							entry.handler();
							return;
						}
					}
				}
			}
			return;
		}

		// Tab to cycle search type
		if (key.tab && currentView === 'search') {
			triggerSearchTypeCycle(key.shift ?? false);
			return;
		}

		// Seek with left/right arrows
		if (key.leftArrow) {
			getPlayerService().seekRelative(-5);
			return;
		}

		if (key.rightArrow) {
			getPlayerService().seekRelative(5);
			return;
		}

		// Debug logging for key presses - ENHANCED for volume investigation
		if (input || key.ctrl || key.meta || key.shift) {
			const isVolumeKey = input === '+' || input === '=' || input === '-';
			logger.debug('KeyboardManager', 'Key pressed', {
				input,
				ctrl: key.ctrl,
				meta: key.meta,
				shift: key.shift,
				upArrow: key.upArrow,
				downArrow: key.downArrow,
				leftArrow: key.leftArrow,
				rightArrow: key.rightArrow,
				isVolumeKey,
				blockCount,
			});
		}

		// Dispatch to registered handlers
		for (const entry of registry) {
			const {keys, handler} = entry;

			for (const binding of keys) {
				const lowerBinding = binding.toLowerCase();

				// A. Match Special Keys (Highest precedence)
				const isSpecialMatch =
					(lowerBinding === 'up' && key.upArrow) ||
					(lowerBinding === 'down' && key.downArrow) ||
					(lowerBinding === 'left' && key.leftArrow) ||
					(lowerBinding === 'right' && key.rightArrow) ||
					(lowerBinding === 'escape' && key.escape) ||
					(lowerBinding === 'return' && key.return) ||
					(lowerBinding === 'enter' && key.return) ||
					(lowerBinding === 'tab' && key.tab) ||
					(lowerBinding === 'backspace' && key.backspace) ||
					(lowerBinding === 'pageup' && key.pageUp) ||
					(lowerBinding === 'pagedown' && key.pageDown);

				if (isSpecialMatch) {
					// Throttle up/down to prevent mouse scroll from moving multiple items
					if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
						const now = Date.now();
						if (now - lastNavTime.current < 80) return;
						lastNavTime.current = now;
					}

					handler();
					return; // STOP: prevent double-dispatch
				}

				// B. Match Combination and Character keys
				const parts = lowerBinding.split('+');
				const hasCtrl = parts.includes('ctrl');
				const hasMeta = parts.includes('meta') || parts.includes('alt');
				const hasShift = parts.includes('shift');

				// Robust main key detection (handles '+')
				let mainKey = '';
				if (lowerBinding === '+') {
					mainKey = '+';
				} else if (lowerBinding.endsWith('++')) {
					mainKey = '+';
				} else if (lowerBinding.endsWith('+') && parts.length > 1) {
					mainKey = '+';
				} else {
					mainKey = parts[parts.length - 1]!;
				}

				// Check modifiers
				if (hasCtrl && !key.ctrl) continue;
				if (hasMeta && !key.meta) continue;

				// Shift handling: block lowercase letter bindings when shift is active,
				// but allow symbol keys like '+' or '=' to work regardless.
				const isLetter = /^[a-z]$/.test(mainKey);
				if (hasShift) {
					const uppercaseMatch =
						input.length === 1 &&
						input === input.toUpperCase() &&
						input.toLowerCase() === mainKey;
					if (!key.shift && !uppercaseMatch) continue;
				} else if (
					isLetter &&
					(key.shift || (input.length === 1 && input !== input.toLowerCase()))
				) {
					// Block 'p' if user typed 'P'
					continue;
				}

				// Handle Ctrl+letter (control characters)
				if (hasCtrl && isLetter && input.length === 1) {
					const charCode = input.charCodeAt(0);
					// Control codes for A-Z are 1-26 (SOH to Z)
					if (charCode >= 1 && charCode <= 26) {
						const derived = String.fromCharCode(charCode + 64); // 'A'-'Z'
						if (derived.toLowerCase() === mainKey) {
							handler();
							return;
						}
					}
				}

				// Check for symbol/char match
				const inputLower = input.toLowerCase();
				const isSymbolMatch =
					(mainKey === '=' && input === '=') ||
					(mainKey === '+' && input === '+') ||
					(mainKey === '+' && key.shift && input === '=') ||
					(mainKey === '-' && input === '-');

				if (
					isSymbolMatch ||
					(inputLower === mainKey && !key.ctrl && !key.meta)
				) {
					// Enhanced logging for volume keys
					if (mainKey === '-' || mainKey === '+' || mainKey === '=') {
						logger.debug('KeyboardManager', 'Volume key handler triggered', {
							binding,
							mainKey,
							input,
							keyShifts: {ctrl: key.ctrl, meta: key.meta, shift: key.shift},
							isSymbolMatch,
							stack: new Error().stack,
							registrySize: registry.size,
						});
					}

					handler();
					return; // STOP: prevent double-dispatch
				}
			}
		}
	});

	return null;
}
