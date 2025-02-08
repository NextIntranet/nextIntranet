<template>
  <q-layout view="lHh Lpr lFf">
    <!-- Sidebar (QDrawer) -->
    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      class="bg-gray-800 text-white"
    >
      <div class="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 class="text-xl font-bold">NextIntranet</h1>
        <q-btn
          dense
          flat
          round
          icon="menu"
          class="text-white"
          @click="toggleLeftDrawer"
        />
      </div>

      <q-list class="p-4">
        <q-item-label header>Essential Links</q-item-label>
        <EssentialLink
          v-for="link in linksList"
          :key="link.title"
          v-bind="link"
        />
      </q-list>
    </q-drawer>

    <!-- Header (QHeader) -->
    <q-header elevated class="bg-white shadow">
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          class="text-gray-500 hover:text-gray-700"
          @click="toggleLeftDrawer"
        />
        <q-toolbar-title class="text-2xl font-semibold text-gray-800">
          NextIntranet App
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <!-- Main Content (QPageContainer) -->
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref } from 'vue';
import EssentialLink from 'components/EssentialLink.vue';

const linksList = [
  { title: 'Login', caption: 'Login page', icon: 'account_circle', link: '/login' },
  { title: 'Home', caption: 'Homepage', icon: 'home', link: '/' },
  { title: 'Store', caption: 'Our store', icon: 'store', link: '/store' },
  { title: 'Component', caption: 'Component page', icon: 'extension', link: '/store/component' },
  { title: 'Test', caption: 'Test page', icon: 'extension', link: '/store/component/8b931238-ffb0-40ed-b84a-755b70d3bd46/' },
];

const leftDrawerOpen = ref(false);

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}
</script>

<style scoped>
/* Sidebar styles */
.q-drawer {
  background-color: #444865;
  color: white;
  transition: width 0.3s ease;
}

.q-drawer .q-item {
  color: white;
}

/* Header styles */
.q-header {
  background-color: #f9f9f9;
}

/* General */
.q-page-container {
  background-color: #f4f4f9;
}
</style>
