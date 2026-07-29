import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('leave')
	.setDescription(
		'Leave the voice channel and remove from auto-reconnect list',
	);

export async function execute(
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
): Promise<void> {
	const player = playerManager.get(interaction.guild!.id);

	if (!player?.isConnected()) {
		// Clean up persistence even if not connected
		await playerManager.remove(interaction.guild!.id);
		await interaction.reply({
			content: 'Not in a voice channel.',
			ephemeral: true,
		});
		return;
	}

	await playerManager.remove(interaction.guild!.id);
	await interaction.reply({
		content: 'Left the voice channel. I will not rejoin on restart.',
	});
}
