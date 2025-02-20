import { config } from "dotenv";
config();
import { Client, Events, GatewayIntentBits, TextChannel, VoiceChannel, ActivityType, Interaction, Message, EmbedBuilder, MessageFlags, CommandInteractionOptionResolver, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, StringSelectMenuBuilder } from "discord.js";
import { VoiceConnection, AudioPlayer, PlayerSubscription, createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus, StreamType, VoiceConnectionStatus } from "@discordjs/voice";
import { Mutex } from "async-mutex";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid"; // ここで uuid モジュールをインポート
import { Readable } from "stream";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] });
const rest = new REST({ version: '9' }).setToken(process.env.TOKEN!);

const players: { [key: string]: AudioPlayer } = {};

function getPlayer(guildId: string): AudioPlayer {
    if (!players[guildId]) {
        players[guildId] = createAudioPlayer();
    }
    return players[guildId];
}

const textChannels: { [key: string]: TextChannel } = {};
const voiceClients: { [key: string]: VoiceConnection } = {};
const currentSpeaker: { [key: string]: number } = {};
const autoJoinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
const audioQueues: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};

class ServerStatus {
    guildId: string;
    constructor(guildId: string) {
        this.guildId = guildId;
        this.saveTask();
        }

    async saveTask() {
        while (true) {
            console.log(`Saving guild id: ${this.guildId}`);
            try {
                fs.writeFileSync('guild_id.txt', this.guildId); // guild_id をファイルに保存
                await new Promise(resolve => setTimeout(resolve, 60000)); // 60秒ごとに保存
            } catch (error: any) {
                console.error("Error saving guild id:", error);
            }
        }
    }
}
class AivisAdapter {
    URL: string;
    speaker: number;

    constructor() {
        this.URL = "http://127.0.0.1:10101";
        this.speaker = 0; // 話者IDを設定
    }

    async speakVoice(text: string, voiceClient: VoiceConnection) {
        const params = { text, speaker: this.speaker };
        const queryResponse = await axios.post(`${this.URL}/audio_query`, null, { params }).then(res => res.data);

        const audioResponse = await axios.post(`${this.URL}/synthesis`, queryResponse, {
            params: { speaker: this.speaker },
            responseType: 'arraybuffer'
        });

        const resource = createAudioResource(Readable.from(audioResponse.data as Buffer), { inputType: StreamType.Arbitrary });
        if (players) {
            const player = getPlayer(voiceClient.joinConfig.guildId);
            player.play(resource);
        }
    }
}

function createFFmpegAudioSource(path: string) {
    return createAudioResource(path, { inputType: StreamType.Arbitrary });
}

async function postAudioQuery(text: string, speaker: number) {
    const params = new URLSearchParams({ text, speaker: speaker.toString() });
    try {
        const response = await fetch(`http://127.0.0.1:10101/audio_query?${params}`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`Error in postAudioQuery: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error in postAudioQuery:", error);
        throw error;
    }
}

async function postSynthesis(audioQuery: any, speaker: number) {
    try {
        // 分割推論のためのパラメータを追加
        const params = new URLSearchParams({ speaker: speaker.toString(), enable_interrogative_upspeak: "true" });
        const response = await fetch(`http://127.0.0.1:10101/synthesis?${params}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(audioQuery)
        });
        if (!response.ok) {
            throw new Error(`Error in postSynthesis: ${response.statusText}`);
        }
        return await response.arrayBuffer();
    } catch (error) {
        console.error("Error in postSynthesis:", error);
        throw error;
    }
}

const voiceSettings: { [key: string]: any } = {
    volume: {},
    pitch: {},
    rate: {},
    speed: {},
    style_strength: {},
    tempo: {}
};

function adjustAudioQuery(audioQuery: any, guildId: string) {
    audioQuery.volumeScale = voiceSettings.volume[guildId] || 0.2;
    audioQuery.pitchScale = voiceSettings.pitch[guildId] || 0.0;
    audioQuery.rateScale = voiceSettings.rate[guildId] || 1.0;
    audioQuery.speedScale = voiceSettings.speed[guildId] || 1.0;
    audioQuery.styleStrength = voiceSettings.style_strength[guildId] || 1.0;
    audioQuery.tempoScale = voiceSettings.tempo[guildId] || 1.0;
    return audioQuery;
}

const SPEAKERS_FILE = "speakers.json";
let speakers: any[] = [];

function loadSpeakers() {
    try {
        speakers = JSON.parse(fs.readFileSync(SPEAKERS_FILE, "utf-8"));
    } catch (error) {
        console.error("Error loading speakers:", error);
        speakers = [];
    }
}

loadSpeakers();

function getSpeakerOptions() {
    return speakers.flatMap(speaker => 
        speaker.styles.map((style: { name: string; id: { toString: () => string; }; }) => ({
            label: `${speaker.name} - ${style.name}`,
            value: `${speaker.name}-${style.name}-${style.id.toString()}`
        }))
    );
}

const DICTIONARY_FILE = "guild_dictionaries.json";
let guildDictionary: { [key: string]: any } = {};

try {
    guildDictionary = JSON.parse(fs.readFileSync(DICTIONARY_FILE, "utf-8"));
} catch (error) {
    guildDictionary = {};
}

const MAX_TEXT_LENGTH = 200;

async function speakVoice(text: string, speaker: number, guildId: string) {
    if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH) + "...";
    }
    let audioQuery = await postAudioQuery(text, speaker);
    audioQuery = adjustAudioQuery(audioQuery, guildId);
    const audioContent = await postSynthesis(audioQuery, speaker);
    const tempAudioFilePath = path.join(os.tmpdir(), `${uuidv4()}.wav`);
    fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent as ArrayBuffer));
    return tempAudioFilePath;
}

async function fetchUUIDsPeriodically() {
    while (true) {
        fetchAllUUIDs();
        await new Promise(resolve => setTimeout(resolve, 300000)); // 5分ごとに実行
    }
}

const AUTO_JOIN_FILE = "auto_join_channels.json";
let autoJoinChannelsData: { [key: string]: any } = {};

function loadAutoJoinChannels() {
    try {
        return JSON.parse(fs.readFileSync(AUTO_JOIN_FILE, "utf-8"));
    } catch (error) {
        return {};
    }
}

function saveAutoJoinChannels() {
    fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannels, null, 4), "utf-8");
}

const TEXT_CHANNELS_JSON = "text_channels.json";

function loadTextChannels() {
    try {
        return JSON.parse(fs.readFileSync(TEXT_CHANNELS_JSON, "utf-8"));
    } catch (error) {
        return {};
    }
}

function saveTextChannels() {
    fs.writeFileSync(TEXT_CHANNELS_JSON, JSON.stringify(textChannels, null, 4), "utf-8");
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
    fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(guildDictionary, null, 4), "utf-8");
}

function updateGuildDictionary(guildId: string, word: string, details: any) {
    if (!guildDictionary[guildId]) {
        guildDictionary[guildId] = {};
    }
    guildDictionary[guildId][word] = details;
    saveToDictionaryFile();
}

client.once(Events.ClientReady, async () => {
    console.log("起動完了");
    try {
        const guildId = fs.readFileSync('guild_id.txt', 'utf-8').trim();
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
                description: "話者を選択メニューから切り替えます。"
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

        await rest.put(
            Routes.applicationGuildCommands(client.user!.id, guildId),
            { body: commands }
        );
        console.log(`${commands.length}個のコマンドを同期しました`);
    } catch (error) {
        console.error(error);
    }

    client.user!.setActivity("起動中…", { type: ActivityType.Playing });
    setInterval(async () => {
        const joinServerCount = client.guilds.cache.size;
        await client.user!.setActivity(`サーバー数: ${joinServerCount}`, { type: ActivityType.Custom });
        await new Promise(resolve => setTimeout(resolve, 15000));
        const joinVCCount = client.voice.adapters.size;
        client.user!.setActivity(`VC: ${joinVCCount}`, { type: ActivityType.Custom });
        await new Promise(resolve => setTimeout(resolve, 15000));
    }, 30000);

    fetchUUIDsPeriodically();
    client.guilds.cache.forEach(guild => {
        new ServerStatus(guild.id); // 各ギルドのIDを保存するタスクを開始
    });
});

class HelpMenu {
    private pages: EmbedBuilder[];
    private currentPage: number;

    constructor() {
        this.pages = [
            new EmbedBuilder()
                .setTitle("ヘルプ - 基本コマンド")
                .setDescription("基本的なコマンドの一覧です。")
                .addFields(
                    { name: "/join", value: "ボイスチャンネルに接続し、指定したテキストチャンネルのメッセージを読み上げます。" },
                    { name: "/leave", value: "ボイスチャンネルから切断します。" },
                    { name: "/ping", value: "BOTの応答時間をテストします。" }
                ),
            new EmbedBuilder()
                .setTitle("ヘルプ - 自動入室コマンド")
                .setDescription("自動入室に関するコマンドの一覧です。")
                .addFields(
                    { name: "/register_auto_join", value: "BOTの自動入室機能を登録します。" },
                    { name: "/unregister_auto_join", value: "自動接続の設定を解除します。" }
                ),
            new EmbedBuilder()
                .setTitle("ヘルプ - 音声設定コマンド")
                .setDescription("音声設定に関するコマンドの一覧です。")
                .addFields(
                    { name: "/set_speaker", value: "話者を選択メニューから切り替えます。" },
                    { name: "/set_volume", value: "音量を設定します。" },
                    { name: "/set_pitch", value: "音高を設定します。" },
                    { name: "/set_speed", value: "話速を設定します。" },
                    { name: "/set_style_strength", value: "スタイルの強さを設定します。" },
                    { name: "/set_tempo", value: "テンポの緩急を設定します。" }
                ),
            new EmbedBuilder()
                .setTitle("ヘルプ - 辞書コマンド")
                .setDescription("辞書に関するコマンドの一覧です。")
                .addFields(
                    { name: "/add_word", value: "辞書に単語を登録します。" },
                    { name: "/edit_word", value: "辞書の単語を編集します。" },
                    { name: "/remove_word", value: "辞書から単語を削除します。" },
                    { name: "/list_words", value: "辞書の単語一覧を表示します。" }
                )
        ];
        this.currentPage = 0;
    }

    public getCurrentPage(): EmbedBuilder {
        return this.pages[this.currentPage];
    }

    public nextPage(): EmbedBuilder {
        this.currentPage = (this.currentPage + 1) % this.pages.length;
        return this.getCurrentPage();
    }

    public previousPage(): EmbedBuilder {
        this.currentPage = (this.currentPage - 1 + this.pages.length) % this.pages.length;
        return this.getCurrentPage();
    }
}

async function streamAudio(url: string, voiceClient: VoiceConnection) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error in streamAudio: ${response.statusText}`);
        }
        const resource = createAudioResource(response.body as unknown as Readable, { inputType: StreamType.Arbitrary });
        const player = getPlayer(voiceClient.joinConfig.guildId);
        player.play(resource);
        voiceClient.subscribe(player);
    } catch (error) {
        console.error("Error in streamAudio:", error);
        throw error;
    }
}

async function play_audio(voiceClient: VoiceConnection, path: string, guildId: string) {
    const player = getPlayer(guildId);
    while (voiceClient.state.status === VoiceConnectionStatus.Ready && player.state.status === AudioPlayerStatus.Playing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (voiceClients[guildId] !== voiceClient) {
        console.log(`Voice client for guild ${guildId} has changed, stopping playback.`);
        return;
    }
    const resource = createFFmpegAudioSource(path);
    player.play(resource);
    voiceClient.subscribe(player);
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === "join") {
        let voiceChannel = interaction.options.get("voice_channel")?.channel as VoiceChannel;
        let textChannel = interaction.options.get("text_channel")?.channel as TextChannel;

        if (!voiceChannel) {
            // コマンド実行者が接続しているボイスチャンネルを取得
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            if (member?.voice.channel) {
                voiceChannel = member.voice.channel as VoiceChannel;
            } else {
                await interaction.reply("ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。");
                return;
            }
        }

        if (!textChannel) {
            // コマンド実行チャンネルを使用
            textChannel = interaction.channel as TextChannel;
        }

        const guildId = interaction.guildId!;
        textChannels[guildId] = textChannel;

        try {
            let voiceClient = voiceClients[guildId];
            if (voiceClient) {
                await voiceClient.disconnect();
            }
            voiceClient = await joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator as any
            });
            voiceClients[guildId] = voiceClient;
            await interaction.reply(`${voiceChannel.name} に接続しました。`);

            // Botが接続した際のアナウンス
            const path = await speakVoice("接続しました。", currentSpeaker[guildId] || 888753760, guildId);
            await play_audio(voiceClient, path, guildId);
        } catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply("ボイスチャンネルへの接続に失敗しました。");
            }
        }
    } else if (commandName === "leave") {
        const guildId = interaction.guildId!;
        const voiceClient = voiceClients[guildId];

        if (!voiceClient) {
            await interaction.reply("現在、ボイスチャンネルに接続していません。");
            return;
        }

        try {
            await voiceClient.disconnect();
            delete voiceClients[guildId];
            await interaction.reply("ボイスチャンネルから切断しました。");
        } catch (error) {
            console.error(error);
            await interaction.reply("ボイスチャンネルからの切断に失敗しました。");
        }
    } else if (commandName === "ping") {
        const latency = Math.round(client.ws.ping);
        const embed = new EmbedBuilder()
            .setTitle("Latency")
            .setDescription(`Pong! BotのPing値は${latency}msです。`);
        await interaction.reply({ embeds: [embed] });
    } else if (commandName === "register_auto_join") {
        const voiceChannel = interaction.options.get("voice_channel")?.channel as VoiceChannel;
        const textChannel = interaction.options.get("text_channel")?.channel as TextChannel;

        if (!voiceChannel) {
            await interaction.reply("ボイスチャンネルが指定されていません。");
            return;
        }

        loadAutoJoinChannels();
        const guildId = interaction.guildId!;
        autoJoinChannels[guildId] = {
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel ? textChannel.id : voiceChannel.id
        };

        saveAutoJoinChannels();  // ここで保存
        await interaction.reply(`サーバー ${interaction.guild!.name} の自動入室チャンネルを ${voiceChannel.name} に設定しました。`);
    } else if (commandName === "unregister_auto_join") {
        const guildId = interaction.guildId!;
        if (autoJoinChannels[guildId]) {
            loadAutoJoinChannels();
            delete autoJoinChannels[guildId];
            saveAutoJoinChannels();  // ここで保存
            await interaction.reply("自動接続設定を解除しました。");
        } else {
            await interaction.reply({ content: "このサーバーには登録された自動接続設定がありません。", flags: MessageFlags.Ephemeral });
        } 
    } else if (commandName === "set_speaker") {
        if (speakers.length === 0) {
            await interaction.reply("スピーカー情報が読み込まれていません。");
            return;
        }
        const options = getSpeakerOptions();
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_speaker')
                    .setPlaceholder('話者を選択してください')
                    .addOptions(options)
            );
        await interaction.reply({ content: "話者を選択してください:", components: [row] });
    } else if (commandName === "set_volume") {
        const volume = interaction.options.get("volume")?.value as number;
        if (volume !== null && volume >= 0.0 && volume <= 2.0) {
            voiceSettings.volume[interaction.guildId!] = volume;
            await interaction.reply(`音量を ${volume} に設定しました。`);
        } else {
            await interaction.reply({ content: "無効な音量値です。0.0から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "set_pitch") {
        const pitch = interaction.options.get("pitch")?.value as number;
        if (pitch !== null && pitch >= -1.0 && pitch <= 1.0) {
            voiceSettings.pitch[interaction.guildId!] = pitch;
            await interaction.reply(`音高を ${pitch} に設定しました。`);
        } else {
            await interaction.reply({ content: "無効な音高値です。-1.0から1.0の間で設定してください。", flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "set_speed") {
        const speed = interaction.options.get("speed")?.value as number;
        if (speed !== null && speed >= 0.5 && speed <= 2.0) {
            voiceSettings.speed[interaction.guildId!] = speed;
            await interaction.reply(`話速を ${speed} に設定しました。`);
        } else {
            await interaction.reply({ content: "無効な話速値です。0.5から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "set_style_strength") {
        const styleStrength = interaction.options.get("style_strength")?.value as number;
        if (styleStrength !== null && styleStrength >= 0.0 && styleStrength <= 2.0) {
            voiceSettings.style_strength[interaction.guildId!] = styleStrength;
            await interaction.reply(`スタイルの強さを ${styleStrength} に設定しました。`);
        } else {
            await interaction.reply({ content: "無効なスタイルの強さです。0.0から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "set_tempo") {
        const tempo = interaction.options.get("tempo")?.value as number;
        if (tempo !== null && tempo >= 0.5 && tempo <= 2.0) {
            voiceSettings.tempo[interaction.guildId!] = tempo;
            await interaction.reply(`テンポの緩急を ${tempo} に設定しました。`);
        } else {
            await interaction.reply({ content: "無効なテンポの緩急です。0.5から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "add_word") {
        const word = (interaction.options as CommandInteractionOptionResolver).getString("word")!;
        const pronunciation = (interaction.options as CommandInteractionOptionResolver).getString("pronunciation")!;
        const accentType = (interaction.options as CommandInteractionOptionResolver).getNumber("accent_type")!;
        const wordType = (interaction.options as CommandInteractionOptionResolver).getString("word_type")!;

        const addUrl = `http://localhost:10101/user_dict_word?surface=${word}&pronunciation=${pronunciation}&accent_type=${accentType}&word_type=${wordType}`;
        const response = await axios.post(addUrl);

        if (response.status === 200) {
            const details = { pronunciation, accentType, wordType };
            updateGuildDictionary(interaction.guildId!, word, details);
            await interaction.reply(`単語 '${word}' の発音を '${pronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に登録しました。`);
        } else {
            await interaction.reply({ content: `単語 '${word}' の登録に失敗しました。`, flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "edit_word") {
        const word = (interaction.options as CommandInteractionOptionResolver).getString("word")!;
        const newPronunciation = (interaction.options as CommandInteractionOptionResolver).getString("new_pronunciation")!;
        const accentType = (interaction.options as CommandInteractionOptionResolver).getNumber("accent_type")!;
        const wordType = (interaction.options as CommandInteractionOptionResolver).getString("word_type")!;

        const uuidDict = await fetchAllUUIDs();
        const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
        const editUrl = `http://localhost:10101/user_dict_word/${uuid}?surface=${word}&pronunciation=${newPronunciation}&accent_type=${accentType}&word_type=${wordType}`;

        if (uuid) {
            const response = await axios.put(editUrl);
            if (response.status === 204) {
                const details = { pronunciation: newPronunciation, accentType, wordType, uuid };
                updateGuildDictionary(interaction.guildId!, word, details);
                await interaction.reply(`単語 '${word}' の発音を '${newPronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に編集しました。`);
            } else {
                await interaction.reply({ content: `単語 '${word}' の編集に失敗しました。`, flags: MessageFlags.Ephemeral });
            }
        } else {
            await interaction.reply({ content: `単語 '${word}' のUUIDが見つかりませんでした。`, flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "remove_word") {
        const word = (interaction.options as CommandInteractionOptionResolver).getString("word")!;
        const uuidDict = await fetchAllUUIDs();
        const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
        const removeUrl = `http://localhost:10101/user_dict_word/${uuid}`;

        if (uuid) {
            const response = await axios.delete(removeUrl);
            if (response.status === 204) {
                const guildIdStr = interaction.guildId!.toString();
                if (guildDictionary[guildIdStr] && guildDictionary[guildIdStr][word]) {
                    delete guildDictionary[guildIdStr][word];
                    saveToDictionaryFile();
                }
                await interaction.reply(`単語 '${word}' を辞書から削除しました。`);
            } else {
                await interaction.reply({ content: `単語 '${word}' の削除に失敗しました。`, flags: MessageFlags.Ephemeral });
            }
        } else {
            await interaction.reply({ content: `単語 '${word}' のUUIDが見つかりませんでした。`, flags: MessageFlags.Ephemeral });
        }
    } else if (commandName === "list_words") {
        const guildId = interaction.guildId!.toString();
        const words = guildDictionary[guildId] || {};

        if (Object.keys(words).length === 0) {
            await interaction.reply({ content: "辞書に単語が登録されていません。", flags: MessageFlags.Ephemeral });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("辞書の単語一覧")
            .setDescription(Object.entries(words).map(([word, details]) => {
                const { pronunciation, accentType, wordType } = details as { pronunciation: string, accentType: number, wordType: string };
                return `${word}: ${pronunciation}, アクセント: ${accentType}, 品詞: ${wordType}`;
            }).join("\n"));

        await interaction.reply({ embeds: [embed] });
    } else if (commandName === "help") {
        const helpMenu = new HelpMenu();
        const embed = helpMenu.getCurrentPage();
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row] });

        const filter = (i: Interaction) => (i as ButtonInteraction).customId === 'previous' || (i as ButtonInteraction).customId === 'next';
        const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60000 });

        collector?.on('collect', async i => {
            if (i.customId === 'previous') {
                const embed = helpMenu.previousPage();
                await i.update({ embeds: [embed] });
            } else if (i.customId === 'next') {
                const embed = helpMenu.nextPage();
                await i.update({ embeds: [embed] });
            }
        });
    } else if (commandName === "stream_audio") {
        const url = (interaction.options as CommandInteractionOptionResolver).getString("url", true);
        const voiceClient = voiceClients[interaction.guildId!];
        if (voiceClient) {
            try {
                await streamAudio(url, voiceClient);
                await interaction.reply("オーディオストリームを再生しています。");
            } catch (error) {
                await interaction.reply({ content: "オーディオストリームの再生に失敗しました。", flags: MessageFlags.Ephemeral });
            }
        } else {
            await interaction.reply({ content: "ボイスチャンネルに接続していません。", flags: MessageFlags.Ephemeral });
        }
    }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    
    if (interaction.customId === 'select_speaker') {
        if (!interaction.values || interaction.values.length === 0) {
            console.error("Error: interaction.values is undefined or empty.");
            await interaction.update({ content: "エラー: 話者が選択されていません。", components: [] });
            return;
        }

        const selectedValue = interaction.values[0];
        const [selectedSpeakerName, selectedStyleName, selectedSpeakerId] = selectedValue.split('-');
        console.log(`Selected speaker ID: ${selectedSpeakerId}`); // デバッグ用ログ
        console.log(`Interaction guild ID: ${interaction.guildId}`); // デバッグ用ログ
        if (interaction.guildId) {
            currentSpeaker[interaction.guildId] = parseInt(selectedSpeakerId);
            console.log(`Current speaker for guild ${interaction.guildId}: ${currentSpeaker[interaction.guildId]}`); // デバッグ用ログ
            const selectedSpeaker = speakers.find(speaker => speaker.name === selectedSpeakerName);
            if (selectedSpeaker) {
                const selectedStyle = selectedSpeaker.styles.find((style: { id: number; }) => style.id === parseInt(selectedSpeakerId));
                if (selectedStyle) {
                    await interaction.update({ content: `話者を ${selectedSpeaker.name} - ${selectedStyle.name} に設定しました。`, components: [] });
                    return;
                } else {
                    console.error("Error: selectedStyle is undefined.");
                    await interaction.update({ content: "エラー: スタイルが見つかりませんでした。", components: [] });
                }
            } else {
                console.error("Error: selectedSpeaker is undefined.");
                await interaction.update({ content: "エラー: 話者が見つかりませんでした。", components: [] });
            }
        } else {
            console.error("Error: interaction.guildId is undefined.");
            await interaction.update({ content: "エラー: ギルドIDが取得できませんでした。", components: [] });
        }
    }
});

client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) {
        console.log("Message is from a bot, ignoring.");
        return;
    }

    try {
        let messageContent = message.content;

        // スポイラー除外
        if (messageContent.startsWith("||") && messageContent.endsWith("||")) {
            console.log("Message contains spoiler, ignoring.");
            const path = await speakVoice('スポイラー省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // カスタム絵文字を除外
        if (messageContent.match(/<:[a-zA-Z0-9_]+:[0-9]+>/g)) {
            console.log("Message contains custom emoji, ignoring.");
            const path = await speakVoice('カスタム絵文字省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // URLを除外
        if (messageContent.match(/https?:\/\/\S+/g)) {
            console.log("Message contains URL, ignoring.");
            const path = await speakVoice('URL省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // ロールメンションを除外
        if (messageContent.match(/<@&[0-9]+>/g)) {
            console.log("Message contains role mention, ignoring.");
            const path = await speakVoice('ロールメンション省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // チャンネルメンションを除外
        if (messageContent.match(/<#\d+>/g)) {
            console.log("Message contains channel mention, ignoring.");
            const path = await speakVoice('チャンネル省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // ユーザーメンションを除外
        if (messageContent.match(/<@!\d+>/g)) {
            console.log("Message contains user mention, ignoring.");
            const path = await speakVoice('ユーザーメンション省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // コードブロック除外
        if (messageContent.match(/```[\s\S]+```/g)) {
            console.log("Message contains code block, ignoring.");
            const path = await speakVoice('コードブロック省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // マークダウン除外
        if (messageContent.match(/[*_~`]/g)) {
            console.log("Message contains markdown, ignoring.");
            const path = await speakVoice('マークダウン省略', 888753760, message.guildId!);
            await play_audio(voiceClients[message.guildId!], path, message.guildId!);
            return;
        }

        // メッセージ先頭に "(音量0)" がある場合は読み上げを行わない
        if (messageContent.startsWith("(音量0)")) {
            console.log("Message starts with (音量0), ignoring.");
            return;
        }

        const guildId = message.guildId!;
        const voiceClient = voiceClients[guildId];

        // JSONから自動入室チャンネルの設定を読み込む
        const autoJoinChannelsData = loadAutoJoinChannels();
        console.log(`autoJoinChannelsData = ${JSON.stringify(autoJoinChannelsData)}`);

        if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
            if (message.channel.id === autoJoinChannelsData[guildId]?.textChannelId || message.channel.id === textChannels[guildId]?.id) {
                console.log("Voice client is connected and message is in the correct text channel. Handling message.");
                await handle_message(message);
            } else {
                console.log(`Message is not in the correct text channel. Ignoring message. Channel ID: ${message.channel.id}`);
            }
        } else {
            console.log(`Voice client is not connected. Ignoring message. Guild ID: ${guildId}`);
        }
    } catch (error) {
        console.error(`An error occurred while processing the message: ${error}`);
    }
});

async function handle_message(message: Message) {
    let messageContent = message.content;
    if (messageContent.length > MAX_TEXT_LENGTH) {
        messageContent = messageContent.substring(0, MAX_TEXT_LENGTH) + "...";
    }
    const guildId = message.guildId!;
    const voiceClient = voiceClients[guildId];

    if (!voiceClient) {
        console.error("Error: Voice client is None, skipping message processing.");
        return;
    }

    console.log(`Handling message: ${messageContent}`);
    const speakerId = currentSpeaker[guildId] || 888753760;  // デフォルトの話者ID
    const path = await speakVoice(messageContent, speakerId, guildId);

    while (voiceClient.state.status === VoiceConnectionStatus.Ready && getPlayer(guildId).state.status === AudioPlayerStatus.Playing) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (voiceClients[guildId] !== voiceClient) {
        console.log(`Voice client for guild ${guildId} has changed, stopping playback.`);
        return;
    }

    const resource = createFFmpegAudioSource(path);
    getPlayer(guildId).play(resource);
    voiceClient.subscribe(getPlayer(guildId));  // プレイヤーをボイスクライアントにサブスクライブ
    console.log(`Finished playing message: ${messageContent}`);
}

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member!;
    const guildId = member.guild.id;
    const voiceClient = voiceClients[guildId];

    if (member.user.bot) return;

    if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
        if (!oldState.channel && newState.channel) {
            // ユーザーがボイスチャンネルに参加したとき
            if (voiceClient.joinConfig.channelId === newState.channel.id) {
                const nickname = member.displayName;
                const path = await speakVoice(`${nickname} さんが入室しました。`, currentSpeaker[guildId] || 888753760, guildId);
                await play_audio(voiceClient, path, guildId);
            }
        } else if (oldState.channel && !newState.channel) {
            // ユーザーがボイスチャンネルから退出したとき
            if (voiceClient.joinConfig.channelId === oldState.channel.id) {
                const nickname = member.displayName;
                const path = await speakVoice(`${nickname} さんが退室しました。`, currentSpeaker[guildId] || 888753760, guildId);
                await play_audio(voiceClient, path, guildId);
            }

        } else if (oldState.channel && oldState.channel.members.size === 1) { // ボイスチャンネルにいるのがBOTだけの場合
            // ボイスチャンネルに誰もいなくなったら退室
            const voiceClient = voiceClients[guildId];
            if (voiceClient) {
                try {
                    console.log(`${voiceClient.joinConfig.guildId}: Only BOT is left in the channel, disconnecting.`);
                    voiceClient.disconnect();
                    delete voiceClients[guildId];
                } catch (error) {
                    console.error(`Error while disconnecting: ${error}`);
                }
            }
        }
    }

    // Auto join channels handling
    try {
        const autoJoinChannelsData = loadAutoJoinChannels();
        console.log(`Loaded autoJoinChannels data: ${JSON.stringify(autoJoinChannelsData)}`);

        const guildData = autoJoinChannelsData[guildId];
        if (!guildData) return;

        const voiceChannelId = guildData.voiceChannelId;
        const textChannelId = guildData.textChannelId;

        if (!oldState.channel && newState.channel) {
            if (voiceChannelId === newState.channel.id) {
                if (!voiceClients[guildId] || voiceClients[guildId].state.status !== VoiceConnectionStatus.Ready) {
                    try {
                        const voiceClient = await joinVoiceChannel({
                            channelId: newState.channel.id,
                            guildId: newState.guild.id,
                            adapterCreator: newState.guild.voiceAdapterCreator as any
                        });
                        voiceClients[guildId] = voiceClient;
                        textChannels[guildId] = client.channels.cache.get(textChannelId) as TextChannel;
                        console.log(`Connected to voice channel ${voiceChannelId} in guild ${guildId}`);

                        const path = await speakVoice("自動接続しました。", currentSpeaker[guildId] || 888753760, guildId);
                        if (path) {
                            await play_audio(voiceClient, path, guildId);
                        } else {
                            console.error("Error: Path is undefined or null.");
                        }
                    } catch (error) {
                        console.error(`Error: failed to connect to voice channel - ${error}`);
                    }
                }
            }
        } else if (oldState.channel && !newState.channel) {
            if (voiceClients[guildId] && voiceClients[guildId].state.status === VoiceConnectionStatus.Ready) {
                if (oldState.channel.members.size === 1) {
                    try {
                        console.log(`${voiceClients[guildId].joinConfig.guildId}: Only BOT is left in the channel, disconnecting.`);
                        voiceClients[guildId].disconnect();
                        delete voiceClients[guildId];
                    } catch (error) {
                        console.error(`Error while disconnecting: ${error}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error in on_voice_state_update: ${error}`);
    }
});

client.login(process.env.TOKEN);

async function fetchAllUUIDs(): Promise<{ [key: string]: any }> {
    try {
        const response = await fetch("http://localhost:10101/user_dict");
        if (!response.ok) {
            throw new Error(`Error fetching user dictionary: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error fetching user dictionary:", error);
        return {};
    }
}

