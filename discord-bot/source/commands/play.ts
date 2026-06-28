import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	type MessageComponentInteraction,
	type StringSelectMenuInteraction,
	StringSelectMenuBuilder,
	SlashCommandBuilder,
	type Client,
} from 'discord.js';
import {getMusicService} from '../../../source/services/youtube-music/api.ts';
import type {Track} from '../../../source/types/youtube-music.types.ts';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('play')
	.setDescription('Search YouTube Music and play a track')
	.addStringOption(option =>
		option
			.setName('query')
			.setDescription('Song name, artist, or YouTube URL')
			.setRequired(true),
	);

export async function execute(
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
	client: Client,
): Promise<void> {
	await interaction.deferReply();

	const query = interaction.options.getString('query', true);
	const musicService = getMusicService();

	try {
		const searchResults = await musicService.search(query, {type: 'songs'});

		if (searchResults.results.length === 0) {
			await interaction.editReply({content: 'No results found.'});
			return;
		}

		const tracks = searchResults.results
			.filter(r => r.type === 'song')
			.slice(0, 10)
			.map(r => r.data) as Track[];

		if (tracks.length === 0) {
			await interaction.editReply({content: 'No song results found.'});
			return;
		}

		if (tracks.length === 1) {
			await playTrack(interaction, playerManager, tracks[0]!, client);
			return;
		}

		const menu = new StringSelectMenuBuilder()
			.setCustomId('track_select')
			.setPlaceholder('Select a track to play')
			.addOptions(
				tracks.map(track => ({
					label: track.title.slice(0, 100),
					description:
						track.artists
							?.map(a => a.name)
							.join(', ')
							.slice(0, 100) || undefined,
					value: track.videoId,
				})),
			);

		const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			menu,
		);

		const reply = await interaction.editReply({
			content: `Search results for "${query}":`,
			components: [row],
		});

		const filter = (i: MessageComponentInteraction) =>
			i.customId === 'track_select' && i.user.id === interaction.user.id;

		const collector = reply.createMessageComponentCollector({
			filter,
			time: 30_000,
		});

		collector.on('collect', async selectInteraction => {
			collector.stop();
			const si = selectInteraction as StringSelectMenuInteraction;
			const videoId = si.values[0]!;
			const track = tracks.find(t => t.videoId === videoId);

			if (!track) {
				await si.update({content: 'Track not found.', components: []});
				return;
			}

			await si.update({
				content: `Loading **${track.title}**...`,
				components: [],
			});

			await playTrack(interaction, playerManager, track, client);
		});

		collector.on('end', async (_, reason) => {
			if (reason === 'time') {
				await interaction
					.editReply({content: 'Selection timed out.', components: []})
					.catch(() => {});
			}
		});
	} catch (error) {
		console.error('[Play] Error:', error);
		await interaction.editReply({
			content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
		});
	}
}

async function playTrack(
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
	track: Track,
	client: Client,
): Promise<void> {
	try {
		const player = await playerManager.ensureJoined(
			interaction.guild!,
			interaction.user.id,
			client,
		);

		const wasEmpty = player.queue.length === 0;
		await player.play(track);

		const artistStr = track.artists?.map(a => a.name).join(', ') || 'Unknown';
		await interaction.editReply({
			content: wasEmpty
				? `Playing **${track.title}** — ${artistStr}`
				: `Added to queue: **${track.title}** — ${artistStr}`,
		});
	} catch (error) {
		await interaction.editReply({
			content: `Error: ${error instanceof Error ? error.message : 'Failed to play track'}`,
		});
	}
}
