import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('queue')
	.setDescription('View the current queue');

export function execute(
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
): void {
	const player = playerManager.get(interaction.guild!.id);

	if (!player) {
		void interaction.reply({
			content: 'Not currently in a voice channel.',
			ephemeral: true,
		});
		return;
	}

	const state = player.getState();
	const embed = new EmbedBuilder().setColor(0x5865f2);

	if (state.currentTrack) {
		const artistStr =
			state.currentTrack.artists?.map(a => a.name).join(', ') || 'Unknown';
		embed.addFields({
			name: 'Now Playing',
			value: `**${state.currentTrack.title}** — ${artistStr}`,
		});
	}

	if (state.queue.length === 0) {
		embed.setDescription('Queue is empty.');
	} else {
		const queueList = state.queue
			.map((track, i) => {
				const artistStr =
					track.artists?.map(a => a.name).join(', ') || 'Unknown';
				const prefix = i === state.queuePosition ? '▶ ' : `${i + 1}. `;
				return `${prefix}**${track.title}** — ${artistStr}`;
			})
			.join('\n');

		embed.addFields({
			name: `Queue (${state.queue.length} tracks)`,
			value:
				queueList.length > 1024
					? queueList.slice(0, 1000) + '\n...'
					: queueList,
		});
	}

	embed.setFooter({
		text: state.isPlaying ? 'Now playing' : state.isPaused ? 'Paused' : 'Idle',
	});

	void interaction.reply({embeds: [embed]});
}
