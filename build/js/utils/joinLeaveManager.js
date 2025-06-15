"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isJoinLeaveEnabled = isJoinLeaveEnabled;
exports.enableJoinLeaveEmbed = enableJoinLeaveEmbed;
exports.disableJoinLeaveEmbed = disableJoinLeaveEmbed;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CONFIG_FILE = path_1.default.resolve(process.cwd(), 'data', 'joinLeaveConfig.json');
let config = {};
function loadConfig() {
    if (fs_1.default.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs_1.default.readFileSync(CONFIG_FILE, 'utf-8'));
    }
    else {
        config = {};
    }
}
function saveConfig() {
    fs_1.default.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
function isJoinLeaveEnabled(guildId) {
    loadConfig();
    return config[guildId] === true;
}
function enableJoinLeaveEmbed(guildId) {
    loadConfig();
    config[guildId] = true;
    saveConfig();
}
function disableJoinLeaveEmbed(guildId) {
    loadConfig();
    delete config[guildId];
    saveConfig();
}
//# sourceMappingURL=joinLeaveManager.js.map