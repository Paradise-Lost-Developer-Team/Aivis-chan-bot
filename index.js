"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const discord_js_1 = require("discord.js");
const voice_1 = require("@discordjs/voice");
const async_mutex_1 = require("async-mutex");
const rest_1 = require("@discordjs/rest");
const v9_1 = require("discord-api-types/v9");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const uuid_1 = require("uuid"); // ここで uuid モジュールをインポート
const stream_1 = require("stream");
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.MessageContent, discord_js_1.GatewayIntentBits.GuildVoiceStates] });
const rest = new rest_1.REST({ version: '9' }).setToken(process.env.TOKEN);
let connection = null;
let player = (0, voice_1.createAudioPlayer)();
let subscription = null;
const mutex = new async_mutex_1.Mutex();
const serverStatuses = {};
const textChannels = {};
const voiceClients = {};
const currentSpeaker = {};
const autoJoinChannels = {};
const audioQueues = {};
const guild_id = {};
const FFMPEG_PATH = "C:/ffmpeg/bin/ffmpeg.exe";
class ServerStatus {
    constructor(guildId) {
        this.guildId = guildId;
        this.saveTask();
    }
    saveTask() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                console.log(`Saving guild id: ${this.guildId}`);
                try {
                    fs_1.default.writeFileSync('guild_id.txt', this.guildId); // guild_id をファイルに保存
                    yield new Promise(resolve => setTimeout(resolve, 60000)); // 60秒ごとに保存
                }
                catch (error) {
                    console.error("Error saving guild id:", error);
                }
            }
        });
    }
}
class AivisAdapter {
    constructor() {
        this.URL = "http://127.0.0.1:10101";
        this.speaker = 0; // 話者IDを設定
    }
    speakVoice(text, voiceClient) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = { text, speaker: this.speaker };
            const queryResponse = yield axios.post(`${this.URL}/audio_query`, null, { params }).then(res => res.data);
            const audioResponse = yield axios.post(`${this.URL}/synthesis`, queryResponse, {
                params: { speaker: this.speaker },
                responseType: 'arraybuffer'
            });
            const resource = (0, voice_1.createAudioResource)(stream_1.Readable.from(audioResponse.data), { inputType: voice_1.StreamType.Arbitrary });
            if (player) {
                player.play(resource);
            }
        });
    }
}
function createFFmpegAudioSource(path) {
    return (0, voice_1.createAudioResource)(path, { inputType: voice_1.StreamType.Arbitrary });
}
function postAudioQuery(text, speaker) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = new URLSearchParams({ text, speaker: speaker.toString() });
        try {
            const response = yield fetch(`http://127.0.0.1:10101/audio_query?${params}`, {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error(`Error in postAudioQuery: ${response.statusText}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error("Error in postAudioQuery:", error);
            throw error;
        }
    });
}
function postSynthesis(audioQuery, speaker) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 分割推論のためのパラメータを追加
            const params = new URLSearchParams({ speaker: speaker.toString(), enable_interrogative_upspeak: "true" });
            const response = yield fetch(`http://127.0.0.1:10101/synthesis?${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(audioQuery)
            });
            if (!response.ok) {
                throw new Error(`Error in postSynthesis: ${response.statusText}`);
            }
            return yield response.arrayBuffer();
        }
        catch (error) {
            console.error("Error in postSynthesis:", error);
            throw error;
        }
    });
}
const voiceSettings = {
    volume: {},
    pitch: {},
    rate: {},
    speed: {},
    style_strength: {},
    tempo: {}
};
function adjustAudioQuery(audioQuery, guildId) {
    audioQuery.volumeScale = voiceSettings.volume[guildId] || 0.2;
    audioQuery.pitchScale = voiceSettings.pitch[guildId] || 0.0;
    audioQuery.rateScale = voiceSettings.rate[guildId] || 1.0;
    audioQuery.speedScale = voiceSettings.speed[guildId] || 1.0;
    audioQuery.styleStrength = voiceSettings.style_strength[guildId] || 1.0;
    audioQuery.tempoScale = voiceSettings.tempo[guildId] || 1.0;
    return audioQuery;
}
const DICTIONARY_FILE = "guild_dictionaries.json";
let guildDictionary = {};
try {
    guildDictionary = JSON.parse(fs_1.default.readFileSync(DICTIONARY_FILE, "utf-8"));
}
catch (error) {
    guildDictionary = {};
}
const MAX_TEXT_LENGTH = 200;
function speakVoice(text, speaker, guildId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (text.length > MAX_TEXT_LENGTH) {
            text = text.substring(0, MAX_TEXT_LENGTH) + "...";
        }
        let audioQuery = yield postAudioQuery(text, speaker);
        audioQuery = adjustAudioQuery(audioQuery, guildId);
        const audioContent = yield postSynthesis(audioQuery, speaker);
        const tempAudioFilePath = path_1.default.join(os_1.default.tmpdir(), `${(0, uuid_1.v4)()}.wav`);
        fs_1.default.writeFileSync(tempAudioFilePath, Buffer.from(audioContent));
        return tempAudioFilePath;
    });
}
function fetchUUIDsPeriodically() {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            fetchAllUUIDs();
            yield new Promise(resolve => setTimeout(resolve, 300000)); // 5分ごとに実行
        }
    });
}
const AUTO_JOIN_FILE = "auto_join_channels.json";
let autoJoinChannelsData = {};
function loadAutoJoinChannels() {
    try {
        return JSON.parse(fs_1.default.readFileSync(AUTO_JOIN_FILE, "utf-8"));
    }
    catch (error) {
        return {};
    }
}
function saveAutoJoinChannels() {
    fs_1.default.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannels, null, 4), "utf-8");
}
const TEXT_CHANNELS_JSON = "text_channels.json";
function loadTextChannels() {
    try {
        return JSON.parse(fs_1.default.readFileSync(TEXT_CHANNELS_JSON, "utf-8"));
    }
    catch (error) {
        return {};
    }
}
function saveTextChannels() {
    fs_1.default.writeFileSync(TEXT_CHANNELS_JSON, JSON.stringify(textChannels, null, 4), "utf-8");
}
const wordTypeChoices = [
    { name: "固有名詞", value: "PROPER_NOUN" },
    { name: "地名", value: "LOCATION_NAME" },
    { name: "組織・施設名", value: "ORGANIZATION_NAME" },
    { name: "人名", value: "PERSON_NAME" },
    { name: "性", value: "PERSON_FAMILY_NAME" },
    { name: "名", value: "PERSON_GIVEN_NAME" },
    { name: "一般名詞", value: "COMMON_NOUN" },
    { name: "動詞", value: "VERB" },
    { name: "形容詞", value: "ADJECTIVE" },
    { name: "語尾", value: "SUFFIX" }
];
function saveToDictionaryFile() {
    fs_1.default.writeFileSync(DICTIONARY_FILE, JSON.stringify(guildDictionary, null, 4), "utf-8");
}
function updateGuildDictionary(guildId, word, details) {
    if (!guildDictionary[guildId]) {
        guildDictionary[guildId] = {};
    }
    guildDictionary[guildId][word] = details;
    saveToDictionaryFile();
}
client.once(discord_js_1.Events.ClientReady, () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("起動完了");
    try {
        const guildId = fs_1.default.readFileSync('guild_id.txt', 'utf-8').trim();
        if (!guildId) {
            throw new Error("GUILD_ID is not defined in the guild_id.txt file.");
        }
        const commands = [
            {
                name: "join",
                description: "ボイスチャンネルに接続し、指定したテキストチャンネルのメッセージを読み上げます。",
                options: [
                    {
                        name: "voice_channel",
                        type: 7, // チャンネルタイプ
                        description: "接続するボイスチャンネル",
                        required: true
                    },
                    {
                        name: "text_channel",
                        type: 7, // チャンネルタイプ
                        description: "読み上げるテキストチャンネル",
                        required: true
                    }
                ]
            },
            {
                name: "leave",
                description: "ボイスチャンネルから切断します。"
            },
            {
                name: "ping",
                description: "BOTの応答時間をテストします。"
            },
            {
                name: "register_auto_join",
                description: "BOTの自動入室機能を登録します。",
                options: [
                    {
                        name: "voice_channel",
                        type: 7, // チャンネルタイプ
                        description: "自動入室するボイスチャンネル",
                        required: true
                    },
                    {
                        name: "text_channel",
                        type: 7, // チャンネルタイプ
                        description: "通知を送るテキストチャンネル (任意)",
                        required: false
                    }
                ]
            },
            {
                name: "unregister_auto_join",
                description: "自動接続の設定を解除します。"
            },
            {
                name: "set_speaker",
                description: "話者を選択メニューから切り替えます。",
                options: [
                    {
                        name: "speaker_id",
                        type: 4, // 整数タイプ
                        description: "設定する話者のID",
                        required: true
                    }
                ]
            },
            {
                name: "set_volume",
                description: "音量を設定します。",
                options: [
                    {
                        name: "volume",
                        type: 10, // 数値タイプ
                        description: "設定する音量 (0.0 - 2.0)",
                        required: true
                    }
                ]
            },
            {
                name: "set_pitch",
                description: "音高を設定します。",
                options: [
                    {
                        name: "pitch",
                        type: 10, // 数値タイプ
                        description: "設定する音高 (-1.0 - 1.0)",
                        required: true
                    }
                ]
            },
            {
                name: "set_speed",
                description: "話速を設定します。",
                options: [
                    {
                        name: "speed",
                        type: 10, // 数値タイプ
                        description: "設定する話速 (0.5 - 2.0)",
                        required: true
                    }
                ]
            },
            {
                name: "set_style_strength",
                description: "スタイルの強さを設定します。",
                options: [
                    {
                        name: "style_strength",
                        type: 10, // 数値タイプ
                        description: "設定するスタイルの強さ (0.0 - 2.0)",
                        required: true
                    }
                ]
            },
            {
                name: "set_tempo",
                description: "テンポの緩急を設定します。",
                options: [
                    {
                        name: "tempo",
                        type: 10, // 数値タイプ
                        description: "設定するテンポの緩急 (0.5 - 2.0)",
                        required: true
                    }
                ]
            },
            {
                name: "add_word",
                description: "辞書に単語を登録します。",
                options: [
                    {
                        name: "word",
                        type: 3, // 文字列タイプ
                        description: "登録する単語",
                        required: true
                    },
                    {
                        name: "pronunciation",
                        type: 3, // 文字列タイプ
                        description: "単語の発音",
                        required: true
                    },
                    {
                        name: "accent_type",
                        type: 4, // 整数タイプ
                        description: "アクセントの種類",
                        required: true
                    },
                    {
                        name: "word_type",
                        type: 3, // 文字列タイプ
                        description: "単語の品詞",
                        required: true,
                        choices: wordTypeChoices
                    }
                ]
            },
            {
                name: "edit_word",
                description: "辞書の単語を編集します。",
                options: [
                    {
                        name: "word",
                        type: 3, // 文字列タイプ
                        description: "編集する単語",
                        required: true
                    },
                    {
                        name: "new_pronunciation",
                        type: 3, // 文字列タイプ
                        description: "新しい発音",
                        required: true
                    },
                    {
                        name: "accent_type",
                        type: 4, // 整数タイプ
                        description: "アクセントの種類",
                        required: true
                    },
                    {
                        name: "word_type",
                        type: 3, // 文字列タイプ
                        description: "単語の品詞",
                        required: true,
                        choices: wordTypeChoices
                    }
                ]
            },
            {
                name: "remove_word",
                description: "辞書から単語を削除します。",
                options: [
                    {
                        name: "word",
                        type: 3, // 文字列タイプ
                        description: "削除する単語",
                        required: true
                    }
                ]
            },
            {
                name: "list_words",
                description: "辞書の単語一覧を表示します。"
            },
            {
                name: "help",
                description: "ヘルプメニューを表示します。"
            },
            {
                name: "stream_audio",
                description: "オーディオストリームを再生します。",
                options: [
                    {
                        name: "url",
                        type: 3, // 文字列タイプ
                        description: "再生するオーディオストリームのURL",
                        required: true
                    }
                ]
            }
        ];
        yield rest.put(v9_1.Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
        console.log(`${commands.length}個のコマンドを同期しました`);
    }
    catch (error) {
        console.error(error);
    }
    client.user.setActivity("起動中…", { type: discord_js_1.ActivityType.Playing });
    setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        const joinServerCount = client.guilds.cache.size;
        yield client.user.setActivity(`サーバー数: ${joinServerCount}`, { type: discord_js_1.ActivityType.Custom });
        yield new Promise(resolve => setTimeout(resolve, 15000));
        const joinVCCount = client.voice.adapters.size;
        client.user.setActivity(`VC: ${joinVCCount}`, { type: discord_js_1.ActivityType.Custom });
        yield new Promise(resolve => setTimeout(resolve, 15000));
    }), 30000);
    fetchUUIDsPeriodically();
    client.guilds.cache.forEach(guild => {
        new ServerStatus(guild.id); // 各ギルドのIDを保存するタスクを開始
    });
}));
class HelpMenu {
    constructor() {
        this.pages = [
            new discord_js_1.EmbedBuilder()
                .setTitle("ヘルプ - 基本コマンド")
                .setDescription("基本的なコマンドの一覧です。")
                .addFields({ name: "/join", value: "ボイスチャンネルに接続し、指定したテキストチャンネルのメッセージを読み上げます。" }, { name: "/leave", value: "ボイスチャンネルから切断します。" }, { name: "/ping", value: "BOTの応答時間をテストします。" }),
            new discord_js_1.EmbedBuilder()
                .setTitle("ヘルプ - 自動入室コマンド")
                .setDescription("自動入室に関するコマンドの一覧です。")
                .addFields({ name: "/register_auto_join", value: "BOTの自動入室機能を登録します。" }, { name: "/unregister_auto_join", value: "自動接続の設定を解除します。" }),
            new discord_js_1.EmbedBuilder()
                .setTitle("ヘルプ - 音声設定コマンド")
                .setDescription("音声設定に関するコマンドの一覧です。")
                .addFields({ name: "/set_speaker", value: "話者を選択メニューから切り替えます。" }, { name: "/set_volume", value: "音量を設定します。" }, { name: "/set_pitch", value: "音高を設定します。" }, { name: "/set_speed", value: "話速を設定します。" }, { name: "/set_style_strength", value: "スタイルの強さを設定します。" }, { name: "/set_tempo", value: "テンポの緩急を設定します。" }),
            new discord_js_1.EmbedBuilder()
                .setTitle("ヘルプ - 辞書コマンド")
                .setDescription("辞書に関するコマンドの一覧です。")
                .addFields({ name: "/add_word", value: "辞書に単語を登録します。" }, { name: "/edit_word", value: "辞書の単語を編集します。" }, { name: "/remove_word", value: "辞書から単語を削除します。" }, { name: "/list_words", value: "辞書の単語一覧を表示します。" })
        ];
        this.currentPage = 0;
    }
    getCurrentPage() {
        return this.pages[this.currentPage];
    }
    nextPage() {
        this.currentPage = (this.currentPage + 1) % this.pages.length;
        return this.getCurrentPage();
    }
    previousPage() {
        this.currentPage = (this.currentPage - 1 + this.pages.length) % this.pages.length;
        return this.getCurrentPage();
    }
}
function streamAudio(url, voiceClient) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(url);
            if (!response.ok) {
                throw new Error(`Error in streamAudio: ${response.statusText}`);
            }
            const resource = (0, voice_1.createAudioResource)(response.body, { inputType: voice_1.StreamType.Arbitrary });
            player.play(resource);
            voiceClient.subscribe(player);
        }
        catch (error) {
            console.error("Error in streamAudio:", error);
            throw error;
        }
    });
}
function play_audio(voiceClient, path) {
    return __awaiter(this, void 0, void 0, function* () {
        while (voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready && player.state.status === voice_1.AudioPlayerStatus.Playing) {
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
        const resource = createFFmpegAudioSource(path);
        player.play(resource);
        voiceClient.subscribe(player);
    });
}
client.on(discord_js_1.Events.InteractionCreate, (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    if (!interaction.isCommand())
        return;
    const { commandName } = interaction;
    if (commandName === "join") {
        let voiceChannel = (_a = interaction.options.get("voice_channel")) === null || _a === void 0 ? void 0 : _a.channel;
        let textChannel = (_b = interaction.options.get("text_channel")) === null || _b === void 0 ? void 0 : _b.channel;
        if (!voiceChannel) {
            // コマンド実行者が接続しているボイスチャンネルを取得
            const member = (_c = interaction.guild) === null || _c === void 0 ? void 0 : _c.members.cache.get(interaction.user.id);
            if (member === null || member === void 0 ? void 0 : member.voice.channel) {
                voiceChannel = member.voice.channel;
            }
            else {
                yield interaction.reply("ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。");
                return;
            }
        }
        if (!textChannel) {
            // コマンド実行チャンネルを使用
            textChannel = interaction.channel;
        }
        const guildId = interaction.guildId;
        textChannels[guildId] = textChannel;
        try {
            let voiceClient = voiceClients[guildId];
            if (voiceClient) {
                yield voiceClient.disconnect();
            }
            voiceClient = yield (0, voice_1.joinVoiceChannel)({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator
            });
            voiceClients[guildId] = voiceClient;
            yield interaction.reply(`${voiceChannel.name} に接続しました。`);
            // Botが接続した際のアナウンス
            const path = yield speakVoice("接続しました。", currentSpeaker[guildId] || 888753760, guildId);
            yield play_audio(voiceClient, path);
        }
        catch (error) {
            console.error(error);
            if (!interaction.replied) {
                yield interaction.reply("ボイスチャンネルへの接続に失敗しました。");
            }
        }
    }
    else if (commandName === "leave") {
        const guildId = interaction.guildId;
        const voiceClient = voiceClients[guildId];
        if (!voiceClient) {
            yield interaction.reply("現在、ボイスチャンネルに接続していません。");
            return;
        }
        try {
            yield voiceClient.disconnect();
            delete voiceClients[guildId];
            yield interaction.reply("ボイスチャンネルから切断しました。");
        }
        catch (error) {
            console.error(error);
            yield interaction.reply("ボイスチャンネルからの切断に失敗しました。");
        }
    }
    else if (commandName === "ping") {
        const latency = Math.round(client.ws.ping);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("Latency")
            .setDescription(`Pong! BotのPing値は${latency}msです。`);
        yield interaction.reply({ embeds: [embed] });
    }
    else if (commandName === "register_auto_join") {
        const voiceChannel = (_d = interaction.options.get("voice_channel")) === null || _d === void 0 ? void 0 : _d.channel;
        const textChannel = (_e = interaction.options.get("text_channel")) === null || _e === void 0 ? void 0 : _e.channel;
        if (!voiceChannel) {
            yield interaction.reply("ボイスチャンネルが指定されていません。");
            return;
        }
        loadAutoJoinChannels();
        const guildId = interaction.guildId;
        autoJoinChannels[guildId] = {
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel ? textChannel.id : voiceChannel.id
        };
        saveAutoJoinChannels(); // ここで保存
        yield interaction.reply(`サーバー ${interaction.guild.name} の自動入室チャンネルを ${voiceChannel.name} に設定しました。`);
    }
    else if (commandName === "unregister_auto_join") {
        const guildId = interaction.guildId;
        if (autoJoinChannels[guildId]) {
            loadAutoJoinChannels();
            delete autoJoinChannels[guildId];
            saveAutoJoinChannels(); // ここで保存
            yield interaction.reply("自動接続設定を解除しました。");
        }
        else {
            yield interaction.reply({ content: "このサーバーには登録された自動接続設定がありません。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "set_speaker") {
        const speakerId = (_f = interaction.options.get("speaker_id")) === null || _f === void 0 ? void 0 : _f.value;
        if (speakerId !== null) {
            currentSpeaker[interaction.guildId] = speakerId;
            yield interaction.reply(`話者をID ${speakerId} に設定しました。`);
        }
        else {
            yield interaction.reply("無効な話者IDです。");
        }
    }
    else if (commandName === "set_volume") {
        const volume = (_g = interaction.options.get("volume")) === null || _g === void 0 ? void 0 : _g.value;
        if (volume !== null && volume >= 0.0 && volume <= 2.0) {
            voiceSettings.volume[interaction.guildId] = volume;
            yield interaction.reply(`音量を ${volume} に設定しました。`);
        }
        else {
            yield interaction.reply({ content: "無効な音量値です。0.0から2.0の間で設定してください。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "set_pitch") {
        const pitch = (_h = interaction.options.get("pitch")) === null || _h === void 0 ? void 0 : _h.value;
        if (pitch !== null && pitch >= -1.0 && pitch <= 1.0) {
            voiceSettings.pitch[interaction.guildId] = pitch;
            yield interaction.reply(`音高を ${pitch} に設定しました。`);
        }
        else {
            yield interaction.reply({ content: "無効な音高値です。-1.0から1.0の間で設定してください。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "set_speed") {
        const speed = (_j = interaction.options.get("speed")) === null || _j === void 0 ? void 0 : _j.value;
        if (speed !== null && speed >= 0.5 && speed <= 2.0) {
            voiceSettings.speed[interaction.guildId] = speed;
            yield interaction.reply(`話速を ${speed} に設定しました。`);
        }
        else {
            yield interaction.reply({ content: "無効な話速値です。0.5から2.0の間で設定してください。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "set_style_strength") {
        const styleStrength = (_k = interaction.options.get("style_strength")) === null || _k === void 0 ? void 0 : _k.value;
        if (styleStrength !== null && styleStrength >= 0.0 && styleStrength <= 2.0) {
            voiceSettings.style_strength[interaction.guildId] = styleStrength;
            yield interaction.reply(`スタイルの強さを ${styleStrength} に設定しました。`);
        }
        else {
            yield interaction.reply({ content: "無効なスタイルの強さです。0.0から2.0の間で設定してください。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "set_tempo") {
        const tempo = (_l = interaction.options.get("tempo")) === null || _l === void 0 ? void 0 : _l.value;
        if (tempo !== null && tempo >= 0.5 && tempo <= 2.0) {
            voiceSettings.tempo[interaction.guildId] = tempo;
            yield interaction.reply(`テンポの緩急を ${tempo} に設定しました。`);
        }
        else {
            yield interaction.reply({ content: "無効なテンポの緩急です。0.5から2.0の間で設定してください。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "add_word") {
        const word = interaction.options.getString("word");
        const pronunciation = interaction.options.getString("pronunciation");
        const accentType = interaction.options.getNumber("accent_type");
        const wordType = interaction.options.getString("word_type");
        const addUrl = `http://localhost:10101/user_dict_word?surface=${word}&pronunciation=${pronunciation}&accent_type=${accentType}&word_type=${wordType}`;
        const response = yield axios.post(addUrl);
        if (response.status === 200) {
            const details = { pronunciation, accentType, wordType };
            updateGuildDictionary(interaction.guildId, word, details);
            yield interaction.reply(`単語 '${word}' の発音を '${pronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に登録しました。`);
        }
        else {
            yield interaction.reply({ content: `単語 '${word}' の登録に失敗しました。`, flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "edit_word") {
        const word = interaction.options.getString("word");
        const newPronunciation = interaction.options.getString("new_pronunciation");
        const accentType = interaction.options.getNumber("accent_type");
        const wordType = interaction.options.getString("word_type");
        const uuidDict = yield fetchAllUUIDs();
        const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
        const editUrl = `http://localhost:10101/user_dict_word/${uuid}?surface=${word}&pronunciation=${newPronunciation}&accent_type=${accentType}&word_type=${wordType}`;
        if (uuid) {
            const response = yield axios.put(editUrl);
            if (response.status === 204) {
                const details = { pronunciation: newPronunciation, accentType, wordType, uuid };
                updateGuildDictionary(interaction.guildId, word, details);
                yield interaction.reply(`単語 '${word}' の発音を '${newPronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に編集しました。`);
            }
            else {
                yield interaction.reply({ content: `単語 '${word}' の編集に失敗しました。`, flags: discord_js_1.MessageFlags.Ephemeral });
            }
        }
        else {
            yield interaction.reply({ content: `単語 '${word}' のUUIDが見つかりませんでした。`, flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "remove_word") {
        const word = interaction.options.getString("word");
        const uuidDict = yield fetchAllUUIDs();
        const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
        const removeUrl = `http://localhost:10101/user_dict_word/${uuid}`;
        if (uuid) {
            const response = yield axios.delete(removeUrl);
            if (response.status === 204) {
                const guildIdStr = interaction.guildId.toString();
                if (guildDictionary[guildIdStr] && guildDictionary[guildIdStr][word]) {
                    delete guildDictionary[guildIdStr][word];
                    saveToDictionaryFile();
                }
                yield interaction.reply(`単語 '${word}' を辞書から削除しました。`);
            }
            else {
                yield interaction.reply({ content: `単語 '${word}' の削除に失敗しました。`, flags: discord_js_1.MessageFlags.Ephemeral });
            }
        }
        else {
            yield interaction.reply({ content: `単語 '${word}' のUUIDが見つかりませんでした。`, flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    else if (commandName === "list_words") {
        const guildId = interaction.guildId.toString();
        const words = guildDictionary[guildId] || {};
        if (Object.keys(words).length === 0) {
            yield interaction.reply({ content: "辞書に単語が登録されていません。", flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("辞書の単語一覧")
            .setDescription(Object.entries(words).map(([word, details]) => {
            const { pronunciation, accentType, wordType } = details;
            return `${word}: ${pronunciation}, アクセント: ${accentType}, 品詞: ${wordType}`;
        }).join("\n"));
        yield interaction.reply({ embeds: [embed] });
    }
    else if (commandName === "help") {
        const helpMenu = new HelpMenu();
        const embed = helpMenu.getCurrentPage();
        const row = new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Previous')
            .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle(discord_js_1.ButtonStyle.Primary));
        yield interaction.reply({ embeds: [embed], components: [row] });
        const filter = (i) => i.customId === 'previous' || i.customId === 'next';
        const collector = (_m = interaction.channel) === null || _m === void 0 ? void 0 : _m.createMessageComponentCollector({ filter, time: 60000 });
        collector === null || collector === void 0 ? void 0 : collector.on('collect', (i) => __awaiter(void 0, void 0, void 0, function* () {
            if (i.customId === 'previous') {
                const embed = helpMenu.previousPage();
                yield i.update({ embeds: [embed] });
            }
            else if (i.customId === 'next') {
                const embed = helpMenu.nextPage();
                yield i.update({ embeds: [embed] });
            }
        }));
    }
    else if (commandName === "stream_audio") {
        const url = interaction.options.getString("url", true);
        const voiceClient = voiceClients[interaction.guildId];
        if (voiceClient) {
            try {
                yield streamAudio(url, voiceClient);
                yield interaction.reply("オーディオストリームを再生しています。");
            }
            catch (error) {
                yield interaction.reply({ content: "オーディオストリームの再生に失敗しました。", flags: discord_js_1.MessageFlags.Ephemeral });
            }
        }
        else {
            yield interaction.reply({ content: "ボイスチャンネルに接続していません。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
}));
client.on(discord_js_1.Events.MessageCreate, (message) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    if (message.author.bot) {
        console.log("Message is from a bot, ignoring.");
        return;
    }
    try {
        // メッセージ内容の加工（スポイラー、絵文字、URL、メンション、マークダウン記法の除外）
        let messageContent = message.content;
        messageContent = messageContent.replace(/\|\|.*?\|\|/g, ''); // スポイラー除外
        messageContent = messageContent.replace(/<a?:\w+:\d+>/g, ''); // カスタム絵文字除外
        messageContent = messageContent.replace(/https?:\/\/[^\s]+/g, ''); // URL除外
        messageContent = messageContent.replace(/<@!?[0-9]+>/g, ''); // ユーザー・ロールメンション除外
        messageContent = messageContent.replace(/<#!?[0-9]+>/g, ''); // チャンネルメンション除外
        messageContent = messageContent.replace(/[*_~`]/g, ''); // マークダウン除外
        // 絵文字除外（必要に応じて調整）
        const emojiStrs = ((_a = message.guild) === null || _a === void 0 ? void 0 : _a.emojis.cache.map(emoji => emoji.toString())) || [];
        messageContent = [...messageContent].filter(char => !emojiStrs.includes(char)).join('');
        // メッセージ先頭に "(音量0)" がある場合は読み上げを行わない
        if (messageContent.startsWith("(音量0)")) {
            console.log("Message starts with (音量0), ignoring.");
            return;
        }
        const guildId = message.guildId;
        let voiceClient = voiceClients[guildId];
        // JSONから自動入室チャンネルの設定を読み込む
        const autoJoinChannelsData = loadAutoJoinChannels();
        console.log(`autoJoinChannelsData = ${JSON.stringify(autoJoinChannelsData)}`);
        if (autoJoinChannelsData[guildId]) {
            const autoVoiceChannelId = autoJoinChannelsData[guildId].voiceChannelId;
            const autoTextChannelId = autoJoinChannelsData[guildId].textChannelId;
            const channel = client.channels.cache.get(autoVoiceChannelId);
            if (!channel) {
                console.log(`Error: Channel with id ${autoVoiceChannelId} not found.`);
            }
            else {
                if (!voiceClient || voiceClient.state.status !== voice_1.VoiceConnectionStatus.Ready) {
                    voiceClient = yield (0, voice_1.joinVoiceChannel)({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator
                    });
                    voiceClients[guildId] = voiceClient;
                }
            }
        }
        else {
            console.log(`Guild ID ${guildId} not found in autoJoinChannelsData.`);
        }
        if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready && message.channel.id === ((_b = autoJoinChannelsData[guildId]) === null || _b === void 0 ? void 0 : _b.textChannelId)) {
            console.log("Voice client is connected and message is in the auto-join text channel. Handling message.");
            yield handle_message(message);
        }
        else if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready && message.channel.id === ((_c = textChannels[guildId]) === null || _c === void 0 ? void 0 : _c.id)) {
            console.log("Voice client is connected and message is in the registered text channel. Handling message.");
            yield handle_message(message);
        }
        else {
            console.log("Voice client is not connected or message is in the wrong channel. Ignoring message.");
        }
    }
    catch (error) {
        console.error(`An error occurred while processing the message: ${error}`);
    }
}));
function handle_message(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const messageContent = message.content;
        const guildId = message.guildId;
        const voiceClient = voiceClients[guildId];
        if (!voiceClient) {
            console.error("Error: Voice client is None, skipping message processing.");
            return;
        }
        console.log(`Handling message: ${messageContent}`);
        const speakerId = currentSpeaker[guildId] || 888753760; // デフォルトの話者ID
        const path = yield speakVoice(messageContent, speakerId, guildId);
        while (voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready && player.state.status === voice_1.AudioPlayerStatus.Playing) {
            yield new Promise(resolve => setTimeout(resolve, 100));
        }
        const resource = createFFmpegAudioSource(path);
        player.play(resource);
        voiceClient.subscribe(player); // プレイヤーをボイスクライアントにサブスクライブ
        console.log(`Finished playing message: ${messageContent}`);
    });
}
client.on(discord_js_1.Events.VoiceStateUpdate, (oldState, newState) => __awaiter(void 0, void 0, void 0, function* () {
    const member = newState.member;
    const guildId = member.guild.id;
    const voiceClient = voiceClients[guildId];
    if (member.user.bot)
        return;
    if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready) {
        if (!oldState.channel && newState.channel) {
            // ユーザーがボイスチャンネルに参加したとき
            if (voiceClient.joinConfig.channelId === newState.channel.id) {
                const nickname = member.displayName;
                const path = yield speakVoice(`${nickname} さんが入室しました。`, currentSpeaker[guildId] || 888753760, guildId);
                yield play_audio(voiceClient, path);
            }
        }
        else if (oldState.channel && !newState.channel) {
            // ユーザーがボイスチャンネルから退出したとき
            if (voiceClient.joinConfig.channelId === oldState.channel.id) {
                const nickname = member.displayName;
                const path = yield speakVoice(`${nickname} さんが退室しました。`, currentSpeaker[guildId] || 888753760, guildId);
                yield play_audio(voiceClient, path);
                // ボイスチャンネルに誰もいなくなったら退室
                if (oldState.channel.members.size === 1) { // ボイスチャンネルにいるのがBOTだけの場合
                    voiceClient.disconnect();
                    delete voiceClients[guildId];
                }
            }
        }
    }
    // Auto join channels handling
    try {
        const autoJoinChannelsData = loadAutoJoinChannels();
        console.log(`Loaded autoJoinChannels data: ${JSON.stringify(autoJoinChannelsData)}`);
        const guildData = autoJoinChannelsData[guildId];
        if (!guildData)
            return;
        const voiceChannelId = guildData.voiceChannelId;
        if (!oldState.channel && newState.channel) {
            if (voiceChannelId === newState.channel.id) {
                if (!voiceClients[guildId] || voiceClients[guildId].state.status !== voice_1.VoiceConnectionStatus.Ready) {
                    try {
                        const voiceClient = yield (0, voice_1.joinVoiceChannel)({
                            channelId: newState.channel.id,
                            guildId: newState.guild.id,
                            adapterCreator: newState.guild.voiceAdapterCreator
                        });
                        voiceClients[guildId] = voiceClient;
                        console.log(`Connected to voice channel ${voiceChannelId} in guild ${guildId}`);
                        const path = yield speakVoice("自動接続しました。", currentSpeaker[guildId] || 888753760, guildId);
                        yield play_audio(voiceClient, path);
                    }
                    catch (error) {
                        console.error(`Error: failed to connect to voice channel - ${error}`);
                    }
                }
            }
        }
        else if (oldState.channel && !newState.channel) {
            if (voiceClients[guildId] && voiceClients[guildId].state.status === voice_1.VoiceConnectionStatus.Ready) {
                if (oldState.channel.members.size === 1) {
                    try {
                        console.log(`${voiceClients[guildId].joinConfig.guildId}: Only BOT is left in the channel, disconnecting.`);
                        yield voiceClients[guildId].disconnect();
                        delete voiceClients[guildId];
                    }
                    catch (error) {
                        console.error(`Error while disconnecting: ${error}`);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error(`Error in on_voice_state_update: ${error}`);
    }
}));
client.login(process.env.TOKEN);
function fetchAllUUIDs() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("http://localhost:10101/user_dict");
            if (!response.ok) {
                throw new Error(`Error fetching user dictionary: ${response.statusText}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error("Error fetching user dictionary:", error);
            return {};
        }
    });
}
