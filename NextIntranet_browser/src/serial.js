import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import fetch from 'node-fetch';
import Store from 'electron-store';

import { ipcMain } from 'electron';
import { BrowserWindow } from 'electron';

let port;
let parser;

/**
 * Připojení k sériovému portu.
 * @param {string} path - Cesta k zařízení (např. /dev/ttyUSB0).
 * @param {number} baudRate - Rychlost přenosu.
 */
export function connectSerialPort(path, baudRate = 9600) {
  port = new SerialPort({ path, baudRate });

  port.on('error', (err) => {
    console.error('Chyba sériového portu:', err.message);
  });

  port.on('data', function (data) {
      onSerialData(data);
  })

  console.log(`Připojeno k sériovému portu ${path} s rychlostí ${baudRate}`);
}

/**
 * Posluchač příchozích dat.
 * @param {function} callback - Funkce pro zpracování dat.
 */
export function onSerialData(callback) {
    console.log('onSerialData', callback);
    const dataString = callback.toString('utf8').trim().replace(/(\r\n|\n|\r)/gm, "");
    console.log('Přijatá data:', dataString);

    if (false) {
        console.log('Webview endpoint is available.');
    } else {
        fetch('http://localhost:8080/api/v1/core/identifier/', {
            method: 'POST',
            headers: {
                "Content-Type": 'application/json',
                "User-Agent": "NextBrowser",
                Authorization: `Bearer ${new Store().get('userToken').access}`,
            },
            body: JSON.stringify({
                codeReader: 'barcode',
                scanDateTime: new Date().toISOString(),
                data: dataString,
                q: null,
                parsedData: {}
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Data from API:', data);
            
            // Najít hlavní okno a poslat zprávu do renderer procesu
            const windows = BrowserWindow.getAllWindows();
            const mainWindow = windows[0]; // Předpokládáme, že hlavní okno je první
            if (mainWindow) {
              mainWindow.webContents.send('reader-result', data);
            }
        })
        .catch(error => {
            console.error('Error fetching data from API:', error);
        });
    }
}

/**
 * Odeslání zprávy do zařízení.
 * @param {string} message - Zpráva k odeslání.
 */
export function sendSerialData(message) {
  if (port) {
    port.write(message + '\n', (err) => {
      if (err) {
        console.error('Chyba při odesílání:', err.message);
      } else {
        console.log('Zpráva odeslána:', message);
      }
    });
  } else {
    console.error('Sériový port není připojen.');
  }
}

/**
 * Odpojení od sériového portu.
 */
export function disconnectSerialPort() {
  if (port) {
    port.close();
    console.log('Sériový port odpojen.');
  } else {
    console.error('Sériový port není připojen.');
  }
}
