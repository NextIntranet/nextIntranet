// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require("electron");


contextBridge.exposeInMainWorld("electronAPI", {
    printLabel: (labelType, labelId) => {
        console.log('Print data --------:', labelType, labelId);
        ipcRenderer.send("print-label", { labelType, labelId });
    },
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (config) => ipcRenderer.invoke('set-config', config),
    getPrinterSettings: () => ipcRenderer.invoke('get-printer-settings'),
    setPrinterSettings: (settings) => ipcRenderer.invoke('set-printer-settings', settings),

    connectSerial: (path, baudRate) => ipcRenderer.invoke('serial-connect', path, baudRate),
    sendSerial: (message) => ipcRenderer.invoke('serial-send', message),
    disconnectSerial: () => ipcRenderer.invoke('serial-disconnect'),
    onSerialData: (callback) => ipcRenderer.on('serial-data', (event, data) => callback(data)),

    // readerResults: (channel, data) => ipcRenderer.send(channel, data),
    onReaderData: (callback) => ipcRenderer.on('reader-result', (event, data) => callback(data)),

});
