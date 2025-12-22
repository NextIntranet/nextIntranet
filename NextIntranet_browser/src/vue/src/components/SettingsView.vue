
/* eslint-disable */ 
<template>
    <div>
      <h2>Remote Page Settings</h2>
      <form @submit.prevent="$emit('updateRemoteUrl')">
        <label for="remoteUrlInput">Remote URL:</label>
        <input id="remoteUrlInput" v-model="$props.remoteUrl" type="text" required />
        <br />
        <button type="submit">Save Remote URL</button>
      </form>
  
      <h2>Printer Settings</h2>
      <form @submit.prevent="$emit('addPrinterPreset')">
        <label for="printerType">Printer Type:</label>
        <input id="printerType" v-model="$props.newPreset.printerType" type="text" required />
        <br />
        <label for="printerName">Printer Name:</label>
        <input id="printerName" v-model="$props.newPreset.printerName" type="text" required />
        <br />
        <label for="printerOptions">Printer Options:</label>
        <input id="printerOptions" v-model="$props.newPreset.printerOptions" type="text" required />
        <br />
        <label for="printerDescription">Printer Description:</label>
        <input id="printerDescription" v-model="$props.newPreset.printerDescription" type="text" required />
        <br />
        <button type="submit">Add Preset</button>
      </form>
  
      <h3>Presets</h3>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Options</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(preset, index) in printerPresets" :key="index">
            <td>{{ preset.printerType }}</td>
            <td>{{ preset.printerName }}</td>
            <td>{{ preset.printerOptions }}</td>
            <td>{{ preset.printerDescription }}</td>
            <td>
              <button @click="$emit('setActivePreset', index)">Set Active</button>
              <button @click="$emit('removePreset', index)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
  
  <script>
  export default {
    props: ['remoteUrl', 'printerPresets', 'newPreset'],
  };
  </script>
  