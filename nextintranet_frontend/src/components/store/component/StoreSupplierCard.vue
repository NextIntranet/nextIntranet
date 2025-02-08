<template>

<div class="flex items-center mb-2">
          <span class="material-icons text-gray-500 mr-2">store</span>
          <NuxtLink
            :to="supplier.supplier.website"
            target="_blank"
            class="text-gray-800 font-bold hover:underline"
          >
            {{ supplier.supplier.name }}
          </NuxtLink>
        </div>

        <div class="w-full">
          <div class="flex items-center text-gray-600 text-sm mb-2">
            <span>Part Number:</span>
            <NuxtLink
              :to="supplier.url"
              target="_blank"
              class="ml-2 text-blue-600 underline"
            >
              {{ supplier.symbol }}
            </NuxtLink>
            <span
              class="ml-2 text-gray-500 cursor-pointer hover:text-gray-800"
              @click="copyPartNumber(supplier.symbol)"
            >
              <span class="material-icons">content_copy</span>
            </span>
          </div>

          <p v-if="supplier.description" class="text-gray-900 text-sm mb-4">
            {{ supplier.description }}
          </p>

          <div v-if="supplier.api?.apiAvailable" class="w-full">
            <div class="text-gray-600 text-sm mt-2">Price Ranges:</div>
            <table class="w-full text-left text-sm mt-2">
              <thead>
                <tr class="text-gray-600">
                  <th class="border-b px-2 py-1">Quantity</th>
                  <th class="border-b px-2 py-1">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="range in supplier.api.priceRanges"
                  :key="range.quantity"
                  class="text-gray-800"
                >
                  <td class="border-b px-2 py-1">{{ range.quantity }}</td>
                  <td class="border-b px-2 py-1">${{ range.price }}</td>
                </tr>
              </tbody>
            </table>
            <div class="text-gray-600 text-xs mb-1">
              Data Updated: {{ supplier.api.lastUpdated || 'N/A' }}
            </div>
          </div>

          <div v-else class="text-gray-400 text-sm mt-2">No API available</div>
        </div>

        <div class="flex justify-start items-center gap-2 mt-4 w-full">
          <button
            class="flex items-center text-gray-500 hover:text-gray-700 text-sm"
            @click="removeOrDisableSupplier(supplier)"
          >
            <span class="material-icons mr-1">delete</span>
            Delete
          </button>
          <NuxtLink
            :to="`/store/supplier/${supplier.id}/edit`"
            class="flex items-center text-gray-500 hover:text-gray-700 text-sm"
          >
            <span class="material-icons mr-1">edit</span>
            Edit
          </NuxtLink>
          <button
            class="flex items-center text-gray-500 hover:text-gray-700 text-sm"
            @click="addToOrder(supplier)"
          >
            <span class="material-icons mr-1">add_shopping_cart</span>
            Add to Order
          </button>
        </div>

</template>
<script setup>
defineProps({
  supplier: {
    type: Object,
    required: true,
  },
});
</script>
