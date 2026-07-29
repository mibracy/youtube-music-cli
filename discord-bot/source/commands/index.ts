import {
	type ChatInputCommandInteraction,
	type SlashCommandBuilder,
	type Client,
} from 'discord.js';
import type {VoicePlayerManager} from '../player.ts';
import * as cmdPlay from './play.ts';
import * as cmdSkip from './skip.ts';
import * as cmdStop from './stop.ts';
import * as cmdLeave from './leave.ts';
import * as cmdQueue from './queue.ts';
import * as cmdNowPlaying from './now-playing.ts';
import * as cmdPause from './pause.ts';
import * as cmdResume from './resume.ts';

type CommandHandler = (
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
	client: Client,
) => void | Promise<void>;

interface Command {
	data: SlashCommandBuilder;
	execute: CommandHandler;
}

const commands: Command[] = [
	cmdPlay,
	cmdSkip,
	cmdStop,
	cmdLeave,
	cmdQueue,
	cmdNowPlaying,
	cmdPause,
	cmdResume,
] as Command[];

export function getCommandData(): unknown[] {
	return commands.map(c => c.data.toJSON());
}

export function getCommandMap(): Map<string, CommandHandler> {
	const map = new Map<string, CommandHandler>();

	for (const cmd of commands) {
		map.set(cmd.data.name, cmd.execute);
	}

	return map;
}

export async function handleCommand(
	interaction: ChatInputCommandInteraction,
	playerManager: VoicePlayerManager,
): Promise<void> {
	const commandMap = getCommandMap();
	const handler = commandMap.get(interaction.commandName);

	if (!handler) {
		await interaction.reply({
			content: 'Unknown command.',
			ephemeral: true,
		});
		return;
	}

	await handler(interaction, playerManager, interaction.client);
}
