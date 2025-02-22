import { Routes } from 'discord-api-types/v9';
import { REST } from '@discordjs/rest';
import { client } from './index';
import { clientId, TOKEN } from './config.json';
import fs from 'node:fs';
import path from 'node:path';

console.log("Starting deploy-commands.ts");

export const deployCommands = async () => {
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
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts')); 
        console.log(`commandFiles: ${commandFiles}`);
        // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            console.log(`filePath: ${filePath}`);
            try {
                
                console.log(`Trying to load command: ${filePath}`);
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command); // ✅ コマンドを登録
                }
                console.log(`Successfully loaded: ${filePath}`);
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
    try {
        console.log(`${commands.length}個のアプリケーション (/) コマンドの更新を開始しました。`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data: any = await rest.put(
            // Routes.applicationGuildCommands(clientId, guildId),
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`${data.length}個のアプリケーション（/）コマンドを同期しました。`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
};