# Upstream Merge Audit Report

**Date:** July 30, 2026  
**Branch:** main-sync  
**Merge Commit:** d8f1315  
**Commits Audited:** 86 from upstream/main

---

## Executive Summary

The upstream has been heavily focused on:

1. **Web UI ("Phosphor Console")** - ~15 commits
2. **Win32 Immersive Desktop Mode** - ~8 commits
3. **Internet Radio & Live Streams** - ~6 commits
4. **Local Media Downloads** - ~5 commits
5. **Core playback fixes** - ~12 commits (HIGH VALUE)
6. **Infrastructure/CI** - ~20 commits (MEDIUM VALUE)
7. **Documentation/Releases** - ~20 commits (LOW VALUE)

**Recommendation:** Cherry-pick the playback fixes and critical bug fixes. Deprioritize web UI, Win32 immersive features, and extensive documentation work.

---

## Detailed Commit Analysis

### 🔴 HIGH PRIORITY - Core Playback & Player Fixes

These commits fix critical playback issues that affect the TUI experience:

| Commit    | Description                                                                                       | Impact                                     | Action    |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------- |
| `53d17cd` | fix(player): restore playback when subtitles enabled with mpv 0.41+                               | **CRITICAL** - mpv subtitle flag change    | ✅ KEEP   |
| `c277e3b` | fix: reconnect mpv IPC when UI and playback desync                                                | **CRITICAL** - prevents player hangs       | ✅ KEEP   |
| `9765a9c` | fix(player): cover IPC delay window and abort stale resume awaits                                 | **CRITICAL** - race condition fix          | ✅ KEEP   |
| `95acc49` | fix(player): await in-flight IPC connection in resume()                                           | **CRITICAL** - prevents track restart bugs | ✅ KEEP   |
| `d390f17` | fix: resolve mpv IPC crashes and unify favorites persistence                                      | **HIGH** - stability improvement           | ✅ KEEP   |
| `86ff82f` | fix memory leak                                                                                   | **HIGH** - performance/stability           | ✅ KEEP   |
| `efca3c6` | fix react hooks                                                                                   | **MEDIUM** - React best practices          | ⚠️ REVIEW |
| `eaa4727` | fix: prevent infinite loop on unavailable tracks, fix playlist name resolution, add proxy support | **HIGH** - prevents hangs, adds proxy      | ✅ KEEP   |

**Total: 8 commits - ALL should be kept**

---

### 🟡 MEDIUM PRIORITY - TUI/CLI Enhancements

Features that enhance the terminal experience:

| Commit    | Description                                                            | Impact                                    | Action                                              |
| --------- | ---------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `5febede` | feat: add internet radio streams view for Ink TUI and immersive mode   | **MEDIUM** - new feature, adds complexity | ⚠️ REVIEW - May conflict with fork simplicity goals |
| `42a563f` | feat: add live streams view and queue/history UX                       | **MEDIUM** - new feature                  | ⚠️ REVIEW - Evaluate if needed                      |
| `ca3f29d` | feat: enrich radio streams with Radio Browser, metadata, and favorites | **MEDIUM** - radio enhancement            | ⚠️ REVIEW - Depends on radio feature                |
| `1428c3b` | Fix stream/radio resume, web sync, and add Live radio UI               | **MEDIUM** - bug fixes + feature          | ⚠️ REVIEW - Fixes are good, UI may conflict         |
| `2d08033` | feat: add logs and config doctor CLI commands                          | **LOW** - debugging tools                 | ⚠️ REVIEW - Nice to have                            |
| `68608df` | feat: cookies, stats share, log rotation, history, and bun tests       | **MEDIUM** - multiple features            | ⚠️ REVIEW - Break into pieces                       |
| `9ce89ba` | fix: restore downloads via yt-dlp/youtubei and improve download UX     | **MEDIUM** - download feature             | ⚠️ REVIEW - If fork uses downloads                  |
| `def7129` | feat: show Local media source and document release assets              | **LOW** - local media feature             | ⚠️ REVIEW - May not be needed                       |
| `9f6eac2` | feat: local-play settings, videoId filenames, and multi-arch releases  | **LOW** - local media enhancement         | ⚠️ REVIEW                                           |
| `bc37062` | feat: prefer local downloads and clean agent/install tooling           | **LOW** - download preference             | ⚠️ REVIEW                                           |

**Total: 10 commits - Review selectively based on fork's feature needs**

---

### 🟢 LOW PRIORITY - Win32 Immersive Mode (Desktop App Focus)

Upstream's Windows desktop app direction (conflicts with fork's TUI focus):

| Commit    | Description                                                                  | Impact                   | Action                          |
| --------- | ---------------------------------------------------------------------------- | ------------------------ | ------------------------------- |
| `ab8e070` | feat(immersive): TUI volume keys and tray context menu                       | **LOW** - Win32 specific | ❌ SKIP - Fork has own keybinds |
| `f19b4f8` | fix(immersive): auto-advance queue without pausing between tracks            | **LOW** - Win32 specific | ❌ SKIP                         |
| `f1e9ff4` | fix(immersive): align mpv playback sync with Ink TUI                         | **LOW** - Win32 specific | ❌ SKIP                         |
| `fe4667c` | cursor (immersive related)                                                   | **LOW** - Win32 specific | ❌ SKIP                         |
| `fe7e133` | fix(immersive): keep favorites queue playing with shuffle and repeat-all     | **LOW** - Win32 specific | ❌ SKIP                         |
| `cc19e04` | feat(immersive): add Spotify-like autoplay for Win32 mode                    | **LOW** - Win32 specific | ❌ SKIP                         |
| `125b4bf` | feat(immersive): Spotify-like infinite autoplay for Win32                    | **LOW** - Win32 specific | ❌ SKIP                         |
| `d0791ef` | feat(immersive): Win32 library favorites, playlist edit, and add-to-playlist | **LOW** - Win32 specific | ❌ SKIP                         |
| `5cec0e5` | cursor (immersive related)                                                   | **LOW** - Win32 specific | ❌ SKIP                         |

**Total: 9 commits - ALL can be skipped (upstream's desktop app direction)**

---

### 🔵 LOW PRIORITY - Web UI ("Phosphor Console")

Web interface features (not relevant to TUI-focused fork):

| Commit    | Description                                                | Impact                     | Action                        |
| --------- | ---------------------------------------------------------- | -------------------------- | ----------------------------- |
| `e80d361` | feat(web): Phosphor Console responsive companion UI        | **LOW** - Web UI overhaul  | ❌ SKIP - Fork is TUI-focused |
| `6091a45` | feat(web): add favorites with heart toggle and play random | **LOW** - Web UI feature   | ❌ SKIP                       |
| `2101684` | fix(web): ship dist/web with build and resolve static path | **LOW** - Web UI build fix | ❌ SKIP                       |
| `24b2994` | fix(web): align react and react-dom to 19.2.8              | **LOW** - Web UI deps      | ❌ SKIP                       |
| `a1efe25` | chore: format web docs and option tables                   | **LOW** - Web docs         | ❌ SKIP                       |

**Total: 5 commits - ALL can be skipped (web UI not in fork scope)**

---

### ⚪ MAINTENANCE - Infrastructure, CI, Dependencies

| Commit                                   | Description                                                           | Impact                    | Action                           |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------- | -------------------------------- |
| `5a484b6`                                | fix(ci): exclude compiled binaries from npm package                   | **MEDIUM** - CI fix       | ⚠️ REVIEW - If using npm publish |
| `99e78f8`                                | chore(deps): upgrade chalk from 5                                     | **LOW** - Dep upgrade     | ⚠️ REVIEW - Breaking changes?    |
| `f50d651`                                | deps(deps-dev): bump chalk from 5.6.2 to 6.0.0                        | **LOW** - Dep upgrade     | ⚠️ REVIEW                        |
| `8ee5c49`                                | chore(deps): bump ink, react, eslint, prettier, and typescript-eslint | **MEDIUM** - Core deps    | ⚠️ REVIEW - May affect TUI       |
| `02b9dbc`                                | chore(deps): bump ws, eslint, tsx, and typescript-eslint              | **LOW** - Dev deps        | ⚠️ REVIEW                        |
| `ae958ab`                                | packages updated                                                      | **LOW** - Generic update  | ⚠️ REVIEW                        |
| `4aa17d3`                                | fix(static-file-service): correct path traversal validation           | **MEDIUM** - Security fix | ✅ KEEP - Security important     |
| `def30ff`                                | added bun-win32 skill                                                 | **LOW** - Win32 tooling   | ❌ SKIP                          |
| Multiple `chore(homebrew)` commits       | Homebrew formula updates                                              | **LOW** - macOS packaging | ❌ SKIP - Not relevant to fork   |
| Multiple version commits (v0.0.88-0.1.1) | Release version bumps                                                 | **LOW** - Metadata only   | ❌ SKIP                          |
| Multiple "cursor" commits                | Editor/tool generated                                                 | **LOW** - No context      | ❌ SKIP                          |
| Multiple merge commits                   | Upstream merge commits                                                | **LOW** - Metadata        | ❌ SKIP                          |

**Total: ~35 commits - Selectively review security and core dep updates**

---

### 📊 Summary by Category

| Category                   | Count | Recommendation                                  |
| -------------------------- | ----- | ----------------------------------------------- |
| **Core Playback Fixes**    | 8     | ✅ **KEEP ALL** - Critical for stability        |
| **TUI/CLI Enhancements**   | 10    | ⚠️ **Review** - Cherry-pick based on fork goals |
| **Win32 Immersive**        | 9     | ❌ **SKIP ALL** - Upstream's desktop direction  |
| **Web UI**                 | 5     | ❌ **SKIP ALL** - Not TUI-focused               |
| **Infrastructure/CI**      | ~35   | ⚠️ **Selective** - Security fixes only          |
| **Documentation/Releases** | ~19   | ❌ **SKIP** - Metadata only                     |

---

## 🎯 Recommended Action Plan

### Phase 1: Extract Critical Fixes (Immediate)

Cherry-pick these 8 commits for immediate stability:

1. `53d17cd` - mpv 0.41+ subtitle fix
2. `c277e3b` - IPC reconnect fix
3. `9765a9c` - IPC delay window fix
4. `95acc49` - IPC resume await fix
5. `d390f17` - IPC crash fix
6. `86ff82f` - Memory leak fix
7. `eaa4727` - Infinite loop prevention
8. `4aa17d3` - Security path traversal fix

### Phase 2: Evaluate TUI Features (Optional)

Review these if you want radio/live streams:

- `5febede` - Internet radio for TUI
- `42a563f` - Live streams view
- `ca3f29d` - Radio Browser integration

**Warning:** These add complexity and may conflict with your fork's simplified approach.

### Phase 3: Dependency Updates (Cautious)

Only update if needed:

- `8ee5c49` - Core deps (ink, react) - **Test thoroughly**
- `99e78f8` / `f50d651` - Chalk upgrade - **Check breaking changes**

---

## ⚠️ Conflict Warnings

Based on your fork's focus on TUI layout/keybinds perfection:

1. **Immersive Mode Changes** - Upstream added extensive Win32 immersive code that may conflict with your TUI customizations
2. **Web UI Overlays** - Phosphor Console adds web components that could bloat the codebase
3. **Radio/Live Streams** - New views and state management that may not align with your simplified approach
4. **Favorites System** - Upstream unified favorites across TUI/web/immersive - may need review if you customized this

---

## 📝 Next Steps

1. **Audit Current State:** Check if any upstream changes broke your TUI layout/keybinds
2. **Cherry-Pick Critical Fixes:** Start with the 8 playback fixes
3. **Test Thoroughly:** Run your TUI with each cherry-picked commit
4. **Reject Unwanted Features:** Consider reverting radio/live streams if they conflict
5. **Lock Down Your Customizations:** Document your fork's keybind/layout decisions to prevent future upstream conflicts

---

## 🔍 Files Most Likely to Conflict

Based on the merge, these files saw major changes:

- `source/services/player/*` - IPC and playback logic
- `source/stores/favorites.store.tsx` - Favorites unification
- `source/components/*` - New radio/live views added
- `source/immersive/*` - Extensive Win32 changes (can ignore)
- `web/*` - Complete web UI overhaul (can ignore)

---

**Bottom Line:** The upstream brought valuable stability fixes but also significant feature bloat (web UI, Win32 desktop mode, radio streams). Your fork should cherry-pick the 8 critical playback fixes and skip the feature additions that conflict with your TUI-focused vision.
