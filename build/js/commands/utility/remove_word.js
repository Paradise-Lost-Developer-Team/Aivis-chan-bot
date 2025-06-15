"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// 辞書ファイルパスを定数化
const DICTIONARY_FILE = path_1.default.join(process.cwd(), "guild_dictionaries.json");
// 辞書ファイルの読み込み
function loadDictionaryFile() {
    try {
        if (fs_1.default.existsSync(DICTIONARY_FILE)) {
            const content = fs_1.default.readFileSync(DICTIONARY_FILE, 'utf8');
            return JSON.parse(content);
        }
    }
    catch (error) {
        console.error("Error loading dictionary file:", error);
    }
    return {};
}
// 辞書の保存
function saveToDictionaryFile(dictionaryData) {
    try {
        fs_1.default.writeFileSync(DICTIONARY_FILE, JSON.stringify(dictionaryData, null, 2), 'utf8');
        console.log("Dictionary saved successfully");
        return true;
    }
    catch (error) {
        console.error("Error saving dictionary:", error);
        return false;
    }
}
// 単語を削除する処理
async function removeWordFromDictionary(guildId, word) {
    try {
        // 辞書ファイルを読み込む
        const dictionaryData = loadDictionaryFile();
        // ギルドIDが存在するか確認
        if (dictionaryData[guildId] && dictionaryData[guildId][word]) {
            // 単語情報を削除
            delete dictionaryData[guildId][word];
            // 辞書を保存
            return saveToDictionaryFile(dictionaryData);
        }
        return true; // 単語が存在しなくても成功とみなす
    }
    catch (error) {
        console.error("Error removing word from dictionary:", error);
        return false;
    }
}
// UUID一覧を取得
async function fetchAllUUIDs() {
    try {
        const response = await fetch("http://localhost:10101/user_dict");
        if (!response.ok) {
            throw new Error(`Error fetching user dictionary: ${response.statusText}`);
        }
        return await response.json();
    }
    catch (error) {
        console.error("Error fetching UUIDs:", error);
        return {};
    }
}
module.exports = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('remove_word')
        .setDescription('辞書から単語を削除します')
        .addStringOption(option => option.setName('word')
        .setDescription('削除する単語')
        .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        try {
            const word = interaction.options.getString('word', true);
            const guildId = interaction.guildId;
            // UUID一覧を取得
            const uuidDict = await fetchAllUUIDs();
            const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
            if (!uuid) {
                await interaction.editReply(`単語 '${word}' のUUIDが見つかりませんでした。`);
                return;
            }
            const url = `http://localhost:10101/user_dict_word/${uuid}`;
            try {
                console.log(`Sending DELETE request to: ${url}`);
                const response = await fetch(url, { method: 'DELETE' });
                if (response.status === 204) {
                    // 辞書から削除
                    const dictionaryResult = await removeWordFromDictionary(guildId, word);
                    if (dictionaryResult) {
                        await interaction.editReply(`単語 '${word}' を辞書から削除しました。`);
                    }
                    else {
                        await interaction.editReply(`VOICEVOXからの削除は成功しましたが、辞書ファイルの更新に失敗しました。`);
                    }
                }
                else {
                    await interaction.editReply(`単語 '${word}' の削除に失敗しました。ステータスコード: ${response.status}`);
                }
            }
            catch (error) {
                console.error("Error removing word:", error);
                await interaction.editReply(`単語の削除中にエラーが発生しました。`);
            }
        }
        catch (error) {
            console.error("Command execution error:", error);
            await interaction.editReply("単語の削除中にエラーが発生しました。");
        }
    },
};
//# sourceMappingURL=remove_word.js.map