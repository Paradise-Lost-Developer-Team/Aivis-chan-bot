"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const voice_1 = require("@discordjs/voice");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('join')
        .setDescription('BOTをチャンネルに参加させます')
        .addChannelOption(option => option.setName('voice_channel') // 小文字に変更
        .setDescription('参加するボイスチャンネル')
        .setRequired(false)
        .addChannelTypes(discord_js_1.ChannelType.GuildVoice))
        .addChannelOption(option => option.setName('text_channel') // 小文字に変更
        .setDescription('参加するテキストチャンネル')
        .setRequired(false)
        .addChannelTypes(discord_js_1.ChannelType.GuildText)),
    async execute(interaction) {
        let voiceChannel = interaction.options.get("voice_channel")?.channel;
        let textChannel = interaction.options.get("text_channel")?.channel;
        if (!voiceChannel) {
            // コマンド実行者が接続しているボイスチャンネルを取得
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            if (member?.voice.channel) {
                voiceChannel = member.voice.channel;
            }
            else {
                await interaction.reply("ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。");
                return;
            }
        }
        if (!textChannel) {
            // コマンド実行チャンネルを使用
            textChannel = interaction.channel;
        }
        const guildId = interaction.guildId;
        // 既に接続しているかチェック
        let voiceClient = TTS_Engine_1.voiceClients[guildId];
        if (voiceClient) {
            // 現在Botが接続しているボイスチャンネルを取得
            const currentVoiceChannel = interaction.guild?.channels.cache.find(ch => ch.isVoiceBased() && ch.members.has(interaction.client.user.id));
            if (currentVoiceChannel) {
                // 既に接続しているチャンネルと指定されたチャンネルが異なる場合
                if (currentVoiceChannel.id !== voiceChannel.id) {
                    await interaction.reply({
                        content: `❌ 既に別のボイスチャンネル「${currentVoiceChannel.name}」に接続しています。\n他のチャンネルに移動させるには、まず \`/leave\` コマンドで退出させてから再度呼んでください。`,
                        flags: discord_js_1.MessageFlags.Ephemeral
                    });
                    return;
                }
                else {
                    // 同じチャンネルの場合
                    TTS_Engine_1.textChannels[guildId] = textChannel; // テキストチャンネルの更新のみ
                    await interaction.reply(`✅ 既に「${currentVoiceChannel.name}」に接続しています。テキストチャンネルを「${textChannel.name}」に設定しました。`);
                    return;
                }
            }
        }
        TTS_Engine_1.textChannels[guildId] = textChannel;
        try {
            voiceClient = await (0, voice_1.joinVoiceChannel)({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: true, // スピーカーはOFF（聞こえない）
                selfMute: false // マイクはON（話せる）
            });
            TTS_Engine_1.voiceClients[guildId] = voiceClient;
            // 新規：取得したチャネル情報を join_channels.json に保存
            (0, TTS_Engine_1.updateJoinChannelsConfig)(guildId, voiceChannel.id, textChannel.id);
            await interaction.reply(`${voiceChannel.name} に接続しました。`);
            (0, TTS_Engine_1.loadJoinChannels)();
            // 追加: Ready になるまで待機
            await new Promise((resolve) => {
                const onReady = () => {
                    voiceClient.off(voice_1.VoiceConnectionStatus.Disconnected, onError);
                    resolve();
                };
                const onError = () => {
                    voiceClient.off(voice_1.VoiceConnectionStatus.Ready, onReady);
                    resolve();
                };
                voiceClient.once(voice_1.VoiceConnectionStatus.Ready, onReady);
                voiceClient.once(voice_1.VoiceConnectionStatus.Disconnected, onError);
            });
            // 読み上げ開始
            await (0, TTS_Engine_1.speakVoice)("接続しました。", TTS_Engine_1.currentSpeaker[guildId] || 888753760, guildId);
        }
        catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply("ボイスチャンネルへの接続に失敗しました。");
            }
        }
    }
};
//# sourceMappingURL=join.js.map