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
// 単語を追加する処理
async function addWordToDictionary(guildId, word, pronunciation, accentType, wordType) {
    try {
        // 辞書ファイルを読み込む
        const dictionaryData = loadDictionaryFile();
        // ギルドIDが存在しなければ作成
        if (!dictionaryData[guildId]) {
            dictionaryData[guildId] = {};
        }
        // 単語情報を追加
        dictionaryData[guildId][word] = {
            pronunciation,
            accentType,
            wordType
        };
        // 辞書を保存
        return saveToDictionaryFile(dictionaryData);
    }
    catch (error) {
        console.error("Error adding word to dictionary:", error);
        return false;
    }
}
// VOICEVOXサーバーへのリクエスト送信 - fetchを使用するよう修正
async function sendToVoicevox(word, pronunciation, accentType, wordType) {
    try {
        // URLパラメータをエンコード
        const encodedWord = encodeURIComponent(word);
        const encodedPronunciation = encodeURIComponent(pronunciation);
        const encodedWordType = encodeURIComponent(wordType);
        const url = `http://localhost:10101/user_dict_word?surface=${encodedWord}&pronunciation=${encodedPronunciation}&accent_type=${accentType}&word_type=${encodedWordType}`;
        console.log(`Sending request to: ${url}`);
        const response = await fetch(url, {
            method: 'POST'
        });
        console.log(`VOICEVOX API response:`, response.status);
        return response.status === 200;
    }
    catch (error) {
        console.error("Error sending to VOICEVOX:", error);
        return false;
    }
}
module.exports = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('add_word')
        .setDescription('辞書に単語を登録します')
        .addStringOption(option => option.setName('word')
        .setDescription('登録する単語')
        .setRequired(true))
        .addStringOption(option => option.setName('pronunciation')
        .setDescription('単語の発音（カタカナ）')
        .setRequired(true))
        .addIntegerOption(option => option.setName('accent_type')
        .setDescription('アクセント型（0から始まる整数）')
        .setRequired(true))
        .addStringOption(option => option.setName('word_type')
        .setDescription('単語の品詞')
        .setRequired(true)
        .addChoices({ name: '固有名詞', value: 'PROPER_NOUN' }, { name: '地名', value: 'PLACE_NAME' }, { name: '組織名', value: 'ORGANIZATION_NAME' }, { name: '人名', value: 'PERSON_NAME' }, { name: '性', value: 'PERSON_FAMILY_NAME' }, { name: '名', value: 'PERSON_GIVEN_NAME' }, { name: '普通名詞', value: 'COMMON_NOUN' }, { name: '動詞', value: 'VERB' }, { name: '形容詞', value: 'ADJECTIVE' }, { name: '語尾', value: 'SUFFIX' })),
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        try {
            const word = interaction.options.getString('word', true);
            const pronunciation = interaction.options.getString('pronunciation', true);
            const accentType = interaction.options.getInteger('accent_type', true);
            const wordType = interaction.options.getString('word_type', true);
            const guildId = interaction.guildId;
            // VOICEVOXサーバーに送信
            const voicevoxResult = await sendToVoicevox(word, pronunciation, accentType, wordType);
            if (voicevoxResult) {
                // 辞書に追加
                const dictionaryResult = await addWordToDictionary(guildId, word, pronunciation, accentType, wordType);
                if (dictionaryResult) {
                    await interaction.editReply(`単語 '${word}' の発音を '${pronunciation}'、アクセント '${accentType}'、品詞 '${wordType}' に登録しました。`);
                }
                else {
                    await interaction.editReply(`VOICEVOXへの登録は成功しましたが、辞書ファイルへの保存に失敗しました。`);
                }
            }
            else {
                await interaction.editReply(`単語 '${word}' の登録に失敗しました。サーバーの応答を確認してください。`);
            }
        }
        catch (error) {
            console.error("Command execution error:", error);
            await interaction.editReply("単語の登録中にエラーが発生しました。");
        }
    },
};
//# sourceMappingURL=add_word.js.map