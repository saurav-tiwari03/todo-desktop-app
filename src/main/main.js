'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell, nativeTheme, Notification,
  Tray, globalShortcut, nativeImage, screen, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');

// Set before anything asks for a path: userData is derived from the app name,
// so this keeps dev runs and the packaged app on the same data file.
app.setName('Kodeit Todo');

// Image previews need a source the page's strict CSP can name. Serving them
// through our own scheme, resolved only inside the attachments folder, beats
// opening img-src up to file: — the page can then never reach anything else.
protocol.registerSchemesAsPrivileged([
  { scheme: 'attachment', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const isDev = process.argv.includes('--dev');
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');
const TRAY_ICON = path.join(__dirname, '..', 'renderer', 'assets', 'trayTemplate.png');
const QUICK_SHORTCUT = 'Alt+Space';
let store = null;
let mainWindow = null;
let quickWindow = null;
let tray = null;
let mainWasVisible = false;
let quickShownAt = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1d' : '#faf9f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Links to the web open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Local 'YYYY-MM-DDTHH:MM', which sorts and compares as a plain string. */
function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todayISO() {
  return stamp().slice(0, 10);
}

/**
 * Fires any reminder whose moment has arrived. Runs on a modest interval
 * rather than one timer per reminder, so reminders survive the app being
 * closed over their due moment (they fire at the next check instead).
 */
function checkReminders() {
  if (!store) return;
  const now = stamp();
  const fired = [];

  for (const task of store.snapshot().tasks) {
    if (task.completed) continue;
    for (const reminder of task.reminders || []) {
      if (reminder.fired || !reminder.at || reminder.at > now) continue;
      fired.push({ taskId: task.id, reminderId: reminder.id });
      if (Notification.isSupported()) {
        const note = new Notification({
          title: task.title,
          body: reminder.at.replace('T', ' at '),
          silent: false
        });
        note.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            send('menu:focus-task', task.id);
          }
        });
        note.show();
      }
    }
  }

  if (fired.length) {
    store.markRemindersFired(fired);
    send('state:changed', store.snapshot());
  }
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/* ========================================================================= */
/* Quick-add window                                                          */
/* ========================================================================= */

function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: 660,
    height: 108,
    show: false,
    frame: false,
    transparent: true,
    // macOS draws its own shadow and rounded-corner mask at the window bounds.
    // On a transparent overlay that reads as a stray rectangle floating around
    // the card, so turn both off — the card's own CSS shadow is the only one
    // that should be visible.
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-quick.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  quickWindow.loadFile(path.join(__dirname, '..', 'renderer', 'quickadd.html'));
  quickWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Clicking away dismisses it, the way a capture window should behave — but
  // not in the moment right after showing, when the window may not have been
  // given focus yet and a stray blur would close it immediately.
  quickWindow.on('blur', () => {
    if (Date.now() - quickShownAt < 500) return;
    hideQuickWindow();
  });
}

function showQuickWindow() {
  if (!quickWindow || quickWindow.isDestroyed()) createQuickWindow();

  // Remembered so dismissing can hand focus back to whatever app was in front.
  mainWasVisible = Boolean(mainWindow && !mainWindow.isDestroyed()
    && mainWindow.isVisible() && !mainWindow.isMinimized());

  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const [width] = quickWindow.getSize();
  quickWindow.setPosition(
    Math.round(area.x + (area.width - width) / 2),
    Math.round(area.y + area.height * 0.2)
  );

  const settings = store ? store.snapshot().settings : {};
  const theme = settings.theme || 'system';
  quickWindow.webContents.send('quick:open', {
    dark: theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors),
    voice: Boolean(settings.voiceInput),
    projects: store ? store.snapshot().projects.map((p) => ({ id: p.id, name: p.name })) : []
  });

  quickShownAt = Date.now();
  // Become the active app first, or the window can open without focus and the
  // typing goes to whatever was in front.
  if (process.platform === 'darwin') app.focus({ steal: true });
  quickWindow.show();
  quickWindow.focus();
}

function hideQuickWindow() {
  if (!quickWindow || quickWindow.isDestroyed() || !quickWindow.isVisible()) return;
  quickWindow.hide();
  // Nothing else of ours is on screen, so give the previous app the focus back.
  if (process.platform === 'darwin' && !mainWasVisible) app.hide();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  app.show();
  mainWindow.show();
  mainWindow.focus();
}

/* ========================================================================= */
/* Tray                                                                      */
/* ========================================================================= */

function todayCount() {
  if (!store) return 0;
  const today = todayISO();
  return store.snapshot().tasks
    .filter((t) => !t.completed && t.due && t.due <= today).length;
}

function updateTray() {
  if (!tray) return;
  const count = todayCount();
  tray.setToolTip(count ? `Kodeit Todo — ${count} due today` : 'Kodeit Todo');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: count ? `${count} due today` : 'Nothing due today', enabled: false },
    { type: 'separator' },
    { label: 'Open Kodeit Todo', click: showMainWindow },
    { label: 'Quick Add', accelerator: QUICK_SHORTCUT, click: showQuickWindow },
    { type: 'separator' },
    { label: 'Quit Kodeit Todo', role: 'quit' }
  ]));
}

function createTray() {
  const image = nativeImage.createFromPath(TRAY_ICON);
  if (image.isEmpty()) {
    console.error('Tray icon missing:', TRAY_ICON);
    return;
  }
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.on('double-click', showMainWindow);
  updateTray();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Task',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('menu:new-task')
        },
        {
          label: 'Quick Add (anywhere)',
          accelerator: QUICK_SHORTCUT,
          click: showQuickWindow
        },
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('menu:new-project')
        },
        { type: 'separator' },
        {
          label: 'Search',
          accelerator: 'CmdOrCtrl+F',
          click: () => send('menu:search')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Today', accelerator: 'CmdOrCtrl+1', click: () => send('menu:view', 'today') },
        { label: 'Upcoming', accelerator: 'CmdOrCtrl+2', click: () => send('menu:view', 'upcoming') },
        { label: 'Inbox', accelerator: 'CmdOrCtrl+3', click: () => send('menu:view', 'inbox') },
        { label: 'All Tasks', accelerator: 'CmdOrCtrl+4', click: () => send('menu:view', 'all') },
        { label: 'Completed', accelerator: 'CmdOrCtrl+5', click: () => send('menu:view', 'completed') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Each handler returns the full state so the renderer re-renders from truth. */
function handle(channel, fn) {
  ipcMain.handle(channel, (_event, ...args) => {
    const result = fn(...args);
    updateTray();
    return { result, state: store.snapshot() };
  });
}

// Only one copy may run: both would own the same tasks.json and the last save
// would silently clobber the other's. A second launch focuses the first instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));

  // attachment://file/<stored-name>. basename() in attachmentPath() keeps a
  // crafted host or path from walking out of the attachments folder.
  protocol.handle('attachment', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    if (!name) return new Response('Not found', { status: 404 });
    return net.fetch(`file://${store.attachmentPath(name)}`);
  });

  // Packaged builds take the icon from the bundle; an unpackaged run has to
  // set the dock icon itself or it shows up as generic Electron.
  if (process.platform === 'darwin' && !app.isPackaged && fs.existsSync(ICON)) {
    app.dock.setIcon(ICON);
  }

  ipcMain.handle('state:get', () => store.snapshot());

  handle('task:add', (input) => store.addTask(input || {}));
  handle('task:update', (id, patch) => store.updateTask(id, patch || {}));
  handle('task:delete', (id) => store.deleteTask(id));
  handle('task:clear-completed', () => store.clearCompleted());

  handle('project:add', (input) => store.addProject(input || {}));
  handle('project:update', (id, patch) => store.updateProject(id, patch || {}));
  handle('project:delete', (id) => store.deleteProject(id));

  handle('comment:add', (taskId, input) => store.addComment(taskId, input || {}));
  handle('comment:update', (taskId, commentId, text) => store.updateComment(taskId, commentId, text));
  handle('comment:delete', (taskId, commentId) => store.deleteComment(taskId, commentId));
  handle('attachment:delete', (taskId, commentId, attachmentId) =>
    store.deleteAttachment(taskId, commentId, attachmentId));

  // Not a `handle()`: it opens a modal and changes no state.
  ipcMain.handle('attachment:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Attach files',
      buttonLabel: 'Attach',
      properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('attachment:open', async (_event, file) => {
    const error = await shell.openPath(store.attachmentPath(file));
    return error || null;
  });

  ipcMain.handle('attachment:reveal', (_event, file) => {
    shell.showItemInFolder(store.attachmentPath(file));
  });

  handle('task:complete', (id) => store.completeTask(id, todayISO()));

  handle('settings:update', (patch) => store.updateSettings(patch || {}));

  ipcMain.on('quick:voice', (_event, on) => {
    store.updateSettings({ voiceInput: Boolean(on) });
    send('state:changed', store.snapshot());
  });

  ipcMain.on('quick:close', () => hideQuickWindow());

  ipcMain.on('quick:resize', (_event, height) => {
    if (!quickWindow || quickWindow.isDestroyed()) return;
    const [width] = quickWindow.getSize();
    const next = Math.max(96, Math.min(360, Math.round(height)));
    if (quickWindow.getSize()[1] !== next) quickWindow.setSize(width, next);
  });

  ipcMain.on('quick:add', (_event, input) => {
    if (!store || !input || !input.title) return;

    // A #name that matched nothing becomes a new project, as in the app.
    let projectId = input.projectId;
    if (!projectId && input.projectName) {
      projectId = store.addProject({ name: input.projectName, color: 'blue' }).id;
    }

    store.addTask({
      title: input.title,
      due: input.due || null,
      dueTime: input.dueTime || null,
      priority: input.priority,
      labels: input.labels || [],
      projectId
    });

    updateTray();
    send('state:changed', store.snapshot());
    hideQuickWindow();
  });

  createTray();

  if (!globalShortcut.register(QUICK_SHORTCUT, showQuickWindow)) {
    console.error(`Could not register the global shortcut ${QUICK_SHORTCUT} — `
      + 'another app is probably using it. Use the tray menu instead.');
  }

  createQuickWindow();

  checkReminders();
  setInterval(checkReminders, 30000);

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // The tray keeps the app alive on macOS; elsewhere closing the window quits.
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

}
