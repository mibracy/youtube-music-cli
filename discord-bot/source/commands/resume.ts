import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('resume')
	.setDescription('Resume the paused track');

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

	if (!player.isPaused) {
		void interaction.reply({
			content: player.isPlaying ? 'Already playing.' : 'Nothing is paused.',
			ephemeral: true,
		});
		return;
	}

	player.resume();
	void interaction.reply({content: 'Resumed.'});
}
