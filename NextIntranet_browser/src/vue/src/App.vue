/* eslint-disable */

<template>
  <div id="app">
    <nav>
      <span>{{ title }}</span>
      <div>
        <button @click="showSettings">Settings</button>
        <button @click="showWebView">Home</button>
      </div>
    </nav>
    <main>
      <webview
        v-if="currentView === 'webview'"
        :src="remoteUrl"
        preload="file://home/roman/repos/roman-dvorak/nextIntranet/NextIntranet_browser/src/preload.js"
        partition="persist:shared-session"
        @ipc-message="handleIPCMessage"
        @console-message="handleConsoleMessage"
      ></webview>
      <SettingsView
        v-if="currentView === 'settings'"
        :printerPresets="printerPresets"
        :activePresetIndex="activePresetIndex"
        :newPreset="newPreset"
        @addPrinterPreset="addPrinterPreset"
        @removePreset="removePreset"
        @setActivePreset="setActivePreset"
        @updateRemoteUrl="updateRemoteUrl"
      />
    </main>
  </div>
</template>

<script>
import { onMounted, ref, watch } from 'vue';
import SettingsView from './components/SettingsView.vue';


export default {
  compilerOptions: {
    isCustomElement: (tag) => tag === 'webview',
  },
  components: {
    SettingsView,
  },
  setup() {
    const title = ref('Electron + Vue + Printer Settings');
    const remoteUrl = ref('http://localhost:8080/');
    const currentView = ref('webview');
    const printerPresets = ref([]);
    const activePresetIndex = ref(null);
    const newPreset = ref({
      printerType: '',
      printerName: '',
      printerOptions: '',
      printerDescription: '',
    });

    const showSettings = () => {
      currentView.value = 'settings';
    };

    const showWebView = () => {
      currentView.value = 'webview';
    };

    const addPrinterPreset = async () => {
        printerPresets.value.push({ ...newPreset.value });
        newPreset.value.printerType = '';
        newPreset.value.printerName = '';
        newPreset.value.printerOptions = '';
        newPreset.value.printerDescription = '';
        await savePresets();
    };
    
    const removePreset = async (index) => {
        printerPresets.value.splice(index, 1);
        if (activePresetIndex.value === index) {
            activePresetIndex.value = null;
        }
        await savePresets();
    };
    
    const setActivePreset = async (index) => {
        activePresetIndex.value = index;
        await savePresets();
    };

      const savePresets = async () => {
        console.log('Saving printer presets: (vue)', printerPresets.value, activePresetIndex.value);
        await window.electronAPI.setPrinterSettings({
            printerPresets: JSON.parse(JSON.stringify(printerPresets.value)),
            activePresetIndex: activePresetIndex.value,
        });
      };
      
      const loadPresets = async () => {
          const settings = await window.electronAPI.getPrinterSettings();
          printerPresets.value = settings.printerPresets || [];
          activePresetIndex.value = settings.activePresetIndex || null;
      };
      loadPresets();

      const saveActivePresetIndex = () => {
          localStorage.setItem('activePresetIndex', activePresetIndex.value);
      };

      const activePreset = ref({});
      watch(
          () => activePresetIndex.value,
          (index) => {
              activePreset.value = index !== null ? printerPresets.value[index] : {};
          },
      );



    const updateRemoteUrl = () => {
      alert(`Remote URL updated to: ${remoteUrl.value}`);
      showWebView();
    };

    const handleIPCMessage = (event) => {
      console.log('IPC Message:', event);
    };

    const handleConsoleMessage = (event) => {
      console.log('Console Message:', event);
    };


    onMounted(() => {
      console.log('Mounted');
    });

    return {
      title,
      remoteUrl,
      currentView,
      printerPresets,
      activePresetIndex,
      newPreset,
      showSettings,
      showWebView,
      addPrinterPreset,
      removePreset,
      setActivePreset,
      updateRemoteUrl,
      handleIPCMessage,
      handleConsoleMessage,
    };
  },
};
</script>

<style>

body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
        }
        #app {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        nav {
            background: #282c34;
            color: white;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        nav button {
            background: #61dafb;
            border: none;
            padding: 10px 15px;
            cursor: pointer;
            border-radius: 5px;
            color: black;
        }
        nav button:hover {
            background: #21a1f1;
        }
        main {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: #f0f0f0;
            overflow: hidden;
            padding: 0;
        }
        webview {
            width: 100%;
            height: 100%;
            flex-grow: 1;
            border: none;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
        }
        th {
            background-color: #f4f4f4;
        }

</style>
