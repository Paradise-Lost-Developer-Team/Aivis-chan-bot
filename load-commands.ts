import fs from 'fs';
import path from 'path';
import { Collection } from "discord.js";

export default function loadCommands(): Collection<string, any> {
    const commands = new Collection<string, any>();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(commandsPath);
    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            if (command.data && command.execute) {
                commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing required properties.`);
            }
        }
    }
    return commands;
}
