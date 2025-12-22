import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import started from 'electron-squirrel-startup';
import { connectSerialPort, onSerialData, sendSerialData, disconnectSerialPort } from './serial.js';

import { writeFileSync } from 'fs';

import { print, isPrintComplete, getPrinters, getDefaultPrinter } from 'unix-print';
import axios from 'axios';
import Store from 'electron-store';

const store = new Store();
import { fileURLToPath } from 'url';
import { dirname } from 'path';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


//const printer = "TSC_TE310_Network";
//const options = [];
//options.push('-o', 'media=Custom.2.6x1.5in');

// store.set('config', store.get('config', {
//   apiUrl: 'http://localhost:8080',
//   printerName: 'TSC_TE310_Network',
//   labelSize: '2.6x1.5in',
// }));


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

global.createLoginWindow = () => {
  const loginWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'login_preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  loginWindow.loadFile(path.join(__dirname, 'login.html'));

  loginWindow.on('closed', () => {
    global.loginWindow = null;
  });

  global.loginWindow = loginWindow;
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webviewTag: true,
      partition:"persist:shared-session",
      //enableBlinkFeatures: "WebHID",
      //enableWebUSB: true,
      //enableWebHID: true,
    },
  });
  
  //mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.loadURL('http://localhost:8081');
  //mainWindow.loadFile('src/vue/dist/index.html');

  // Modify headers for all requests
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'NextBrowser';
    details.requestHeaders['App-Identifier'] = 'NextBrowser';
    details.requestHeaders['X-Custom-Header'] = 'NextBrowser';
    details.requestHeaders['Authorization'] = `Bearer ${new Store().get('userToken').access}`;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
};










  // IPC Handlers
  ipcMain.handle('serial-connect', (event, path, baudRate) => {
    connectSerialPort(path, baudRate);
    return 'Připojeno';
  });

  ipcMain.handle('serial-send', (event, message) => {
    sendSerialData(message);
    return 'Odesláno';
  });

  ipcMain.handle('serial-disconnect', () => {
    disconnectSerialPort();
    return 'Odpojeno';
  });

  onSerialData((data) => {
    console.log("Posílám data do webview", data);
    view.webContents.send('serial-data', data);
  });









ipcMain.handle('get-config', () => {
  return Store.get('config');
});

ipcMain.handle('set-config', (event, newConfig) => {
  Store.set('config', newConfig);
  return Store.get('config');
});


// Inicializace výchozích hodnot
if (!store.has('printerPresets')) {
    store.set('printerPresets', []);
}
if (!store.has('activePresetIndex')) {
    store.set('activePresetIndex', null);
}



// Poskytování dat
ipcMain.handle('get-printer-settings', () => {
  console.log('Getting printer settings');
  return {
      printerPresets: store.get('printerPresets'),
      activePresetIndex: store.get('activePresetIndex'),
  };
});

// Aktualizace dat
ipcMain.handle('set-printer-settings', (event, { printerPresets, activePresetIndex }) => {
  console.log('Setting printer settings:', printerPresets, activePresetIndex);
  store.set('printerPresets', printerPresets);
  store.set('activePresetIndex', activePresetIndex);
});




ipcMain.on('print-label', (event, data) => {
  
  console.log('Print data --------:', data);
  const { labelType, labelId } = data;

  const cookies = data.cookies; // Získejte cookies z WebView
  const fetchPDF = async () => {
    try {
      const apiUrl = `http://localhost:8080/api/v1/${labelType}${labelId}/`;
      console.log('Fetching PDF:', apiUrl);
      const response = await axios.get(apiUrl, {
        responseType: 'arraybuffer',
        headers: {
          Authorization: `Bearer ${new Store().get('userToken').access}`,
          Cookie: cookies,
          "User-Agent": "NextBrowser",
        },
        
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching PDF:', error);
      throw error;
    }
  };

  fetchPDF().then((pdfBuffer) => {
    const filePath = path.join(__dirname, 'label.pdf');
    writeFileSync(filePath, pdfBuffer);
    //const printer = "TSC_TE310_Network";
    //const options = [];
    //options.push('-o', 'media=Custom.2.6x1.5in');


    const printerPresets = store.get('printerPresets') || [];
    const activePresetIndex = store.get('activePresetIndex') || -1;

    console.log("Fetched printer info", printerPresets,activePresetIndex);

    const printer = printerPresets[activePresetIndex]?.printerName;
    const type = printerPresets[activePresetIndex]?.printerType;
    const options = [printerPresets[activePresetIndex]?.printerOptions];
    const description = printerPresets[activePresetIndex]?.description;

    print(filePath, printer, options).then((jobId) => {
      console.log('Job ID:', jobId);
    });
  });
  
  });


// IPC handler pro přihlašování

ipcMain.on('login-success', () => {
  if (global.loginWindow) {
      global.loginWindow.close(); // Zavření přihlašovacího okna
      createWindow();  // Otevření hlavního okna
  }
});

ipcMain.handle('login', async (event, credentials) => {
  const { username, password } = credentials;

  console.log('Prihlasuji se s', username, password);

  try {
      const response = await fetch('http://localhost:8080/api/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
          const error = await response.json();
          console.log('Login failed:', error);
          return { success: false, message: error.detail || 'Login failed' };
      }

      console.log('Login successful');

      const data = await response.json();

      console.log('Token:', data);
      // Uložte token do bezpečného úložiště
      const { access, refresh } = data;
      const store = new Store();
      store.set('userToken', { access, refresh });
      
      return { success: true };
  } catch (error) {
      return { success: false, message: error };
  }
});



app.config.compilerOptions.isCustomElement = (tag) => tag === 'webview';

app.whenReady().then(() => {
  createLoginWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
