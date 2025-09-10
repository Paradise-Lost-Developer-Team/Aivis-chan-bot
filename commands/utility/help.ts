import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ButtonInteraction, Interaction, MessageFlags } from "discord.js";
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

// アクティブなヘルプメニューを追跡するためのMap
const activeHelpMenus = new Map<string, HelpMenu>();

class HelpMenu {
    private pages: EmbedBuilder[];
    private currentPage: number;

    constructor() {
        this.pages = [
            new EmbedBuilder()
                .setTitle("ヘルプ - 基本コマンド")
                .setDescription("よく使う基本コマンドの一覧です。スラッシュコマンドで実行してください。")
                .addFields(
                    { name: "/join", value: "現在のボイスチャンネルに接続して読み上げを開始します。" },
                    { name: "/leave", value: "接続中のボイスチャンネルから切断します。" },
                    { name: "/ping", value: "BOTの応答速度と接続状態を表示します。" },
                    { name: "/invite", value: "BOTの招待リンクを表示します。" },
                    { name: "/status", value: "現在のBOT稼働状況と統計を表示します。" },
                    { name: "/help", value: "このヘルプメニューを表示します（ページ送りボタンで切り替え）。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 読み上げ / キュー管理")
                .setDescription("読み上げとキューの操作に関連するコマンドです。")
                .addFields(
                    { name: "/speak <text>", value: "指定したテキストを即座に読み上げます。長文はキューに追加されます。" },
                    { name: "/queue", value: "読み上げキューの状況を表示します。サブコマンド：status / clear / list。" },
                    { name: "/queue clear", value: "キュー内のメッセージを全て削除します（管理者のみ）。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 自動入室／自動化 (autojoin)")
                .setDescription("自動入室や自動読み上げの設定コマンドです。`/autojoin` サブコマンドを使用してください。")
                .addFields(
                    { name: "/autojoin add", value: "ボイスチャンネルと任意のテキストチャンネルを指定して自動入室を登録します。" },
                    { name: "/autojoin remove", value: "登録済みの自動入室設定を削除します。" },
                    { name: "/autojoin list", value: "登録済みの自動入室設定を一覧表示します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 音声設定 (voicesettings)")
                .setDescription("音声設定は `/voicesettings` コマンドで管理します。サブコマンドで各種パラメータを設定してください。")
                .addFields(
                    { name: "/voicesettings speaker <name>", value: "話者（音声）を選択します。利用可能な話者はリストから選択。" },
                    { name: "/voicesettings volume <0.0-2.0>", value: "再生音量を設定します。" },
                    { name: "/voicesettings pitch <-0.15-0.15>", value: "音の高さを調整します。" },
                    { name: "/voicesettings speed <0.5-2.0>", value: "再生速度を調整します。" },
                    { name: "/voicesettings intonation <0.0-2.0>", value: "イントネーション（感情表現）の強さを設定します。" },
                    { name: "/voicesettings tempo <0.5-2.0>", value: "話す速さの緩急の強弱を調整します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - 辞書 / テキスト整形 (dictionaries)")
                .setDescription("サーバー辞書は `/dictionaries` コマンドで操作します。サブコマンドを指定してください。")
                .addFields(
                    { name: "/dictionaries add", value: "辞書に単語を追加します。例: /dictionaries add word:GitHub pronounce:ギットハブ" },
                    { name: "/dictionaries remove", value: "辞書から単語を削除します。例: /dictionaries remove word:GitHub" },
                    { name: "/dictionaries list", value: "サーバー辞書を一覧表示します。" },
                    { name: "/dictionaries edit", value: "既存の辞書エントリを編集します。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - キュー優先度と運用")
                .setDescription("キュー挙動や優先度ルールの説明です。")
                .addFields(
                    { name: "優先度: 高", value: "システム通知や管理者からのメッセージは優先的に読み上げられます。" },
                    { name: "優先度: 通常", value: "一般メッセージは通常優先度で処理されます。" },
                    { name: "優先度: 低", value: "長文やメディアを含むメッセージは低優先度になります。" },
                    { name: "キュー管理", value: "/queue で状態確認、/queue clear で全消去できます。" }
                )
                .setColor(0x3498db),
            new EmbedBuilder()
                .setTitle("ヘルプ - その他の機能と注意点")
                .setDescription("読み上げに関する補足と便利機能の説明です。")
                .addFields(
                    { name: "メンション処理", value: "メンションはユーザー名に変換して読み上げます。" },
                    { name: "URL処理", value: "URLは短縮して『URL』と読み上げられます。" },
                    { name: "スポイラー", value: "スポイラーは『ネタバレ』と置換されます。" },
                    { name: "絵文字", value: "カスタム絵文字は『絵文字』と読み替えます。" },
                    { name: "読み上げスキップ", value: "先頭に (音量0) を付けると読み上げをスキップします。" },
                    { name: "コードブロック", value: "コードブロックはデフォルトで読み上げません。" }
                )
                .setColor(0x3498db),
            // 統計コマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - 統計 / 運用コマンド")
                .setDescription("システムやサーバーの利用状況を確認するコマンドです。")
                .addFields(
                    { name: "/stats", value: "BOT全体の稼働統計とサービス状況を表示します。" },
                    { name: "/bot-stats", value: "内部向け: 各インスタンスの統計を集約して表示します（管理用）。" }
                )
                .setColor(0x3498db),
            // 音声スタイルコマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - 音声スタイル / プリセット")
                .setDescription("カスタム音声スタイルやプリセット管理のコマンドです。")
                .addFields(
                    { name: "/voice-style list", value: "利用可能な音声スタイル一覧を表示します。" },
                    { name: "/voice-style set <name>",  value: "指定した音声スタイルを適用します。" },
                    { name: "/voice-style reset", value: "音声スタイルをデフォルトに戻します。" }
                )
                .setColor(0x3498db),
            // Reminderコマンドページ
            new EmbedBuilder()
                .setTitle("ヘルプ - リマインダー")
                .setDescription("リマインダー機能の主なサブコマンドです。")
                .addFields(
                    { name: "/reminder set <when> <text>", value: "リマインダーを新規登録します。", inline: true },
                    { name: "/reminder list", value: "登録済みリマインダーを一覧表示します。", inline: true },
                    { name: "/reminder cancel <id>", value: "指定したリマインダーをキャンセルします。", inline: true }
                )
                .setColor(0x3498db),
            // 最新機能ページ: チャットコマンド
            new EmbedBuilder()
                .setTitle("ヘルプ - AIチャット / 対話")
                .setDescription("AI対話やチャット機能に関するコマンドです。")
                .addFields(
                    { name: "/chat <prompt>", value: "Google Geminiまたは指定モデルを使った対話を行います。" },
                    { name: "/chat history", value: "最近のチャット履歴を表示します。" }
                )
                .setColor(0x3498db),
            // Pro機能ページ（このBotはPro/Premium向け）
            new EmbedBuilder()
                .setTitle("ヘルプ - Pro 機能（有料）")
                .setDescription("Proプランで利用できる主な特典と利用方法です。")
                .addFields(
                    { name: "Patreon認証（必須）", value: "まず `/patreon link` でPatreon連携を行い、`/subscription info` で認証状態を確認してください。例外コマンド（`/subscription`・`/patreon`）以外は認証済みユーザーのみ実行できます。" },
                    { name: "読み上げキュー優先度の向上", value: "Freeより高い優先度で処理され、待ち時間が短縮されます。" },
                    { name: "上限緩和", value: "同時接続・キュー長・レート制限などの運用上限がFreeより緩和されます。" },
                    { name: "音声品質・スタイルの強化", value: "高品質な音声設定や追加のスタイル/プリセットが解放されます。" },
                    { name: "サポート優先度", value: "Discordでのサポート応答が優先されます。" }
                )
                .setColor(0x2ecc71),
            // Premium機能ページ
            new EmbedBuilder()
                .setTitle("ヘルプ - Premium 機能（有料）")
                .setDescription("Premiumプランで利用できる最上位特典と利用方法です。")
                .addFields(
                    { name: "Patreon認証（必須）", value: "`/patreon link` → `/subscription info` の順で認証を完了してください。例外（`/subscription`・`/patreon`）以外のコマンドは認証済みユーザー限定です。" },
                    { name: "最優先キュー処理", value: "全プラン中で最も高い優先度で読み上げが行われます。" },
                    { name: "大幅な上限緩和/無制限に近い運用", value: "同時接続やキューの上限がさらに拡張され、大規模サーバーでも快適に運用できます。" },
                    { name: "カスタム話者・外部API連携", value: "（提供状況に応じて）カスタム話者の追加や外部連携APIの利用が可能です。詳細は `/help` 内の設定/スタイル項目や公式ドキュメントをご参照ください。" },
                    { name: "最優先サポート", value: "Discord/メール等でのサポートを最優先でご提供します。" }
                )
                .setColor(0xf1c40f),
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
            const helpEmbed = addCommonFooter(helpMenu.getCurrentPage());
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
                components: [actionRow, getCommonLinksRow()]
            });
            
            // 10分後にヘルプメニューをMapから削除
            setTimeout(() => {
                activeHelpMenus.delete(messageKey);
            }, 10 * 60 * 1000);
        } catch (error) {
            console.error("helpコマンド実行エラー:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('ヘルプメニューの表示中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )],
                    flags: MessageFlags.Ephemeral,
                    components: [getCommonLinksRow()]
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
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('期限切れ')
                            .setDescription('このヘルプメニューは期限切れです。もう一度 /help コマンドを実行してください。')
                            .setColor(0xffa500)
                    )],
                    flags: MessageFlags.Ephemeral,
                    components: [getCommonLinksRow()]
                });
            }
            
            // ボタンのアクションに応じてページを変更
            if (action === 'previous') {
                helpMenu.previousPage();
            } else if (action === 'next') {
                helpMenu.nextPage();
            }
            
            const helpEmbed = addCommonFooter(helpMenu.getCurrentPage());
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
                components: [actionRow, getCommonLinksRow()]
            });
        } catch (error) {
            console.error("ボタンハンドラーエラー:", error);
            // インタラクションが既に処理されていない場合のみ応答
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('エラー')
                                .setDescription('ページ切り替え中にエラーが発生しました。')
                                .setColor(0xff0000)
                        )],
                        flags: MessageFlags.Ephemeral,
                        components: [getCommonLinksRow()]
                    });
                } catch (e) {
                    console.error("エラー応答中にさらにエラー:", e);
                }
            }
        }
    }
};