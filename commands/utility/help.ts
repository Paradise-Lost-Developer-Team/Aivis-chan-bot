import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, ButtonInteraction } from "discord.js";
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
module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays the help menu'),
    async execute(interaction: { commandName: string; reply: (arg0: { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[]; }) => any; channel: { createMessageComponentCollector: (arg0: { filter: (i: Interaction) => boolean; time: number; }) => any; }; }) {
        if (interaction.commandName === "help") {
            const helpMenu = new HelpMenu();
            const embed = helpMenu.getCurrentPage();
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('戻る')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('次へ')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [row] });

            const filter = (i: Interaction) => (i as ButtonInteraction).customId === 'previous' || (i as ButtonInteraction).customId === 'next';
            const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60000 });

            collector?.on('collect', async (i: { customId: string; update: (arg0: { embeds: EmbedBuilder[]; }) => any; }) => {
                if (i.customId === 'previous') {
                    const embed = helpMenu.previousPage();
                    await i.update({ embeds: [embed] });
                } else if (i.customId === 'next') {
                    const embed = helpMenu.nextPage();
                    await i.update({ embeds: [embed] });
                }
            });
        }
    }
};