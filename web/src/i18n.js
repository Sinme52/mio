// All player-facing text, Japanese and English.

const ja = {
  title_sub: '― 蒼の讃歌 ―',
  m_start: 'はじめから', m_continue: 'つづきから', m_select: 'ステージ選択', m_options: '設定', m_credits: 'クレジット', m_quit: '終了',
  paused: 'ポーズ', m_resume: '再開', m_restart: 'ステージをやり直す', m_title: 'タイトルへ', m_back: '戻る',
  o_lang: '言語 / Language', o_master: '全体音量', o_music: '音楽', o_sfx: '効果音', o_quality: '画質',
  o_full: 'フルスクリーン', o_shake: '画面の揺れ', o_on: 'オン', o_off: 'オフ',
  q_high: '高', q_medium: '中', q_low: '低',
  st_1: '第一章　珊瑚の浅瀬', st_2: '第二章　昆布の大聖堂', st_3: '第三章　沈んだ神殿', st_4: '終章　深淵',
  locked: '未開放',
  prologue: '銀の潮の夜、海から歌が消えた。\n群れの仲間たちは深い〈静寂〉にのまれ、どこかへ連れ去られた。\nひとり残された若いイルカ、澪（ミオ）は、かすかに残る仲間の歌を追って泳ぎ出す。',
  s1_move: '古い歌石が、やさしく語りかけてくる。\n「若き者よ。{move}で泳ぎ、{dash}で強く水を蹴りなさい。」',
  s1_breath: '「おまえは海の子だが、空の息がなければ生きられない。左上の泡が減ったら水面へ。\n勢いよく水面を抜ければ、空へ跳ぶこともできる。」',
  s1_sonar: '「{sonar}で声を放て。声は闇を照らし、石と語らう。\n長く押して溜めれば〈歌〉となり、水晶の門をも開く。」',
  s1_cave: '「…聞こえるか。下の洞窟から、かすかな仲間の歌が。\n黒い静寂の泡に囚われた者は、おまえの〈歌〉でしか目覚めない。」',
  s2_kelp: '「ここは昆布の大聖堂。鮫が獲物を探して巡っている。\n{dash}の体当たりで追い払えるが、無理はするな。小魚を食べれば傷は癒える。」',
  s2_tunnel: '「この先は岩の天井が空を覆う。息が続かなくなったら、海底から湧く泡の柱を探せ。\n泡の中で息を整えられる。」',
  s2_gate: '「仲間の歌が、この先でもう一度響いた。\n静寂は深いほうへ、深いほうへと逃げていく。」',
  s3_temple: '「かつてこの神殿では、鯨とイルカがともに歌った。\nだが歌を恐れた〈静寂〉が、ここを海の底へ沈めた。」',
  s3_dark: '「光の届かぬ場所では、声を放て。おまえの声が、闇の形を教えてくれる。」',
  s3_gate: '「門の水晶は、ひとつの声では揺るがぬ。〈歌〉を溜めよ。」',
  s3_shaft: '「上を見よ。崩れた天井から、空の光が落ちている。」',
  s4_abyss: '「この裂け目の底に、〈静寂〉が眠っている。\n海の歌をすべて呑み込み、なお飢えている影だ。」',
  s4_vents: '「熱い泉の泡は、深みに残された最後の息。忘れるな。」',
  s4_hush: '「〈静寂〉の背には、奪った歌が光の核となって囚われている。\n〈歌〉で核を目覚めさせ、輝くうちに{dash}の体当たりで解き放て。」',
  pod_freed: '仲間が目を覚ました！',
  exit_locked: '潮の道はまだ閉ざされている。仲間を探そう（{n} / {m}）',
  gate_hint: '水晶の門だ。{sonar}を長押しして〈歌〉を響かせよう。',
  checkpoint: '歌石に記憶された',
  clear: '潮の道がひらいた',
  gameover: '意識が遠のいていく…',
  retry: '最後の歌石から',
  boss_name: '〈静寂〉',
  boss_intro: '深い闇が、動いた。',
  ending: '静寂がほどけ、囚われていた歌が海へ還っていく。\n群れの声が、ひとつ、またひとつと重なる。\n\n澪はもうひとりではない。\n海はふたたび、歌っている。',
  thanks: 'Thank you for playing',
  results: '真珠 {p} / {pm}　　仲間 {f} / {fm}',
  continue_hint: '{confirm}で進む',
  credits: 'MIO ― 蒼の讃歌 ―\n\nゲームデザイン・プログラム・音楽\nClaude（Anthropic）と制作者\n\nアート\nGPT Image 2.5 による生成をもとに制作\n\nフォント\nZen Maru Gothic / Cormorant Garamond（SIL Open Font License）',
  k_move: '方向キー', k_sonar: 'Zキー', k_dash: 'Xキー', k_confirm: 'Enter',
  p_move: '左スティック', p_sonar: 'Ⓐボタン', p_dash: 'Ⓑボタン', p_confirm: 'Ⓐボタン',
  loading: '読み込み中',
  press: 'PRESS ANY KEY',
};

const en = {
  title_sub: '— Hymn of the Blue —',
  m_start: 'New Game', m_continue: 'Continue', m_select: 'Chapter Select', m_options: 'Options', m_credits: 'Credits', m_quit: 'Quit',
  paused: 'Paused', m_resume: 'Resume', m_restart: 'Restart Chapter', m_title: 'Return to Title', m_back: 'Back',
  o_lang: 'Language / 言語', o_master: 'Master Volume', o_music: 'Music', o_sfx: 'Sound Effects', o_quality: 'Graphics',
  o_full: 'Fullscreen', o_shake: 'Screen Shake', o_on: 'On', o_off: 'Off',
  q_high: 'High', q_medium: 'Medium', q_low: 'Low',
  st_1: 'Chapter I — The Coral Shallows', st_2: 'Chapter II — The Kelp Cathedral', st_3: 'Chapter III — The Drowned Temple', st_4: 'Finale — The Abyss',
  locked: 'Locked',
  prologue: 'On the night of the silver tide, the songs vanished from the sea.\nMio\'s pod was swallowed by a deep Silence and carried away.\nAlone, the young dolphin sets out to follow the faint echo of their song.',
  s1_move: 'An old song-stone speaks softly.\n"Young one. Use {move} to swim, and {dash} to kick hard through the water."',
  s1_breath: '"You are a child of the sea, yet you cannot live without the breath of the sky. When the bubbles at the top left run low, rise to the surface.\nBreak the surface with speed and you will leap into the air."',
  s1_sonar: '"Press {sonar} to call out. Your voice lights the dark and speaks with stones.\nHold it to gather a Song — a Song can open the crystal gates."',
  s1_cave: '"...Do you hear it? A faint song of your kin from the cave below.\nThose trapped in a bubble of black silence wake only to your Song."',
  s2_kelp: '"This is the Kelp Cathedral. Sharks circle here in search of prey.\nA {dash} charge will drive them off, but do not be reckless. Eating small fish heals your wounds."',
  s2_tunnel: '"Ahead, a ceiling of rock hides the sky. When your breath runs short, seek the columns of bubbles rising from the seabed.\nInside them you can breathe again."',
  s2_gate: '"Your kin\'s song echoed once more beyond here.\nThe Silence flees deeper, ever deeper."',
  s3_temple: '"Long ago, whales and dolphins sang together in this temple.\nBut the Silence, which fears song, dragged it to the bottom of the sea."',
  s3_dark: '"Where no light reaches, call out. Your voice will show you the shape of the dark."',
  s3_gate: '"A single call will not stir the crystal of this gate. Gather a Song."',
  s3_shaft: '"Look up. Through the broken ceiling, the light of the sky is falling."',
  s4_abyss: '"At the bottom of this rift sleeps the Silence:\na shadow that swallowed every song of the sea and hungers still."',
  s4_vents: '"The bubbles of the hot springs are the last breath left in the deep. Remember them."',
  s4_hush: '"On the Silence\'s back, the songs it stole are imprisoned as cores of light.\nWake the cores with your Song, and while they shine, set them free with a {dash} charge."',
  pod_freed: 'A member of your pod awakens!',
  exit_locked: 'The tide-road is still closed. Find your pod ({n} / {m})',
  gate_hint: 'A crystal gate. Hold {sonar} to let your Song ring out.',
  checkpoint: 'Remembered by the song-stone',
  clear: 'The tide-road opens',
  gameover: 'Your senses fade...',
  retry: 'From the last song-stone',
  boss_name: 'The Silence',
  boss_intro: 'The deep darkness stirs.',
  ending: 'The Silence unravels, and the stolen songs return to the sea.\nOne by one, the voices of the pod rise together.\n\nMio is no longer alone.\nThe sea is singing once more.',
  thanks: 'Thank you for playing',
  results: 'Pearls {p} / {pm}    Pod {f} / {fm}',
  continue_hint: '{confirm} to continue',
  credits: 'MIO — Hymn of the Blue\n\nGame design, programming, music\nClaude (Anthropic) and the creator\n\nArt\nBased on images generated with GPT Image 2.5\n\nFonts\nZen Maru Gothic / Cormorant Garamond (SIL Open Font License)',
  k_move: 'the arrow keys', k_sonar: 'Z', k_dash: 'X', k_confirm: 'Enter',
  p_move: 'the left stick', p_sonar: 'Ⓐ', p_dash: 'Ⓑ', p_confirm: 'Ⓐ',
  loading: 'Loading',
  press: 'PRESS ANY KEY',
};

const TABLE = { ja, en };
let lang = 'ja';
let pad = false;

export function setLang(l) { lang = TABLE[l] ? l : 'ja'; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function setPadPrompts(p) { pad = p; }

export function t(key, vars = {}) {
  const tbl = TABLE[lang];
  let s = tbl[key] ?? TABLE.en[key] ?? key;
  const ctrl = (k) => tbl[(pad ? 'p_' : 'k_') + k];
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ctrl(k) ?? `{${k}}`));
}
