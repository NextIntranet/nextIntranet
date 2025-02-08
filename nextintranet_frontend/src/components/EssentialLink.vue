<template>
  <router-link :to="props.link" custom v-slot="{ navigate }">
    <q-item clickable tag="div" @click="navigate">
      <q-item-section v-if="props.icon" avatar>
        <q-icon :name="props.icon" />
      </q-item-section>

      <q-item-section>
        <q-item-label>{{ props.title }}</q-item-label>
        <q-item-label caption>{{ props.caption }}</q-item-label>
      </q-item-section>
    </q-item>
  </router-link>
</template>

<script setup>
const props = defineProps({
  title: {
    type: String,
    required: true
  },

  caption: {
    type: String,
    default: ''
  },

  link: {
    type: String,
    default: '#'
  },

  icon: {
    type: String,
    default: ''
  }
})
</script>
