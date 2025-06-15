import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.resolve(process.cwd(), 'data', 'joinLeaveConfig.json');
let config: Record<string, boolean> = {};

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } else {
        config = {};
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function isJoinLeaveEnabled(guildId: string): boolean {
    loadConfig();
    return config[guildId] === true;
}

export function enableJoinLeaveEmbed(guildId: string) {
    loadConfig();
    config[guildId] = true;
    saveConfig();
}

export function disableJoinLeaveEmbed(guildId: string) {
    loadConfig();
    delete config[guildId];
    saveConfig();
}