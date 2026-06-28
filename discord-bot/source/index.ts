import {Client, GatewayIntentBits, REST, Routes} from 'discord.js';
import {getCommandData, handleCommand} from './commands/index.ts';
import {VoicePlayerManager} from './player.ts';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // optional: for instant command registration

if (!TOKEN) {
	console.error('DISCORD_TOKEN environment variable is required');
	process.exit(1);
}

if (!CLIENT_ID) {
	console.error('CLIENT_ID environment variable is required');
	process.exit(1);
}

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const playerManager = new VoicePlayerManager();

async function registerCommands(): Promise<void> {
	try {
		const commandsData = getCommandData();
		const rest = new REST({version: '10'}).setToken(TOKEN!);

		if (GUILD_ID) {
			await rest.put(Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID), {
				body: commandsData,
			});
			console.log(
				`[Commands] Registered ${commandsData.length} commands for guild ${GUILD_ID}`,
			);
		} else {
			await rest.put(Routes.applicationCommands(CLIENT_ID!), {
				body: commandsData,
			});
			console.log(
				`[Commands] Registered ${commandsData.length} global commands`,
			);
		}
	} catch (error) {
		console.error(
			'[Commands] Failed to register:',
			error instanceof Error ? error.message : String(error),
		);
	}
}

client.once('ready', async () => {
	console.log(`[Bot] Logged in as ${client.user!.tag}`);

	await registerCommands();
	await playerManager.restoreChannels(client);

	console.log('[Bot] Ready');
});

client.on('interactionCreate', async interaction => {
	console.log(
		`[Interaction] Received type=${interaction.type} name=${interaction.isChatInputCommand() ? interaction.commandName : 'N/A'}`,
	);

	if (!interaction.isChatInputCommand()) {
		return;
	}

	await handleCommand(interaction, playerManager);
});

async function shutdown(): Promise<void> {
	console.log('\n[Bot] Shutting down...');
	playerManager.cleanup();
	client.destroy();
	process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await client.login(TOKEN);
