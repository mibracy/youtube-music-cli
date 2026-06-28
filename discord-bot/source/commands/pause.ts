import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';

export const data = new SlashCommandBuilder()
	.setName('pause')
	.setDescription('Pause the current track');

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

	if (!player.isPlaying) {
		void interaction.reply({
			content: 'Nothing is currently playing.',
			ephemeral: true,
		});
		return;
	}

	player.pause();
	void interaction.reply({content: 'Paused.'});
}
