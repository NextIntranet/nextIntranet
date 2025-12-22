const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendLoginData: (credentials) => ipcRenderer.invoke('login', credentials),
    sendLoginSuccess: () => ipcRenderer.send('login-success'),
    onLoginSuccess: (callback) => ipcRenderer.on('login-success', callback),
});
