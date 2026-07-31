---
layout: default
title: Configuration
---

# Configuration

youtube-music-cli stores its configuration in `~/.youtube-music-cli/config.json`.

## Configuration File

```json
{
	"theme": "dark",
	"volume": 70,
	"shuffle": false,
	"repeat": "off",
	"streamQuality": "high",
	"gaplessPlayback": true,
	"equalizerPreset": "flat",
	"downloadsEnabled": false,
	"downloadDirectory": "D:/Music/youtube-music-cli",
	"downloadFormat": "mp3"
}
```

## Options

### theme

The visual theme for the TUI.

| Value      | Description                  |
| ---------- | ---------------------------- |
| `dark`     | Dark theme (default)         |
| `light`    | Light theme                  |
| `midnight` | Deep blue theme              |
| `matrix`   | Green on black, Matrix-style |

**CLI flag:** `--theme` or `-t`

```bash
youtube-music-cli --theme=matrix
```

### volume

Initial playback volume (0-100).

**Default:** `70`

**CLI flag:** `--volume` or `-v`

```bash
youtube-music-cli --volume=80
```

### shuffle

Enable shuffle mode on startup.

**Default:** `false`

**CLI flag:** `--shuffle` or `-s`

```bash
youtube-music-cli --shuffle
```

### repeat

Repeat mode on startup.

| Value | Description          |
| ----- | -------------------- |
| `off` | No repeat (default)  |
| `all` | Repeat entire queue  |
| `one` | Repeat current track |

**CLI flag:** `--repeat` or `-r`

```bash
youtube-music-cli --repeat=all
```

### streamQuality

Audio streaming quality.

| Value    | Bitrate   | Description            |
| -------- | --------- | ---------------------- |
| `low`    | ~64kbps   | Save bandwidth         |
| `medium` | ~128kbps  | Balanced               |
| `high`   | ~256kbps+ | Best quality (default) |

**Note:** Change via Settings menu (`,` key) in the TUI.

### gaplessPlayback

Enable or disable mpv's gapless audio flag. When turned on (default), mpv will avoid inserting silence between tracks when possible.

**Default:** `true`

### equalizerPreset

Selects a preconfigured mpv equalizer stack (`flat`, `bass_boost`, `vocal`, `bright`, `warm`). The menu cycles through the presets so you can tailor tonal balance.

**Default:** `flat`

## Search Filters (TUI)

Use the Search view's filter shortcuts to narrow down results:

- `Ctrl+A`: Set an artist name fragment to match against artist/track metadata.
- `Ctrl+L`: Set an album filter that matches album or playlist titles.
- `Ctrl+Y`: Supply a year or numeric fragment that will be matched against track/album/playlist names.
- `Ctrl+D`: Cycle through duration buckets (`Any`, `short <3m`, `medium 3-5m`, `long >5m`).

Filters are applied client-side and will immediately update the results list without re-running the API search.

### downloadsEnabled

Enable or disable `Shift+D` downloads in the TUI.

**Default:** `false`

### downloadDirectory

Base folder where downloaded files are saved.

Downloaded files are organized as:

`<downloadDirectory>/<artist>/<album>/<title>.<ext>`

**Default:** `<configDir>/downloads`

### downloadFormat

Output format for downloads.

| Value | Description         |
| ----- | ------------------- |
| `mp3` | MP3 with ID3 tags   |
| `m4a` | AAC/M4A tagged file |

**Default:** `mp3`

## Config Directory Structure

```
~/.youtube-music-cli/
├── config.json           # Main configuration
├── favorites.json        # Favorite tracks collection
├── downloads/            # Default download folder
├── plugins/              # Installed plugins
│   ├── adblock/
│   └── lyrics/
└── plugin-permissions.json  # Plugin permissions
```

## Environment Variables

| Variable                   | Description                      |
| -------------------------- | -------------------------------- |
| `YOUTUBE_MUSIC_CLI_CONFIG` | Override config directory        |
| `DEBUG`                    | Enable debug logging (`DEBUG=*`) |

## Resetting Configuration

Delete the config file to reset to defaults:

```bash
rm ~/.youtube-music-cli/config.json
```

## Editing Configuration

You can edit `config.json` directly while youtube-music-cli is not running, or use the Settings menu (`,` key) in the TUI.

## Download Metadata

Downloaded files include metadata tags when available:

- `title`
- `artist`
- `album`
- cover art (thumbnail) when available
