<template>
  <div class="bg-white shadow-md rounded-lg p-6 mb-6">
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-lg font-bold text-gray-700">
        Suppliers <span class="text-gray-400">({{ suppliers?.length }})</span>
      </h4>
      <div class="flex items-center space-x-4">
        <NuxtLink
          to="/new_supplier"
          class="flex items-center text-gray-500 hover:text-gray-700 text-sm"
        >
          <span class="material-icons mr-1">add</span>
          Add Supplier
        </NuxtLink>
        <button
          @click="updateAllSuppliers"
          class="flex items-center text-gray-500 hover:text-gray-700 text-sm"
        >
          <span class="material-icons mr-1">sync</span>
          Update All
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <StoreSupplierCard
        v-for="supplier in suppliers"
        :supplier="supplier"
        :key="supplier.id"
        class="flex flex-col items-start bg-gray-100 p-4 rounded shadow-md"
      >

      </StoreSupplierCard>
    </div>
  </div>
</template>

<script>

import StoreSupplierCard from './StoreSupplierCard.vue';

export default {
  props: {
    suppliers: {
      type: Array,
      required: true,
    },
  },
  methods: {
    updateAllSuppliers() {
      // Method to trigger update
    },
    copyPartNumber(partNumber) {
      // Method to copy part number
    },
    removeOrDisableSupplier(supplier) {
      // Method to remove or disable supplier
    },
    addToOrder(supplier) {
      // Method to add supplier to order
    },
  },

};
</script>


  <script setup>
  import { onMounted, ref, computed } from 'vue';


  const props = defineProps({
    suppliers: {
      type: Array,
      required: true,
    },
  });


  onMounted(() => {
  });



  </script>

  <style>
  .grid {
    display: grid;
    gap: 1rem;
  }
  .grid-cols-1 {
    grid-template-columns: repeat(1, 1fr);
  }
  .grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .material-icons {
    font-size: 20px;
    cursor: pointer;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th, td {
    padding: 0.5rem;
    text-align: left;
  }
  th {
    border-bottom: 2px solid #e5e7eb;
  }
  td {
    border-bottom: 1px solid #e5e7eb;
  }
  </style>
