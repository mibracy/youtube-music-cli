import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('skip')
	.setDescription('Skip the current track');

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

	const skipped = player.skip();

	const artistStr = skipped?.artists?.map(a => a.name).join(', ') || 'Unknown';
	void interaction.reply({
		content: `Skipped **${skipped!.title}** — ${artistStr}`,
	});
}
