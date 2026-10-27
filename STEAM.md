# Steam で販売するまでの手順

このゲームは Electron で包んだデスクトップアプリとして Steam に出す前提で作っています。
Steamworks（実績・オーバーレイ）は `steamworks.js` で組み込み済みで、Steam が起動していない環境では自動で無効になります。

## 1. Steamworks に登録する

1. [Steamworks パートナープログラム](https://partner.steamgames.com/) に登録（法人・個人どちらでも可）。
2. 本人確認・銀行口座・税務情報（日本在住なら W-8BEN の入力）を済ませる。
3. 「Steam Direct」の登録料（1タイトルあたり 100 米ドル）を支払うと App ID が発行される。
   登録料は、そのタイトルの売上が 1,000 米ドルに達すると返ってきます。
4. App ID 発行後、最低 30 日経たないと発売できず、ストアページは「近日公開」として 2 週間以上公開しておく必要があります。

## 2. このリポジトリ側で差し替える場所

| 場所 | 内容 |
|---|---|
| `steam/app_build.vdf` | `AppID` を発行された App ID に |
| `steam/depot_windows.vdf` / `depot_linux.vdf` / `depot_mac.vdf` | `DepotID` を Steamworks で作成した Depot ID に（app_build.vdf の Depots も同じ値に） |
| `steam_appid.txt` | 開発中の動作確認用。いまは Steam のテスト用 App（480 = Spacewar）。自分の App ID に変えると、Steam クライアントを起動した状態で `npm start` したときに自分のゲームとして認識されます。**製品ビルドには含めません**（package.json の build.files で除外済み） |
| `package.json` の `build.appId` | `com.example.mio` を自分のドメインに |
| `web/src/i18n.js` の `credits` | クレジット表記（制作者名・スタジオ名） |

## 3. 実績を登録する

Steamworks の「実績」画面で、次の API 名で登録してください（名前・説明・アイコンは自由）。
ゲームはこの名前で解除を送ります。

| API 名 | 解除条件 |
|---|---|
| `ACH_FIRST_LEAP` | 初めて水面から跳ぶ |
| `ACH_FIRST_SONG` | 初めて〈歌〉を響かせる |
| `ACH_FIRST_POD` | 初めて仲間を目覚めさせる |
| `ACH_CHAPTER_1` 〜 `ACH_CHAPTER_3` | 各章をクリア |
| `ACH_SILENCE` | 〈静寂〉を倒す（ゲームクリア） |
| `ACH_UNTOUCHED` | 終章を一度も傷つかずにクリア |
| `ACH_ALL_PEARLS` | 全章の真珠をすべて集める |

## 4. ストアページ

`store/` に必要な画像をすべて用意しています（`python3 tools/make_store_assets.py` で作り直せます）。

| ファイル | Steam での名前 | サイズ |
|---|---|---|
| `header_capsule.png` | ヘッダーカプセル | 920×430 |
| `small_capsule.png` | 小カプセル | 462×174 |
| `main_capsule.png` | メインカプセル | 1232×706 |
| `vertical_capsule.png` | 縦長カプセル | 748×896 |
| `library_capsule.png` | ライブラリカプセル | 600×900 |
| `library_hero.jpg` | ライブラリヒーロー（文字なし） | 3840×1240 |
| `library_logo.png` | ライブラリロゴ（透過） | 1280×720 |
| `page_background.png` | ページ背景 | 1438×810 |
| `client_icon_256.png` / `community_icon.png` | クライアント／コミュニティアイコン | 256 / 184 |
| `screenshots/*.jpg` | スクリーンショット（5枚以上必要） | 1920×1080 |

ストア説明文の下書き：

> 銀の潮の夜、海から歌が消えた。
> 若いイルカ・澪は、深い〈静寂〉に連れ去られた群れの仲間を追い、珊瑚の浅瀬から昆布の大聖堂、
> 沈んだ神殿、そして光の届かない深淵へと泳いでいく。
>
> - 何層にも重なる多重スクロールと、光が揺れる半透明の海
> - 声で闇を照らし、歌で門を開き、仲間を目覚めさせる
> - 水面を抜けて空へ跳ぶ爽快な泳ぎ
> - 深淵に潜む巨大な影〈静寂〉との対決
> - 日本語・英語対応／ゲームパッド対応

## 5. AI 生成コンテンツの申告（必須）

Steam はストア申請時の「コンテンツ調査」で、AI で生成したコンテンツの申告を求めています。
このゲームの画像（キャラクター・背景・ストア画像）は **GPT Image 2.5 で事前生成**したものなので、
「事前に生成されたコンテンツ」として申告し、どの素材が AI 生成かを記載してください。
ゲーム実行中に AI がコンテンツを生成することはありません。
あわせて、利用した画像生成サービスの利用規約で商用利用が認められていることを、発売前にご自身でも確認してください。

## 6. ビルドしてアップロードする

```bash
npm install
npm run dist:win      # → dist/win-unpacked/
npm run dist:linux    # → dist/linux-unpacked/
```

Mac 版（`dist/mac-universal/`）は下の「Mac 版」の手順で作ります。

1. Steamworks SDK をダウンロードし、`tools/ContentBuilder/` の SteamCMD を使います。
2. `steam/*.vdf` の ID を差し替え、ContentBuilder から
   `steamcmd +login <ビルド用アカウント> +run_app_build <このリポジトリ>/steam/app_build.vdf +quit`
3. Steamworks の「ビルド」画面で、アップロードしたビルドを `default` ブランチに設定。
4. 「インストール」→「一般」で起動オプションを設定:
   - Windows: 実行ファイル `MIO - Hymn of the Blue.exe`
   - Linux（Steam Deck）: 実行ファイル `mio`
   - macOS: 実行ファイル `MIO - Hymn of the Blue.app`
5. ストアページとビルドの審査を申請（それぞれ数営業日かかります）。

### Steam クラウド（任意）

セーブは Electron の userData 内の localStorage に保存されます。Steam の「Auto-Cloud」で次のパスを登録すると端末間で同期できます。

- Windows: `%APPDATA%/mio-hymn-of-the-blue/Local Storage/`
- Linux: `~/.config/mio-hymn-of-the-blue/Local Storage/`
- macOS: `~/Library/Application Support/mio-hymn-of-the-blue/Local Storage/`

### Steam Deck

ゲームパッド操作・1280×800 表示に対応しています。Deck 互換性の審査に出す前に、実機で
文字の読みやすさ（ダイアログは画面高さ基準で拡大縮小）とフレームレート（画質「中」推奨）を確認してください。

## 7. Mac 版

Intel と Apple Silicon の両方で動く「ユニバーサル版」を作ります。Mac 版は Apple の**署名と公証**がないと
利用者の Mac で開けないため、次の準備が必要です。

### 準備するもの

1. [Apple Developer Program](https://developer.apple.com/programs/) に登録（年 99 米ドル）。
2. 「Developer ID Application」証明書を作成し、Mac のキーチェーンから `.p12` 形式で書き出す（パスワードを付ける）。
   Mac が手元にない場合は、Apple Developer サイトで証明書署名要求（CSR）を作る手順が必要になるので、そのときは相談してください。
3. 公証用に、Apple ID の「App 用パスワード」を [appleid.apple.com](https://appleid.apple.com/) で発行。
4. Team ID（10桁）を Apple Developer の「メンバーシップ」画面で確認。

### GitHub Actions でビルドする（Mac がなくてもよい）

`.github/workflows/build-mac.yml` が GitHub の Mac 環境でビルド・署名・公証まで行います。
リポジトリの Settings → Secrets and variables → Actions に次を登録してください。

| Secret 名 | 内容 |
|---|---|
| `MAC_CERT_P12_BASE64` | `.p12` を base64 にしたもの（Mac なら `base64 -i cert.p12 \| pbcopy`） |
| `MAC_CERT_PASSWORD` | `.p12` のパスワード |
| `APPLE_ID` | 公証に使う Apple ID のメールアドレス |
| `APPLE_APP_SPECIFIC_PASSWORD` | 上で発行した App 用パスワード |
| `APPLE_TEAM_ID` | Team ID |

Actions タブの「Build macOS」→「Run workflow」で実行するか、`v1.0.0` のようなタグを push すると動きます。
完成品は実行結果ページの Artifacts（`mio-mac-universal.zip`）からダウンロードできます。
これを展開した `MIO - Hymn of the Blue.app` を `dist/mac-universal/` に置いて SteamPipe でアップロードします。

- Secrets を登録する前でも実行でき、その場合は**署名なしのテスト版**ができます。
  自分の Mac で試すときは、展開後にターミナルで次を実行すると開けます（販売用には使えません）:
  `xattr -cr "MIO - Hymn of the Blue.app" && codesign --force --deep -s - "MIO - Hymn of the Blue.app"`
- 非公開リポジトリでは、GitHub Actions の Mac 環境は Linux より多くの無料枠を消費します（1分あたり10倍換算）。

### 手元の Mac でビルドする

証明書をキーチェーンに入れた状態で、次を実行します。公証用の環境変数があれば公証まで行います。

```bash
export APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=...
npm run dist:mac      # → dist/mac-universal/MIO - Hymn of the Blue.app
```

### 設定の中身

- `package.json` の `build.mac`: ユニバーサル版、Hardened Runtime、公証、macOS 12 以上。
- `build/entitlements.mac.plist`: Electron の JavaScript 実行（JIT）と、Steam オーバーレイの読み込みに必要な例外。
- `x64ArchFiles`: Steam 連携の部品（steamworks.js）は Intel 用・Apple Silicon 用の両方を同梱しているため、統合時にそのまま残す指定。
