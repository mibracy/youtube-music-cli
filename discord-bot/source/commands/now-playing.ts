import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('now-playing')
	.setDescription('Show the currently playing track');

export function execute(
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
): void {
	const player = playerManager.get(interaction.guild!.id);

	if (!player || !player.currentTrack) {
		void interaction.reply({
			content: 'Nothing is currently playing.',
			ephemeral: true,
		});
		return;
	}

	const track = player.currentTrack!;
	const artistStr = track.artists?.map(a => a.name).join(', ') || 'Unknown';

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle(track.title)
		.setDescription(artistStr)
		.setFooter({
			text: player.isPaused ? 'Paused' : 'Now Playing',
		});

	void interaction.reply({embeds: [embed]});
}
