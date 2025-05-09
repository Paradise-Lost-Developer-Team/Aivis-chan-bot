import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ButtonInteraction, Interaction, MessageFlags } from "discord.js";

// アクティブなヘルプメニューを追跡するためのMap
const activeHelpMenus = new Map<string, HelpMenu>();

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
                    { name: "/ping", value: "BOTの応答時間をテストします。" },
                    { name: "/invite", value: "BOTの招待リンクを表示します。" },
                    { name: "/status", value: "BOTの現在の状態と接続情報を表示します。" },
                    { name: "/help", value: "このヘルプメニューを表示します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 読み上げコマンド")
                .setDescription("読み上げ機能に関するコマンドです。")
                .addFields(
                    { name: "/speak", value: "テキストを直接読み上げます。オプションで優先度を設定可能です。" },
                    { name: "/queue status", value: "現在の読み上げキューの状態を表示します。" },
                    { name: "/queue clear", value: "読み上げキューをクリアします。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 自動入室コマンド")
                .setDescription("自動入室に関するコマンドの一覧です。")
                .addFields(
                    { name: "/register_auto_join", value: "BOTの自動入室機能を登録します。" },
                    { name: "/unregister_auto_join", value: "自動接続の設定を解除します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 音声設定コマンド")
                .setDescription("音声設定に関するコマンドの一覧です。")
                .addFields(
                    { name: "/set_speaker", value: "話者を選択メニューから切り替えます。" },
                    { name: "/set_volume", value: "音量を設定します (0.0 - 2.0)。" },
                    { name: "/set_pitch", value: "音高を設定します (-1.0 - 1.0)。" },
                    { name: "/set_speed", value: "話速を設定します (0.5 - 2.0)。" },
                    { name: "/set_style_strength", value: "スタイルの強さを設定します (0.0 - 2.0)。" },
                    { name: "/set_tempo", value: "テンポの緩急を設定します (0.5 - 2.0)。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 辞書コマンド")
                .setDescription("辞書に関するコマンドの一覧です。")
                .addFields(
                    { name: "/add_word", value: "辞書に単語を登録します。" },
                    { name: "/edit_word", value: "辞書の単語を編集します。" },
                    { name: "/remove_word", value: "辞書から単語を削除します。" },
                    { name: "/list_words", value: "辞書の単語一覧を表示します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - Premium機能")
                .setDescription("有料プランで利用できる機能の一覧です。")
                .addFields(
                    { name: "/voice-history list", value: "Pro版: 最近の読み上げ履歴を表示します。" },
                    { name: "/voice-history search", value: "Pro版: 履歴をキーワードで検索します。" },
                    { name: "/voice-history user", value: "Pro版: 特定ユーザーの履歴を表示します。" },
                    { name: "/voice-history clear", value: "Premium版: 履歴をクリアします。" },
                    { name: "/subscription info", value: "サブスクリプション情報を表示します。" },
                    { name: "/subscription purchase", value: "サブスクリプションを購入します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - Premium特典")
                .setDescription("各プランで利用できる特典の詳細です。")
                .addFields(
                    { name: "Pro特典", value: "読み上げ履歴保存(500件)、広告非表示、優先サポート、音声プリセット3つまで" },
                    { name: "Premium特典", value: "Pro特典に加え、カスタム音声作成、履歴無制限、API連携、優先処理キュー、サポートサーバーでのVIPロール" },
                    { name: "​​プラン比較", value: "/subscription compare コマンドで各プランの詳細な比較表を表示できます。" },
                    { name: "サポート", value: "有料プランに関するお問い合わせは /support premium で専用サポートを受けられます。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - キュー処理と読み上げ優先度")
                .setDescription("読み上げメッセージは優先度に基づいてキュー処理されます。")
                .addFields(
                    { name: "優先度：高", value: "システム通知や優先コマンドは他のメッセージより先に読み上げられます。" },
                    { name: "優先度：通常", value: "一般的なメッセージは通常の優先度で処理されます。" },
                    { name: "優先度：低", value: "長文やURLを多く含むメッセージは低優先度で処理されます。" },
                    { name: "キューの管理", value: "/queue コマンドでキューの状態確認やクリアができます。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - その他の機能")
                .setDescription("その他の便利な機能の説明です。")
                .addFields(
                    { name: "メンション読み上げ", value: "ユーザーメンションは自動的にユーザー名に変換されて読み上げられます。" },
                    { name: "URL省略", value: "URLは「URL省略」と読み上げられます。" },
                    { name: "スポイラー省略", value: "スポイラータグは「ネタバレ」と読み上げられます。" },
                    { name: "絵文字変換", value: "カスタム絵文字は「絵文字」と読み上げられます。" },
                    { name: "読み上げ停止", value: "メッセージ冒頭に「(音量0)」と付けると読み上げません。" },
                    { name: "コードブロック", value: "コードブロック（```で囲まれた部分）は読み上げられません。" }
                )
                .setColor(0x3498db),
            // 統計コマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - 統計コマンド")
                .setDescription("システムの利用状況や統計情報を表示します。")
                .addFields(
                    { name: "/stats", value: "システム全体の利用状況、使用統計、アップタイムを表示します。" }
                )
                .setColor(0x3498db),
            // 音声スタイルコマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - 音声スタイルコマンド")
                .setDescription("カスタム音声スタイルに関するコマンドです。")
                .addFields(
                    { name: "/voice-style list", value: "利用可能なカスタム音声スタイルを一覧表示します。" },
                    { name: "/voice-style set",  value: "指定した音声スタイルに変更します。" },
                    { name: "/voice-style reset",value: "デフォルトの音声スタイルにリセットします。" }
                )
                .setColor(0x3498db),
            // Patreonコマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - Patreonコマンド")
                .setDescription("Patreon連携に関するコマンドです。")
                .addFields(
                    { name: "/patreon link",      value: "DiscordアカウントとPatreonアカウントを連携します。" },
                    { name: "/patreon benefits",  value: "Patreon支援者向け特典を表示します。" }
                )
                .setColor(0x3498db),
            // Reminderコマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - リマインダーコマンド")
                .setDescription("リマインダー機能に関するコマンドです。以下のサブコマンドがあります。")
                .addFields(
                    { name: "/reminder set", value: "新しいリマインダーを設定します。", inline: true },
                    { name: "/reminder list", value: "設定済みのリマインダーを一覧表示します。", inline: true },
                    { name: "/reminder cancel", value: "指定したリマインダーをキャンセルします。", inline: true }
                )
                .setColor(0x3498db),
            // 最新機能ページ: チャットコマンド
            new EmbedBuilder()
                .setTitle("ヘルプ - AIチャットコマンド")
                .setDescription("チャット機能に関するコマンドです。")
                .addFields(
                    { name: "/chat", value: "Google Gemini 1.5-Pro を使ったAIチャットを実行します。" }
                )
                .setColor(0x3498db),

            // 最新機能ページ: 入退室Embed通知
            new EmbedBuilder()
                .setTitle("ヘルプ - 入退室Embed通知")
                .setDescription("/joinleave で入退室通知のEmbedを有効化/無効化します。")
                .addFields(
                    { name: "/joinleave enable", value: "入退室Embed通知を有効化します。", inline: true },
                    { name: "/joinleave disable", value: "入退室Embed通知を無効化します。", inline: true }
                )
                .setColor(0x3498db)
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

    public getTotalPages(): number {
        return this.pages.length;
    }

    // currentPageのゲッターを追加
    public getCurrentPageNumber(): number {
        return this.currentPage;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('利用可能なコマンドの一覧を表示します。'),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const helpMenu = new HelpMenu();
            const helpEmbed = helpMenu.getCurrentPage();
            const pageInfo = `ページ ${helpMenu.getCurrentPageNumber() + 1}/${helpMenu.getTotalPages()}`;
            
            // 一意なIDを生成
            const messageKey = `help_${Date.now()}`;
            activeHelpMenus.set(messageKey, helpMenu);
            
            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`previous_${messageKey}`)
                        .setLabel('前のページ')
                        .setStyle(ButtonStyle.Primary)
                )
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`next_${messageKey}`)
                        .setLabel('次のページ')
                        .setStyle(ButtonStyle.Primary)
                );
                
            await interaction.reply({
                content: pageInfo,
                embeds: [helpEmbed],
                components: [actionRow]
            });
            
            // 10分後にヘルプメニューをMapから削除
            setTimeout(() => {
                activeHelpMenus.delete(messageKey);
            }, 10 * 60 * 1000);
        } catch (error) {
            console.error("helpコマンド実行エラー:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: "ヘルプメニューの表示中にエラーが発生しました。", 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    },
    
    // ボタンインタラクションハンドラ
    async buttonHandler(interaction: ButtonInteraction) {
        try {
            // カスタムIDからアクションとメッセージキーを抽出
            const customId = interaction.customId;
            let action: string, messageKey: string;
            
            if (customId.startsWith('previous_')) {
                action = 'previous';
                messageKey = customId.replace('previous_', '');
            } else if (customId.startsWith('next_')) {
                action = 'next';
                messageKey = customId.replace('next_', '');
            } else {
                console.error(`不明なボタンID: ${customId}`);
                return;
            }
            
            console.log(`ボタンハンドラー呼び出し: ${action}, ${messageKey}`);
            
            // 該当するヘルプメニューを取得
            const helpMenu = activeHelpMenus.get(messageKey);
            if (!helpMenu) {
                return await interaction.reply({
                    content: 'このヘルプメニューは期限切れです。もう一度 /help コマンドを実行してください。',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // ボタンのアクションに応じてページを変更
            if (action === 'previous') {
                helpMenu.previousPage();
            } else if (action === 'next') {
                helpMenu.nextPage();
            }
            
            const helpEmbed = helpMenu.getCurrentPage();
            const pageInfo = `ページ ${helpMenu.getCurrentPageNumber() + 1}/${helpMenu.getTotalPages()}`;
            
            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`previous_${messageKey}`)
                        .setLabel('前のページ')
                        .setStyle(ButtonStyle.Primary)
                )
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`next_${messageKey}`)
                        .setLabel('次のページ')
                        .setStyle(ButtonStyle.Primary)
                );
            
            // インタラクションを更新
            await interaction.update({
                content: pageInfo,
                embeds: [helpEmbed],
                components: [actionRow]
            });
        } catch (error) {
            console.error("ボタンハンドラーエラー:", error);
            // インタラクションが既に処理されていない場合のみ応答
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: "ページ切り替え中にエラーが発生しました。",
                        flags: MessageFlags.Ephemeral
                    });
                } catch (e) {
                    console.error("エラー応答中にさらにエラー:", e);
                }
            }
        }
    }
};