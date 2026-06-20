import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('stop')
	.setDescription('Stop playback and clear the queue (stay in voice channel)');

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

	const hadTrack = player.currentTrack !== null;
	player.stop();

	void interaction.reply({
		content: hadTrack
			? 'Stopped playback and cleared the queue.'
			: 'Queue was already empty.',
	});
}
