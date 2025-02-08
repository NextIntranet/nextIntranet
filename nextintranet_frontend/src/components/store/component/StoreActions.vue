<template>
    <div class="bg-white shadow-md rounded-lg p-6 mb-6">
      <h4 class="text-lg font-bold text-gray-700 mb-4">Actions</h4>
      <ul class="list-disc pl-6">
        <li class="mb-2">
          <button @click="$emit('move')" class="text-blue-600 underline">Move Between Bags</button>
        </li>
        <li class="mb-2">
          <button @click="$emit('service')" class="text-blue-600 underline">Service Withdrawal</button>
        </li>
        <li class="mb-2">
          <button @click="$emit('sell')" class="text-blue-600 underline">Sell</button>
        </li>
        <li class="mb-2">
          <button @click="$emit('purchase')" class="text-blue-600 underline">Purchase</button>
        </li>
        <li class="mb-2">
          <button @click="$emit('inventory')" class="text-blue-600 underline">Inventory Check</button>
        </li>
      </ul>
    </div>
  </template>

  <script>
  export default {
    name: "StoreActions",
    emits: ["move", "service", "sell", "purchase", "inventory"],
  };
  </script>

  <style>
  .list-disc {
    list-style-type: disc;
  }
  </style>
