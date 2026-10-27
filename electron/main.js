// Desktop shell for Steam: serves web/ over a private app:// scheme, bridges Steamworks.
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const WEB = path.join(__dirname, '..', 'web');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let steam = null;
function initSteam() {
  try {
    const steamworks = require('steamworks.js');
    // steam_appid.txt is only needed when the game is started outside the Steam client (development).
    const base = app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
    const idFile = path.join(base, 'steam_appid.txt');
    const appId = fs.existsSync(idFile) ? Number(fs.readFileSync(idFile, 'utf8').trim()) : undefined;
    steam = steamworks.init(appId);
    steamworks.electronEnableSteamOverlay();
    console.log('Steam initialised for', steam.localplayer.getName());
  } catch (e) {
    console.log('Steam unavailable, running standalone:', e.message);
    steam = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', show: false, autoHideMenuBar: true, title: 'MIO - Hymn of the Blue',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'Enter' && input.alt) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL('app://game/index.html');
  return win;
}

// A fixed save folder (documented in STEAM.md for Steam Cloud).
app.setPath('userData', path.join(app.getPath('appData'), 'mio-hymn-of-the-blue'));
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
    if (!file.startsWith(WEB)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  initSteam();
  const win = createWindow();
  ipcMain.handle('achieve', (_e, id) => {
    try { if (steam && !steam.achievement.isActivated(id)) steam.achievement.activate(id); } catch (err) { console.log('achievement', id, err.message); }
  });
  ipcMain.on('fullscreen', (_e, on) => win.setFullScreen(!!on));
  ipcMain.on('quit', () => app.quit());
  // Automated check: MIO_SMOKE=<file.png> boots, waits, saves a screenshot and exits.
  if (process.env.MIO_SMOKE) {
    win.webContents.on('console-message', (e) => console.log('[page]', e.message));
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.MIO_SMOKE, img.toPNG());
      app.quit();
    }, Number(process.env.MIO_SMOKE_WAIT || 15000));
  }
});

app.on('window-all-closed', () => app.quit());
