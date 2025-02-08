<template>
  <div class="border-b border-gray-200 bg-gray-50 my-3 rounded-md">
    <!-- Header -->
    <div class="flex text-xs justify-between items-center p-4 bg-gray-50 py-1">
      <div class="text-xs text-gray-400 flex items-center">
        <span class="mr-2">UUID:</span> {{ component.id }}
        <button
          class="ml-2 text-blue-500 hover:text-blue-700"
          title="Copy UUID"
          @click="copyToClipboard(component.id)"
        >
          <span class="material-icons text-sm">content_copy</span>
        </button>
      </div>
      <!-- Actions -->
      <div class="flex space-x-4">
        <button class="text-blue-500 hover:text-blue-700" title="Edit">
          <span class="material-icons">edit</span>
        </button>
        <button class="text-red-500 hover:text-red-700" title="Delete">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>

    <!-- Item Content -->
    <div class="flex p-4 py-1">
      <!-- Image -->
      <img
        :src="component.primary_image_url || 'https://placehold.co/300x300'"
        alt="Item image"
        class="w-24 h-24 object-cover rounded"
        @error="handleImageError"
      />
      <!-- Details -->
      <div class="flex-1 ml-4">
        <div class="flex justify-between items-center">
          <div class="flex">
            <router-link :to="`/store/component/${component.id}/`" target="_blank" class="mr-2 text-gray-400 hover:text-gray-600" title="Open in a new tab">
              <span class="material-icons text-sm flex items-center justify-center">open_in_new</span>
            </router-link>
            <router-link :to="`/store/component/${component.id}/`" class="text-blue-500 hover:text-blue-700">
              <h2 class="text-lg font-bold">{{ component.name }}</h2>
            </router-link>
          </div>
          <span class="text-xs bg-gray-200 px-2 py-1 rounded flex items-center">
            <span class="material-icons text-sm mr-1">category</span> {{ component.category?.name || 'No category' }}
          </span>
        </div>
        <div class="mt-1">
          <span
            v-for="tag in component.tags || []"
            :key="tag.id"
            class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-1"
          >
            {{ tag.name }}
          </span>
        </div>
        <p class="mt-2 text-sm text-gray-600" v-html="component.description"></p>
        <span class="text-xs px-2 py-1 rounded">
          {{ component.status || 'No status' }}
        </span>
      </div>

      <!-- Prices and Stock -->
      <div class="ml-2 pl-2 text-sm border-l-2">
        <div class="mb-2">
          <p class="flex items-center text-gray-800">
            <span class="material-icons text-blue-500 mr-2">attach_money</span>
            Public price:
            <span class="ml-2 font-bold">{{ component.sellingPrice }} Kč</span>
          </p>
          <p class="flex items-center text-gray-800">
            <span class="material-icons text-green-500 mr-2">price_change</span>
            Internal price:
            <span class="ml-2 font-bold">{{ component.internalPrice }} Kč</span>
          </p>
        </div>
        <div>
          <p class="flex items-center text-gray-800">
            <span class="material-icons text-yellow-500 mr-2">inventory</span>
            In this warehouse:
            <span class="ml-2 font-bold">{{ component.stockLocal || 0 }}</span>
          </p>
          <p class="flex items-center text-gray-800">
            <span class="material-icons text-orange-500 mr-2">store</span>
            In all warehouses:
            <span class="ml-2 font-bold">{{ component.stockTotal || 0 }}</span>
          </p>
          <p class="flex items-center text-gray-800">
            <span class="material-icons text-red-500 mr-2">local_shipping</span>
            At supplier:
            <span class="ml-2 font-bold">{{ component.stockSupplier || 0 }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ComponentListRow',
  props: {
    component: {
      type: Object,
      required: true,
    },
  },
  methods: {
    copyToClipboard(text) {
      navigator.clipboard.writeText(text);
      alert(`UUID copied: ${text}`);
    },
    handleImageError(event) {
      event.target.src = 'https://placehold.co/300x300';
    },
  },
};
</script>

<style scoped>
.component-list-row {
  border: 1px solid #ccc;
  padding: 10px;
  margin: 10px 0;
}
</style>
