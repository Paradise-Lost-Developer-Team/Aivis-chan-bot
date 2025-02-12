import discord
from discord import app_commands
from discord.player import FFmpegPCMAudio
from discord.ui import Button, View, Select
import requests
import json
import asyncio
import io
import tempfile
from config import TOKEN
import re
import os

server_statuses = {}

activity = discord.Activity(name="起動中…", type=discord.ActivityType.playing)
intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True
intents.guilds = True
client = discord.Client(intents=intents, activity=activity)
tree = app_commands.CommandTree(client)
join_command_connected = False
text_channels = {} # テキストチャンネルを格納する辞書
guild_id = {}  # ギルドIDを格納するための辞書
voice_clients = {} # キューを格納するための辞書
current_speaker = {}  # ギルドまたはユーザーごとの音声設定
auto_join_channels = {} # 自動入室するボイスチャンネル
audio_queues = {}  # ギルドごとの音声キュー

FFMPEG_PATH = "C:/ffmpeg/bin/ffmpeg.exe"

class Voice_Channels:
    def __init__(self, voice_clients: int):
        self.voice_clients = voice_clients
        asyncio.create_task(self.save_task())
    
    async def save_task(self):
        while True:
            # voice_clientsを保存するロジックをここに追加
            print(f"Saving voice_clients: {self.voice_clients}")
            await asyncio.sleep(60)  # 60秒ごとに保存

class ServerStatus:
    def __init__(self, guild_id: int):
        self.guild_id = guild_id
        asyncio.create_task(self.save_task())
    
    async def save_task(self):
        while True:
            # guild.idを保存するロジックをここに追加
            print(f"Saving guild id: {self.guild_id}")
            await asyncio.sleep(60)  # 60秒ごとに保存

class AivisAdapter:
    def __init__(self):
        # APIサーバーのエンドポイントURL
        self.URL = "http://127.0.0.1:10101"
        # 話者ID (話させたい音声モデルidに変更してください)
        self.speaker = {}

    def speak_voice(self, text: str, voice_client: discord.VoiceClient):
        params = {"text": text, "speaker": self.speaker}
        query_response = requests.post(f"{self.URL}/audio_query", params=params).json()

        audio_response = requests.post(
            f"{self.URL}/synthesis",
            params={"speaker": self.speaker},
            data=json.dumps(query_response)
        )
        voice_client.play(create_ffmpeg_audio_source(io.BytesIO(audio_response.content)))

def create_ffmpeg_audio_source(path: str):
    return FFmpegPCMAudio(path, executable=FFMPEG_PATH)

def post_audio_query(text: str, speaker: int):
    params = {"text": text, "speaker": speaker}
    response = requests.post("http://127.0.0.1:10101/audio_query", params=params)
    return response.json()

def post_synthesis(audio_query: dict, speaker: int):
    response = requests.post(
        "http://127.0.0.1:10101/synthesis",
        params={"speaker": speaker},
        headers={"accept": "audio/wav", "Content-Type": "application/json"},
        data=json.dumps(audio_query),
    )
    return response.content

voice_settings = {
    "volume": {},  # デフォルトの音量を0.2に設定
    "pitch": {},
    "rate": {},
    "speed": {},
    "style_strength": {},
    "tempo": {}
}

def adjust_audio_query(audio_query: dict, guild_id: int):
    audio_query["volumeScale"] = voice_settings["volume"].get(guild_id, 0.2)  # デフォルトの音量を0.2に設定
    audio_query["pitchScale"] = voice_settings["pitch"].get(guild_id, 0.0)
    audio_query["rateScale"] = voice_settings["rate"].get(guild_id, 1.0)
    audio_query["speedScale"] = voice_settings["speed"].get(guild_id, 1.0)
    audio_query["styleStrength"] = voice_settings["style_strength"].get(guild_id, 1.0)
    audio_query["tempoScale"] = voice_settings["tempo"].get(guild_id, 1.0)
    return audio_query

DICTIONARY_FILE = "guild_dictionaries.json"
guild_dictionary = {}

try:
    with open(DICTIONARY_FILE, "r", encoding="utf-8") as file:
        guild_dictionary = json.load(file)
except (FileNotFoundError, json.JSONDecodeError):
    guild_dictionary = {}

MAX_TEXT_LENGTH = 200  # 読み上げる文章の文字数上限

def speak_voice(text: str, speaker: int, guild_id: int):
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH] + "..."  # 上限を超えた場合は切り捨てて "..." を追加
    audio_query = post_audio_query(text, speaker)
    audio_query = adjust_audio_query(audio_query, guild_id)
    audio_content = post_synthesis(audio_query, speaker)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio_file:
        temp_audio_file.write(audio_content)
        temp_audio_file_path = temp_audio_file.name
    return temp_audio_file_path

async def fetch_uuids_periodically():
    while True:
        fetch_all_uuids()
        await asyncio.sleep(300)  # 5分ごとに実行

AUTO_JOIN_FILE = "auto_join_channels.json"
auto_join_channels = {}

def load_auto_join_channels():
    try:
        with open(AUTO_JOIN_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict):  # JSONが辞書形式であることを確認
                return data  # そのまま辞書として返す
            else:
                print("⚠️ JSONのフォーマットが正しくありません。")
                return {}
    except FileNotFoundError:
        print("❌ auto_join_channels.json が見つかりません。")
        return {}
    except json.JSONDecodeError:
        print("❌ JSONファイルのフォーマットエラーが発生しました。")
        return {}
    except Exception as e:
        print(f"❌ 予期しないエラーが発生しました: {e}")
        return {}


def save_auto_join_channels():
    with open(AUTO_JOIN_FILE, "w", encoding="utf-8") as file:
        json.dump(auto_join_channels, file, ensure_ascii=False, indent=4)

TEXT_CHANELS_JSON = "text_channels.json"

def load_text_channels():
    try:
        with open('text_channels.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_text_channels():
    with open(TEXT_CHANELS_JSON, 'w') as f:
        json.dump(text_channels, f)

@client.event
async def on_ready():
    print("起動完了")
    try:
        synced = await tree.sync()
        print(f"{len(synced)}個のコマンドを同期しました")
    except Exception as e:
        print(e)

    # 15秒毎にアクティヴィティを更新します
    client.loop.create_task(fetch_uuids_periodically())  # UUID取得タスクを開始
    while True:
        joinserver = len(client.guilds)
        servers = str(joinserver)
        await client.change_presence(
            activity=discord.CustomActivity(name="サーバー数:" + servers))
        await asyncio.sleep(15)
        joinvc = len(client.voice_clients)
        vc = str(joinvc)
        await client.change_presence(
            activity=discord.CustomActivity(name="VC:" + vc))
        await asyncio.sleep(15)


async def play_audio_queue(guild_id):
    """ 音声キューを順番に再生するための処理 """
    vc = voice_clients.get(guild_id)
    if not vc:
        return

    while not audio_queues[guild_id].empty():
        audio_path = await audio_queues[guild_id].get()
        if not vc.is_playing():
            vc.play(create_ffmpeg_audio_source(audio_path))
            while vc.is_playing():
                await asyncio.sleep(1)  # 再生が終わるまで待機

@tree.command(
    name="join", 
    description="ボイスチャンネルに接続し、指定したテキストチャンネルのメッセージを読み上げます。"
)
async def join_command(
    interaction: discord.Interaction, 
    voice_channel: discord.VoiceChannel = None, 
    text_channel: discord.TextChannel = None
):
    global voice_clients, text_channels, join_command_connected
    join_command_connected = True

    # サーバー外では実行不可
    if interaction.guild is None:
        await interaction.response.send_message(
            "このコマンドはサーバー内でのみ使用できます。", 
            ephemeral=True
        )
        return

    # guild_id を必ず定義する
    guild_id = str(interaction.guild.id)

    # ユーザーがボイスチャンネルを指定していない場合は、自身が接続しているボイスチャンネルを取得する
    if voice_channel is None:
        if not interaction.user.voice or not interaction.user.voice.channel:
            await interaction.response.send_message(
                "あなたはボイスチャンネルに接続していません。",
                ephemeral=True
            )
            return
        voice_channel = interaction.user.voice.channel

    # テキストチャンネルが指定されていなければ、コマンド実行チャンネルを使用する
    if text_channel is None:
        text_channel = interaction.channel

    # テキストチャンネルの情報を保存する
    if guild_id not in text_channels:
        text_channels[guild_id] = {}
    text_channels[guild_id]["text_channel"] = text_channel

    print(
        f"Join command: guild={interaction.guild.id}, "
        f"voice_channel={voice_channel.id}, text_channel={text_channel.id}"
    )

    try:
        voice_client = voice_clients.get(interaction.guild.id)
        if voice_client and voice_client.is_connected():
            await voice_client.move_to(voice_channel)
            print(f"Moved to voice channel {voice_channel.id}")
            await interaction.response.send_message(
                f"{voice_channel.name} に移動しました。\n読み上げチャンネル: {text_channel.mention}"
            )
            path = speak_voice(
                f"{voice_channel.name} に移動しました。",
                current_speaker.get(interaction.guild.id, 888753760),
                interaction.guild.id,
            )
            await play_audio(voice_client, path)
        else:
            voice_clients[interaction.guild.id] = await voice_channel.connect()
            print(f"Connected to voice channel {voice_channel.id}")
            await interaction.response.send_message(
                f"{voice_channel.name} に接続しました。\n読み上げチャンネル: {text_channel.mention}"
            )
            path = speak_voice(
                f"{voice_channel.name} に接続しました。",
                current_speaker.get(interaction.guild.id, 888753760),
                interaction.guild.id,
            )
            await play_audio(voice_clients[interaction.guild.id], path)
    except discord.errors.ClientException as error:
        print(f"Error: {error}")
        await interaction.response.send_message(f"エラー: {error}")

@tree.command(
    name="leave", description="ボイスチャンネルから切断します。"
)
async def leave_command(interaction: discord.Interaction):
    global voice_clients
    guild_id_int = interaction.guild.id
    guild_id_str = str(guild_id_int)

    # 整数型、または文字列型のキーのどちらかで登録されているかチェック
    if guild_id_int in voice_clients:
        voice_client = voice_clients[guild_id_int]
        key_used = guild_id_int
    elif guild_id_str in voice_clients:
        voice_client = voice_clients[guild_id_str]
        key_used = guild_id_str
    else:
        await interaction.response.send_message("現在、ボイスチャンネルに接続していません。")
        return

    try:
        await voice_client.disconnect()
    except Exception as e:
        await interaction.response.send_message(f"切断中にエラーが発生しました: {e}")
        return

    del voice_clients[key_used]
    await interaction.response.send_message("ボイスチャンネルから切断しました。")


# ping応答コマンドを定義します
@tree.command(
    name="ping", description="BOTの応答時間をテストします。"
)
async def ping_command(interaction: discord.Interaction):
    text = f"Pong! BotのPing値は{round(client.latency*1000)}msです。"
    embed = discord.Embed(title="Latency", description=text)
    print(text)
    await interaction.response.send_message(embed=embed)

@tree.command(
    name="register_auto_join", description="BOTの自動入室機能を登録します。"
)
@app_commands.describe(
    voice_channel="自動入室するボイスチャンネルを選択してください。",
    text_channel="通知を送るテキストチャンネルを選択してください。(任意)"
)
async def register_auto_join_command(
    interaction: discord.Interaction,
    voice_channel: discord.VoiceChannel,
    text_channel: discord.TextChannel = None
):
    global auto_join_channels
    load_auto_join_channels()
    guild_id = str(interaction.guild.id)

    if voice_channel:
        if text_channel is not None:
            auto_join_channels[guild_id] = {
                "voice_channel_id": str(voice_channel.id),
                "text_channel_id": str(text_channel.id)
            }
        else:
            auto_join_channels[guild_id] = {
                "voice_channel_id": str(voice_channel.id),
                "text_channel_id": str(voice_channel.id)
            }
    
    save_auto_join_channels()
    guild = interaction.guild
    channel_name = text_channel.name if text_channel else voice_channel.name
    await interaction.response.send_message(
        f"サーバー {guild.name} の自動入室チャンネルを {channel_name} に設定しました。"
    )

@tree.command(
    name="unregister_auto_join",
    description="自動接続の設定を解除します。"
)
async def unregister_auto_join(interaction: discord.Interaction):
    global auto_join_channels
    guild_id = str(interaction.guild.id)
    
    # 登録時と同じグローバル変数を更新する
    # もし load_auto_join_channels() がグローバル変数 auto_join_channels を更新するなら呼び出すだけでOKです
    auto_join_channels = load_auto_join_channels()  # もしくは、load_auto_join_channels()が既にグローバル変数を更新していれば不要

    if guild_id in auto_join_channels:
        del auto_join_channels[guild_id]
        save_auto_join_channels()  # グローバル変数 auto_join_channels を保存
        await interaction.response.send_message("自動接続設定を解除しました。")
    else:
        await interaction.response.send_message("このサーバーには登録された自動接続設定がありません。", ephemeral=True)



# URL、ファイル、EMBEDを除外するための正規表現パターン
URL_PATTERN = r"https?://[^\s]+"

# カスタム絵文字(Nitroを含む)を除外するための正規表現パターン
CUSTOM_EMOJI_REGEX = r"<a?:\w+:\d+>"

@client.event
async def on_message(message):
    if message.author.bot:
        return

    try:
        guild_id = str(message.guild.id)

        # メッセージの前処理
        message_content = preprocess_message(message.content)

        # 自動入室設定の確認
        auto_join_channels = load_auto_join_channels()
        if guild_id in auto_join_channels:
            voice_channel_id = auto_join_channels[guild_id].get("voice_channel_id")
            text_channel_id = auto_join_channels[guild_id].get("text_channel_id")

            # ボイスチャンネル接続
            voice_client = await ensure_voice_connection(guild_id, voice_channel_id)

            # 指定されたテキストチャンネルで発言された場合のみ処理
            if voice_client and str(message.channel.id) == text_channel_id:
                asyncio.create_task(handle_message(message))
        else:
            print(f"Guild {guild_id} の自動入室設定なし")
    
    except Exception as e:
        print(f"エラー発生: {e}")

def preprocess_message(content):
    """ メッセージの不要な部分を削除 """
    content = re.sub(r'\|\|.*?\|\|', '', content)  # スポイラー除外
    content = re.sub(r'<@!?[0-9]+>', '', content)  # メンション除外
    content = re.sub(r'<#!?[0-9]+>', '', content)  # チャンネルメンション除外
    content = re.sub(r'\*|_|~|`', '', content)  # マークダウン記法除外
    return content

async def ensure_voice_connection(guild_id, channel_id):
    """ 指定のボイスチャンネルに接続を確保 """
    if not channel_id:
        return None

    channel = client.get_channel(int(channel_id))
    if channel and isinstance(channel, discord.VoiceChannel):
        if guild_id not in voice_clients or not voice_clients[guild_id].is_connected():
            voice_clients[guild_id] = await channel.connect()
        return voice_clients[guild_id]
    
    print(f"ボイスチャンネル {channel_id} が見つかりません")
    return None

def load_auto_join_channels():
    """ JSON から自動入室チャンネル情報をロード（仮の関数）"""
    return {
        "123456789012345678": {  # ギルドIDの例
            "voice_channel_id": "987654321098765432",
            "text_channel_id": "876543210987654321"
        }
    }
    

async def handle_message(message: discord.Message):
    message_content = message.content
    # handle_message 内
    guild_id = str(message.guild.id)
    voice_client = voice_clients.get(guild_id)


    if voice_client is None:
        print("Error: Voice client is None, skipping message processing.")
        return

    print(f"Handling message: {message_content}")
    speaker_id = current_speaker.get(guild_id, 888753760)  # デフォルトの話者ID
    path = speak_voice(message_content, speaker_id, message.guild.id)

    while voice_client.is_playing():
        await asyncio.sleep(0.1)
    
    voice_client.play(create_ffmpeg_audio_source(path))
    print(f"Finished playing message: {message_content}")



# スピーカー情報を読み込む
speakers = []
speakers_file = "speakers.json"

try:
    if os.path.exists(speakers_file):
        with open(speakers_file, "r", encoding="utf-8") as f:
            speakers = json.load(f)
    else:
        print(f"⚠️ ファイル '{speakers_file}' が見つかりません。デフォルトの設定を使用します。")
except (json.JSONDecodeError, IOError) as e:
    print(f"⚠️ スピーカー情報の読み込み中にエラーが発生しました: {e}")
    speakers = []

# スピーカー名とスタイルのリストを作成（データがある場合のみ）
speaker_choices = []
if speakers:
    speaker_choices = [
        app_commands.Choice(
            name=f"{speaker.get('name', '不明')} - {style.get('name', '不明')}",
            value=str(style["id"]),
        )
        for speaker in speakers
        for style in speaker.get("styles", [])
        if isinstance(style.get("id"), int)  # IDが整数であることを確認
    ]

def get_speaker_info_by_id(speaker_id):
    for speaker in speakers:
        for style in speaker.get("styles", []):
            if style.get("id") == speaker_id:
                return speaker, style
    return None, None

class SpeakerSelect(Select):
    """ 話者を選択するためのプルダウンメニュー """

    def __init__(self, speakers, user_id, guild_id):
        options = [
            discord.SelectOption(
                label=f"{speaker.get('name', '不明')} - {style.get('name', '不明')}",
                value=str(style["id"])
            )
            for speaker in speakers
            for style in speaker.get("styles", [])
        ]

        # 選択メニューの初期化
        super().__init__(
            placeholder="話者を選択してください",
            min_values=1,
            max_values=1,
            options=options
        )
        self.user_id = user_id
        self.guild_id = guild_id

    async def callback(self, interaction: discord.Interaction):
        """ 話者を変更する処理 """
        speaker_id = int(self.values[0])
        speaker_info, style_info = get_speaker_info_by_id(speaker_id)

        if speaker_info and style_info:
            current_speaker[self.user_id] = speaker_id  # ユーザーごとに設定
            await interaction.response.send_message(
                f"✅ 話者を **{speaker_info['name']}**（スタイル: {style_info['name']}）に変更しました。",
                ephemeral=True
            )
        else:
            await interaction.response.send_message("⚠️ 無効な選択です。", ephemeral=True)


class SpeakerSelectView(View):
    """ 選択メニューのビュー """
    def __init__(self, speakers, user_id, guild_id):
        super().__init__()
        self.add_item(SpeakerSelect(speakers, user_id, guild_id))

@client.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    """ ユーザーのボイスチャンネルの入退出を処理 """
    if member.bot:
        return

    guild_id = str(member.guild.id)
    voice_client = voice_clients.get(guild_id)

    # 自動接続設定をロード
    auto_join_channels = load_auto_join_channels()
    voice_channel_id = auto_join_channels.get(guild_id, {}).get("voice_channel_id")

    # ユーザーがボイスチャンネルに参加
    if before.channel is None and after.channel is not None:
        if str(after.channel.id) == voice_channel_id:
            voice_client = await ensure_voice_connection(guild_id, after.channel)
            if voice_client:
                await play_notification(voice_client, f"{member.display_name} さんが入室しました。")

    # ユーザーがボイスチャンネルから退出
    elif before.channel is not None and after.channel is None:
        if voice_client and before.channel == voice_client.channel:
            await play_notification(voice_client, f"{member.display_name} さんが退室しました。")
            # 誰もいなくなったらBOTも退室
            if len(voice_client.channel.members) == 1:
                await voice_client.disconnect()
                del voice_clients[guild_id]

async def ensure_voice_connection(guild_id, channel):
    """ 指定のボイスチャンネルに接続を確保 """
    if guild_id in voice_clients and voice_clients[guild_id].is_connected():
        return voice_clients[guild_id]
    
    try:
        voice_clients[guild_id] = await channel.connect()
        return voice_clients[guild_id]
    except discord.errors.ClientException as e:
        print(f"Error: ボイスチャンネルへの接続失敗 - {e}")
        return None

async def play_notification(voice_client, text):
    """ 入退室時の通知を音声で再生（仮の関数） """
    path = speak_voice(text)  # 音声合成（実装を別途用意）
    if path:
        while voice_client.is_playing():
            await asyncio.sleep(1)
        voice_client.play(create_ffmpeg_audio_source(path))

def load_auto_join_channels():
    """ 自動入室チャンネル設定をJSONからロード """
    try:
        with open("auto_join_channels.json", "r", encoding="utf-8") as file:
            return json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        print("Error: auto_join_channels.json の読み込みに失敗しました")
        return {}

async def play_audio(vc, path):
    while vc.is_playing():
        await asyncio.sleep(1)
    vc.play(create_ffmpeg_audio_source(path))

@tree.command(
    name="set_speaker", description="話者を選択メニューから切り替えます。"
)
async def set_speaker_command(interaction: discord.Interaction):
    """ 話者の選択メニューを表示 """
    if not speakers:
        await interaction.response.send_message("⚠️ スピーカー情報が読み込まれていません。", ephemeral=True)
        return

    view = SpeakerSelectView(speakers, interaction.user.id, interaction.guild.id)
    await interaction.response.send_message("🎙️ **話者を選択してください:**", view=view, ephemeral=True)

@tree.command(
    name="set_volume", description="音量を設定します。"
)
@app_commands.describe(
    volume="設定する音量を入力してください (0.0 - 2.0)。"
)
async def set_volume_command(interaction: discord.Interaction, volume: float):
    if 0.0 <= volume <= 2.0:
        voice_settings["volume"][interaction.guild.id] = volume
        await interaction.response.send_message(f"音量を {volume} に設定しました。")
    else:
        await interaction.response.send_message("無効な音量値です。0.0から2.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_pitch", description="音高を設定します。"
)
@app_commands.describe(
    pitch="設定する音高を入力してください (-1.0 - 1.0)。"
)
async def set_pitch_command(interaction: discord.Interaction, pitch: float):
    if -1.0 <= pitch <= 1.0:
        voice_settings["pitch"][interaction.guild.id] = pitch
        await interaction.response.send_message(f"音高を {pitch} に設定しました。")
    else:
        await interaction.response.send_message("無効な音高値です。-1.0から1.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_speed", description="話速を設定します。"
)
@app_commands.describe(
    speed="設定する話速を入力してください (0.5 - 2.0)。"
)
async def set_speed_command(interaction: discord.Interaction, speed: float):
    if 0.5 <= speed <= 2.0:
        voice_settings["speed"][interaction.guild.id] = speed
        await interaction.response.send_message(f"話速を {speed} に設定しました。")
    else:
        await interaction.response.send_message("無効な話速値です。0.5から2.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_style_strength", description="スタイルの強さを設定します。"
)
@app_commands.describe(
    style_strength="設定するスタイルの強さを入力してください (0.0 - 2.0)。"
)
async def set_style_strength_command(interaction: discord.Interaction, style_strength: float):
    if 0.0 <= style_strength <= 2.0:
        voice_settings["style_strength"][interaction.guild.id] = style_strength
        await interaction.response.send_message(f"スタイルの強さを {style_strength} に設定しました。")
    else:
        await interaction.response.send_message("無効なスタイルの強さです。0.0から2.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_tempo", description="テンポの緩急を設定します。"
)
@app_commands.describe(
    tempo="設定するテンポの緩急を入力してください (0.5 - 2.0)。"
)
async def set_tempo_command(interaction: discord.Interaction, tempo: float):
    if 0.5 <= tempo <= 2.0:
        voice_settings["tempo"][interaction.guild.id] = tempo
        await interaction.response.send_message(f"テンポの緩急を {tempo} に設定しました。")
    else:
        await interaction.response.send_message("無効なテンポの緩急です。0.5から2.0の間で設定してください。", ephemeral=True)

word_type_choices = [
    app_commands.Choice(name="固有名詞", value="PROPER_NOUN"),
    app_commands.Choice(name="地名", value="LOCATION_NAME"),
    app_commands.Choice(name="組織・施設名", value="ORGANIZATION_NAME"),
    app_commands.Choice(name="人名", value="PERSON_NAME"),
    app_commands.Choice(name="性", value="PERSON_FAMILY_NAME"),
    app_commands.Choice(name="名", value="PERSON_GIVEN_NAME"),
    app_commands.Choice(name="一般名詞", value="COMMON_NOUN"),
    app_commands.Choice(name="動詞", value="VERB"),
    app_commands.Choice(name="形容詞", value="ADJECTIVE"),
    app_commands.Choice(name="語尾", value="SUFFIX"),
]

# JSONファイルの読み込み
try:
    with open(DICTIONARY_FILE, "r", encoding="utf-8") as file:
        parsed_data = json.load(file)
except (FileNotFoundError, json.JSONDecodeError):
    parsed_data = {}

# すべてのGuildの単語を取得
word_set = set()  # 重複を防ぐためにsetを使用
for guild_id, words in parsed_data.items():
    word_set.update(words.keys())  # 各Guildの単語をセットに追加

# リストに変換
all_words = list(word_set)

print(all_words)

def fetch_all_uuids():
    try:
        response = requests.get("http://localhost:10101/user_dict")
        response.raise_for_status()  # エラーがあれば例外を発生させる
        uuid_dict = response.json()
        return uuid_dict
    except requests.exceptions.RequestException as e:
        print(f"Error fetching user dictionary: {e}")
        return {}

# UUID一覧を取得
uuid_dict = fetch_all_uuids()

# UUID一覧をリストに変換
uuid_list = list(uuid_dict.keys())

if uuid_list:
    print("取得したUUID一覧:")
    for uuid in uuid_list:
        print(f"{uuid}: {uuid_dict[uuid]['surface']}") # 取得したUUIDを出力

    # UUID一覧をuuid.jsonに保存
    with open("uuid.json", "w", encoding="utf-8") as file:
        json.dump(uuid_dict, file, ensure_ascii=False, indent=4)
else:
    print("UUID一覧が空です。")

def save_to_dictionary_file():
    with open(DICTIONARY_FILE, "w", encoding="utf-8") as file:
        json.dump(guild_dictionary, file, ensure_ascii=False, indent=4)

def update_guild_dictionary(guild_id, word, details):
    guild_id_str = str(guild_id)  # guild_idを文字列に変換
    if guild_id_str not in guild_dictionary:
        guild_dictionary[guild_id_str] = {}
    guild_dictionary[guild_id_str][word] = details
    save_to_dictionary_file()

@tree.command(
    name="add_word", description="辞書に単語を登録します。"
)
@app_commands.describe(
    word="登録する単語を入力してください。",
    pronunciation="単語の発音をカタカナで入力してください。",
    accent_type="アクセントの種類を入力してください。",
    word_type="単語の品詞を選択してください。"
)
@app_commands.choices(word_type=word_type_choices)
async def add_word_command(interaction: discord.Interaction, word: str, pronunciation: str, accent_type: int, word_type: str):
    guild_id = interaction.guild.id
    add_url = f"http://localhost:10101/user_dict_word?surface={word}&pronunciation={pronunciation}&accent_type={accent_type}&word_type={word_type}"

    response = requests.post(add_url)
    print("API response status:", response.status_code)

    if response.status_code == 200:
        details = {
            "pronunciation": pronunciation,
            "accent_type": accent_type,
            "word_type": word_type,
        }
        update_guild_dictionary(guild_id, word, details)
        await interaction.response.send_message(f"単語 '{word}' の発音を '{pronunciation}', アクセント '{accent_type}', 品詞 '{word_type}' に登録しました。")
    else:
        await interaction.response.send_message(f"単語 '{word}' の登録に失敗しました。", ephemeral=True)

@tree.command(
    name="edit_word", description="辞書の単語を編集します。"
)
@app_commands.describe(
    word="登録する単語を入力してください。",
    new_pronunciation="単語の発音をカタカナで入力してください。",
    accent_type="アクセントの種類を入力してください。",
    word_type="単語の品詞を選択してください。"
)
@app_commands.choices(word_type=word_type_choices)
async def edit_word_command(interaction: discord.Interaction, word: str, new_pronunciation: str, accent_type: int, word_type: str):
    if re.search(r'[a-zA-Z0-9!-/:-@[-`{-~]', word):
        await interaction.response.send_message("単語に半角英数字や半角記号を含めることはできません。", ephemeral=True)
        return

    guild_id = interaction.guild.id
    uuid_dict = fetch_all_uuids()  # UUID一覧を取得
    uuid = next((key for key, value in uuid_dict.items() if value["surface"] == word), None)
    edit_url = f"http://localhost:10101/user_dict_word/{uuid}?surface={word}&pronunciation={new_pronunciation}&accent_type={accent_type}&word_type={word_type}"
    if word in all_words:
        print(f"Word UUID: {uuid}")
        if uuid:
            response = requests.put(edit_url)
            print(response.status_code)
            if response.status_code == 204:
                details = {
                    "pronunciation": new_pronunciation,
                    "accent_type": accent_type,
                    "word_type": word_type,
                    "uuid": uuid
                }
                update_guild_dictionary(guild_id, word, details)
                await interaction.response.send_message(f"単語 '{word}' の発音を '{new_pronunciation}', アクセント '{accent_type}', 品詞 '{word_type}' に編集しました。")
            else:
                await interaction.response.send_message(f"単語 '{word}' の編集に失敗しました。", ephemeral=True)
        else:
            await interaction.response.send_message(f"単語 '{word}' のUUIDが見つかりませんでした。", ephemeral=True)

@tree.command(
    name="remove_word", description="辞書から単語を削除します。"
)
@app_commands.describe(
    word="削除する単語を入力してください。"
)
async def remove_word_command(interaction: discord.Interaction, word: str):
    if re.search(r'[a-zA-Z0-9!-/:-@[-`{-~]', word):
        await interaction.response.send_message("単語に半角英数字や半角記号を含めることはできません。", ephemeral=True)
        return

    guild_id = interaction.guild.id
    uuid_dict = fetch_all_uuids()  # UUID一覧を取得
    uuid = next((key for key, value in uuid_dict.items() if value["surface"] == word), None)
    remove_url = f"http://localhost:10101/user_dict_word/{uuid}"
    if word in all_words:
        print(f"Word UUID: {uuid}")
        if uuid:
            response = requests.delete(remove_url)
            print(response.status_code)
            if response.status_code == 204:
                guild_id_str = str(guild_id)  # guild_idを文字列に変換
                if guild_id_str in guild_dictionary and word in guild_dictionary[guild_id_str]:
                    del guild_dictionary[guild_id_str][word]
                    save_to_dictionary_file()
                await interaction.response.send_message(f"単語 '{word}' を辞書から削除しました。")
            else:
                await interaction.response.send_message(f"単語 '{word}' の削除に失敗しました。", ephemeral=True)
        else:
            await interaction.response.send_message(f"単語 '{word}' のUUIDが見つかりませんでした。", ephemeral=True)

class DictionaryView(View):
    def __init__(self, words, page=0, per_page=10):
        super().__init__(timeout=None)
        self.words = words
        self.page = page
        self.per_page = per_page
        self.update_button_state()  # ボタンの状態を更新

    def update_button_state(self):
        # すでにデコレーターで定義されたボタンに対して disabled を設定する
        for item in self.children:
            if item.custom_id == "previous":
                item.disabled = self.page <= 0
            elif item.custom_id == "next":
                item.disabled = (self.page + 1) * self.per_page >= len(self.words)
    
    @discord.ui.button(label="Previous", style=discord.ButtonStyle.primary, custom_id="previous")
    async def previous_page(self, interaction: discord.Interaction, button: Button):
        if self.page > 0:
            self.page -= 1
            self.update_button_state()
            await interaction.response.edit_message(embed=self.create_embed(), view=self)
    
    @discord.ui.button(label="Next", style=discord.ButtonStyle.primary, custom_id="next")
    async def next_page(self, interaction: discord.Interaction, button: Button):
        if (self.page + 1) * self.per_page < len(self.words):
            self.page += 1
            self.update_button_state()
            await interaction.response.edit_message(embed=self.create_embed(), view=self)

    def create_embed(self):
        start = self.page * self.per_page
        end = start + self.per_page
        embed = discord.Embed(title="辞書の単語一覧")
        for word, details in self.words[start:end]:
            embed.add_field(name=word, value=f"発音: {details['pronunciation']}, アクセント: {details['accent_type']}, 品詞: {details['word_type']}", inline=False)
        embed.set_footer(text=f"Page {self.page + 1}/{(len(self.words) - 1) // self.per_page + 1}")
        return embed

@tree.command(
    name="list_words", description="辞書の単語一覧を表示します。"
)
async def list_words_command(interaction: discord.Interaction):
    if interaction.guild is None:
        await interaction.response.send_message("このコマンドはサーバー内でのみ使用できます。", ephemeral=True)
        return
    guild_id = str(interaction.guild.id)

    # 都度 dictionary.json を取得
    try:
        with open(DICTIONARY_FILE, "r", encoding="utf-8") as file:
            guild_dictionary = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        guild_dictionary = {}

    words = guild_dictionary.get(guild_id, {})
    print(f"Guild ID: {guild_id}")  # デバッグ用にギルドIDを出力
    print(f"Words: {words}")  # デバッグ用に単語一覧を出力
    if not words:
        await interaction.response.send_message("辞書に単語が登録されていません。", ephemeral=True)
        return

    view = DictionaryView(list(words.items()))  # 辞書のアイテムをリストに変換
    await interaction.response.send_message(embed=view.create_embed(), view=view)

client.run(TOKEN)