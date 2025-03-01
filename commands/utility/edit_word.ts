import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import fs from 'fs';
import path from 'path';

// 辞書ファイルパスを定数化
const DICTIONARY_FILE = path.join(process.cwd(), "guild_dictionaries.json");

// 辞書ファイルの読み込み
function loadDictionaryFile() {
    try {
        if (fs.existsSync(DICTIONARY_FILE)) {
            const content = fs.readFileSync(DICTIONARY_FILE, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error("Error loading dictionary file:", error);
    }
    return {};
}

// 辞書の保存
function saveToDictionaryFile(dictionaryData: any) {
    try {
        fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(dictionaryData, null, 2), 'utf8');
        console.log("Dictionary saved successfully");
        return true;
    } catch (error) {
        console.error("Error saving dictionary:", error);
        return false;
    }
}

// 単語を編集する処理
async function editWordInDictionary(guildId: string, word: string, pronunciation: string, accentType: number, wordType: string) {
    try {
        // 辞書ファイルを読み込む
        const dictionaryData = loadDictionaryFile();
        
        // ギルドIDが存在しなければ作成
        if (!dictionaryData[guildId]) {
            dictionaryData[guildId] = {};
        }
        
        // 単語情報を更新
        dictionaryData[guildId][word] = {
            pronunciation,
            accentType,
            wordType
        };
        
        // 辞書を保存
        return saveToDictionaryFile(dictionaryData);
    } catch (error) {
        console.error("Error editing word in dictionary:", error);
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
    } catch (error) {
        console.error("Error fetching UUIDs:", error);
        return {};
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit_word')
        .setDescription('辞書の単語を編集します')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('編集する単語')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('new_pronunciation')
                .setDescription('新しい発音（カタカナ）')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('accent_type')
                .setDescription('アクセント型（0から始まる整数）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('word_type')
                .setDescription('単語の品詞')
                .setRequired(true)
                .addChoices(
                    { name: '固有名詞', value: 'PROPER_NOUN' },
                    { name: '地名', value: 'PLACE_NAME' },
                    { name: '組織名', value: 'ORGANIZATION_NAME' },
                    { name: '人名', value: 'PERSON_NAME' },
                    { name: '性', value: 'PERSON_FAMILY_NAME'},
                    { name: '名', value: 'PERSON_GIVEN_NAME' },
                    { name: '普通名詞', value: 'COMMON_NOUN' },
                    { name: '動詞', value: 'VERB' },
                    { name: '形容詞', value: 'ADJECTIVE' },
                    { name: '語尾', value: 'SUFFIX' }
                )),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const word = interaction.options.getString('word', true);
            const newPronunciation = interaction.options.getString('new_pronunciation', true);
            const accentType = interaction.options.getInteger('accent_type', true);
            const wordType = interaction.options.getString('word_type', true);
            const guildId = interaction.guildId!;

            // UUID一覧を取得
            const uuidDict = await fetchAllUUIDs();
            const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);

            if (!uuid) {
                await interaction.editReply(`単語 '${word}' のUUIDが見つかりませんでした。まずは追加してください。`);
                return;
            }

            // URLパラメータをエンコード
            const encodedWord = encodeURIComponent(word);
            const encodedPronunciation = encodeURIComponent(newPronunciation);
            const encodedWordType = encodeURIComponent(wordType);

            const url = `http://localhost:10101/user_dict_word/${uuid}?surface=${encodedWord}&pronunciation=${encodedPronunciation}&accent_type=${accentType}&word_type=${encodedWordType}`;
            
            try {
                console.log(`Sending request to: ${url}`);
                const response = await fetch(url, { method: 'PUT' });
                
                if (response.status === 204) {
                    // 辞書に追加
                    const dictionaryResult = await editWordInDictionary(guildId, word, newPronunciation, accentType, wordType);
                    
                    if (dictionaryResult) {
                        await interaction.editReply(`単語 '${word}' の発音を '${newPronunciation}'、アクセント '${accentType}'、品詞 '${wordType}' に編集しました。`);
                    } else {
                        await interaction.editReply(`VOICEVOXへの登録は成功しましたが、辞書ファイルへの保存に失敗しました。`);
                    }
                } else {
                    await interaction.editReply(`単語 '${word}' の編集に失敗しました。ステータスコード: ${response.status}`);
                }
            } catch (error) {
                console.error("Error editing word:", error);
                await interaction.editReply(`単語の編集中にエラーが発生しました。`);
            }
        } catch (error) {
            console.error("Command execution error:", error);
            await interaction.editReply("単語の編集中にエラーが発生しました。");
        }
    },
};