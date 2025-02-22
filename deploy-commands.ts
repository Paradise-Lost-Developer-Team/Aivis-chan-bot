import { Routes } from 'discord-api-types/v9';
import { REST } from '@discordjs/rest';
import { clientId, TOKEN, guildId } from './config.json';
import fs from 'node:fs';
import path from 'node:path';

console.log("Starting deploy-commands.ts");

const commands: any[] = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
console.log(`foldersPath: ${foldersPath}`);
const commandFolders = fs.readdirSync(foldersPath);
console.log(`commandFolders: ${commandFolders}`);

for (const folder of commandFolders) {
    // Grab all the command files from the commands directory you created earlier
    const commandsPath = path.join(foldersPath, folder);
    console.log(`commandsPath: ${commandsPath}`);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js')); // .ts から .js に変更
    console.log(`commandFiles: ${commandFiles}`);
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        console.log(`filePath: ${filePath}`);
        try {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
                console.log(`Loaded command: ${command.data.name}`);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`Error loading command at ${filePath}:`, error);
        }
    }
}

const rest = new REST({ version: '9' }).setToken(TOKEN);

// and deploy your commands!
export const deployCommands = async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data: any = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            // 本番用Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
};