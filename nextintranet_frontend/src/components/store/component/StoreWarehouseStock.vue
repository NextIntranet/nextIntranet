<template>
  <div class="bg-white shadow-md rounded-lg p-6 mb-6">

    <div class="flex justify-between items-center mb-4">
    <h4 class="text-lg font-bold text-gray-700">Warehouse packets <span class="text-gray-400">({{ packets?.length }})</span> </h4>
    <a href="./new_packet/" class="flex items-center text-gray-500 hover:text-gray-700 text-sm">
      <span class="material-icons mr-1">add</span>
      Add Packet
    </a>
    </div>

    <!-- Aktuální sklad -->
    <div>
      <h5 class="text-md font-semibold text-gray-600 mb-3">Current Warehouse</h5>
        <div class="grid lg:grid-cols-2 sm:grid-cols-1 gap-4">
          <div
            v-for="(bag, index) in packets"
            :key="bag.id"
            class="flex flex-col items-start bg-gray-100 p-4 rounded shadow-md"
          >
          <div class="text-gray-400 pb-1">
            <span class="text-lg text-gray-800 font-bold">{{ bag.id.substring(0, 8) }}</span>{{ bag.id.substring(8) }}
          </div>
          <div class="mb-2 text-gray-600">
            <p>{{ bag.description }}</p>
            </div>
            <p class="text-gray-600 text-sm">
              <span class="material-icons text-xs text-gray-600">location_on</span> Loc: {{ bag.location.name }}
            </p>
            <p class="text-gray-600 text-sm">
              <span class="material-icons text-xs text-gray-600">calendar_today</span> Add: {{ bag.dateAdded }}
            </p>
            <p class="text-gray-600 text-sm">
              <span class="material-icons text-xs text-gray-600">inventory</span> Stock: {{ bag.quantity }}
            </p>
            <p class="text-gray-600 text-sm">
              <span class="material-icons text-xs text-gray-600">attach_money</span> Item price: ${{ bag.unitPrice }}
            </p>
            <p class="text-gray-600 text-sm">
              <span class="material-icons text-xs text-gray-600">attach_money</span> Total price: ${{ bag.totalValue }}
            </p>
            <h6 class="text-gray-800 font-semibold mt-4">History</h6>
            <div v-if="bag.history && bag.history.length" class="mt-1 w-full overflow-y-auto max-h-48">
              <table class="w-full text-sm text-left">
          <thead>
            <tr class="text-gray-600">
              <th class="border-b px-2 py-1">#</th>
              <th class="border-b px-2 py-1">Op</th>
              <th class="border-b px-2 py-1">Qty</th>
              <th class="border-b px-2 py-1">$</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, entryIndex) in bag.history" :key="entryIndex" class="text-gray-800">
              <td class="border-b px-2 py-1" v-tooltip="entry.dateTime">{{ entryIndex + 1 }}</td>
              <td class="border-b px-2 py-1">
                <span class="material-icons">{{ entry.icon }}</span>
              </td>
              <td class="border-b px-2 py-1">{{ entry.quantity }} ({{ entry.quantity - entry.operationCount }})</td>
              <td class="border-b px-2 py-1">${{ entry.operationPrice }} (${{ entry.unitPrice * entry.operationCount }})</td>
            </tr>
          </tbody>
              </table>
            </div>
            <div v-else class="text-gray-600 text-sm mt-2">No history available.</div>

            <div class="flex justify-start items-center gap-2 mt-4 w-full">
              <a :href="`/store/packet/${bag.id}/edit`" class="flex items-center text-gray-500 hover:text-gray-700 text-sm">
          <span class="material-icons mr-1">edit</span>
          Edit
              </a>
              <a :href="`/store/packet/${bag.id}/operation/`" class="flex items-center text-gray-500 hover:text-gray-700 text-sm">
          <span class="material-icons mr-1">build</span>
          Operation
              </a>
              <button class="flex items-center text-gray-500 hover:text-gray-700 text-sm" @click="printLabel(bag.id)">
          <span class="material-icons mr-1">print</span>
          Print
              </button>
              <button class="flex items-center text-gray-500 hover:text-gray-700 text-sm" @click="copyToClipboard(`/store/component/${bag.id}`)">
          <span class="material-icons mr-1">content_copy</span>
          Copy Link
              </button>
            </div>
        </div>
      </div>
    </div>
    <!-- Ostatní sklady -->
    <div class="mt-6">
      <h5 class="text-md font-semibold text-gray-600 mb-3">Other Warehouses</h5>
      <ul class="divide-y divide-gray-200">
        <li
          v-for="warehouse in otherWarehouses"
          :key="warehouse.id"
          class="py-4"
        >
          <div class="flex justify-between items-center">
            <div>
              <h6 class="text-gray-800 font-bold">{{ warehouse.name }}</h6>
              <p class="text-gray-600 text-sm">
                Total Items: {{ warehouse.totalItems }}
              </p>
            </div>
            <button
              @click="switchWarehouse(warehouse.id)"
              class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Switch
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  name: "StoreWarehouseStocks",
  props: {
    packets: {
      type: Array,
      required: true,
    },
    currentWarehouse: {
      type: Object,
      required: false,
    },
    otherWarehouses: {
      type: Array,
      required: false,
    },
  },
  methods: {
    switchWarehouse(id) {
      alert(`Switching to warehouse with ID: ${id}`);
    },
  },
};
</script>

<style>
.grid {
  display: grid;
  gap: 1rem;
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
