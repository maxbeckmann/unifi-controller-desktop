const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

let containerProcess = null;
let mainWindow = null;

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('gtk-version', '3');

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  console.log("Ignoring TLS certificate error");
  event.preventDefault();
  callback(true);
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
        <h2>Starting Unifi Controller...</h2>
      </body>
    </html>`);
}

function loadControllerUI() {
  if (mainWindow) {
    mainWindow.loadURL('https://localhost:8443');
  }
}

app.whenReady().then(() => {
  createMainWindow();

  // Determine and ensure config directory exists
  const configDir = path.resolve(os.homedir(), '.config', 'unifi-controller');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Start the Podman container
  containerProcess = spawn('podman', [
    'run', '--rm', '-p', '127.0.0.1:8443:8443',
    '-p', '8080:8080',
    '-p', '1900:1900/udp',
    '-v', `${configDir}:/config:Z`,
    'lscr.io/linuxserver/unifi-controller:latest'
  ]);

  containerProcess.stdout.on('data', data => {
    const output = data.toString();
    console.log(`Container stdout: ${output}`);
    if (output.includes('[ls.io-init] done.')) {
      loadControllerUI();
    }
  });

  containerProcess.stderr.on('data', data => {
    console.error(`Container stderr: ${data}`);
  });

  containerProcess.on('error', err => {
    console.error('Failed to start container:', err);
    app.quit();
  });

  containerProcess.on('exit', (code, signal) => {
    console.log(`Container exited with code ${code}, signal ${signal}`);
  });
});

app.on('window-all-closed', () => {
  if (containerProcess && !containerProcess.killed) {
    console.log("Stopping container...");
    containerProcess.kill('SIGINT');
  }
  app.quit();
});
