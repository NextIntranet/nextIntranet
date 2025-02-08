<template>
  <div class="purchase-page q-pa-md container q-mx-auto" style="max-width: 2000px">

    <h1 class="text-2xl font-bold mb-4">Nákupní rozhraní</h1>

    <section class="order-info bg-white p-4 rounded shadow mb-4">
      <h2 class="text-xl font-semibold mb-2">Order Information</h2>
      <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block mb-1">Created by:</label>
        <q-input v-model="orderInfo.createdBy" outlined dense readonly />
      </div>
      <div>
        <label class="block mb-1">Created at:</label>
        <q-input v-model="orderInfo.createdAt" outlined dense readonly />
      </div>
      <div>
        <label class="block mb-1">Ordered at:</label>
        <q-input v-model="orderInfo.orderedAt" type="date" outlined dense />
      </div>
      <div>
        <label class="block mb-1">Order Status:</label>
        <q-select
        v-model="orderInfo.status"
        :options="[
          { label: 'Draft', value: 'draft' },
          { label: 'Pending', value: 'pending' },
          { label: 'Ordered', value: 'ordered' },
          { label: 'Delivered', value: 'delivered' },
          { label: 'Cancelled', value: 'cancelled' }
        ]"
        outlined
        dense
        />
      </div>
      <div class="col-span-2">
        <label class="block mb-1">Supplier:</label>
        <div class="flex items-center">
        <GetSupplier v-model="selectedSupplier" />
      </div>
      </div>
      <div class="col-span-2">
        <label class="block mb-1">Notes:</label>
        <q-editor
        v-model="orderInfo.notes"
        min-height="100px"
        outlined
        />
      </div>
      <div class="col-span-2">
        <q-btn
          @click="saveOrderInfo"
          color="primary"
          icon="save"
          label="Save order information"
          class=""
        />
      </div>
      </div>
    </section>

    <section class="financial-info bg-white p-4 rounded shadow mb-4">
      <h2 class="text-xl font-semibold mb-2">Celkové finanční informace</h2>
      <div class="mb-2">
        <label for="total-amount" class="block mb-1">Celková částka:</label>
        <input type="number" id="total-amount" v-model="financial.totalAmount" required class="w-full p-2 border rounded" />
      </div>
    </section>

  <section class="item-rows bg-white p-4 rounded shadow mb-4">
    <h2 class="text-xl font-semibold mb-2">Položky</h2>
    <div class="flex items-center mb-2 font-semibold">
      <span class="flex-1">Název položky</span>
      <span class="w-24"> </span>
      <span class="w-24">Cena bez DPH</span>
      <span class="w-24">Cena s DPH</span>
      <span class="w-24">Přepočítaná cena</span>
      <span class="w-24">Počet kusů</span>
      <span class="w-24">Násobnost</span>
      <span class="w-32">Objednací symbol</span>
      <span class="w-24">Akce</span>
    </div>
    <div v-for="(item, index) in items" :key="index" class="flex items-center border">
      <q-select
        v-model="item.name"
        :options="itemOptions"
        class="flex-1"
        borderless
        dense
        use-input
        input-debounce="300"
        @filter="filterItems"
      />
      <q-select
        v-model="item.supplier"
        :options="suppliers.map(supplier => ({ label: supplier.name, value: supplier.id }))"
        class="w-24 "
        borderless
        dense
        placeholder="Dodavatel"
      />
      <q-select
        v-model="item.priceWithoutTax"
        :options="priceOptions"
        class="w-24"
        borderless
        dense
        use-input
        input-debounce="300"
        @filter="filterPrices"
        placeholder="Cena bez DPH"
      />
      <q-input
        type="number"
        v-model="item.priceWithTax"
        placeholder="Cena s DPH"
        class="w-24"
        borderless
        dense
      />
      <q-input
        type="number"
        v-model="item.convertedPrice"
        placeholder="Přepočítaná cena"
        class="w-24"
        borderless
        dense
      />
      <q-input
        type="number"
        v-model="item.quantity"
        placeholder="Počet kusů"
        class="w-24"
        borderless
        dense
      />
      <q-input
        type="number"
        v-model="item.multiplier"
        placeholder="Násobnost"
        value=1
        class="w-24"
        borderless
        dense
      />
      <q-input
        type="text"
        v-model="item.orderSymbol"
        placeholder="Objednací symbol"
        class="w-32"
        borderless
        dense
      />
      <span
        class="w-20"
        >
      <q-btn
      @click="removeItem(index)"
        dense
        flat
        icon="delete"
      />
      </span>
    </div>
    <q-btn
      @click="addItem"
      color="green-5"
      class="text-white p-2 rounded flex items-center"
      icon="add"
      label="Přidat položku"
    />
    <q-btn
      @click="savePurchase"
      color="primary"
      class="mt-4"
      icon="save"
      label="Uložit"
    />
  </section>
  </div>
</template>

<script>
import GetSupplier from 'src/components/supplier/GetSupplier.vue';


export default {
  components: {
    GetSupplier
  },
  data() {
    return {
      orderInfo: {
        createdBy: 'John Doe',
        createdAt: '2021-09-01',
        orderedAt: '',
        status: 'draft',
        notes: ''
      },
      suppliers: [
        { id: 1, name: 'Dodavatel 1' },
        { id: 2, name: 'Dodavatel 2' },
        { id: 3, name: 'Dodavatel 3' }
      ],
      supplier: {
        name: '',
        contact: ''
      },
      financial: {
        totalAmount: 0
      },
      items: [
        { name: '', quantity: 0, unitPrice: 0 }
      ],
      selectedSupplier: null,
    };
  },
  methods: {
    submitSupplierInfo() {
      // Handle supplier info submission
      console.log('Supplier Info:', this.supplier);
    },
    addItem() {
      this.items.push({ name: '', quantity: 0, unitPrice: 0 });
    },
    removeItem(index) {
      this.items.splice(index, 1);
    }
  }
};
</script>

<style scoped>


section {
  margin-bottom: 20px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  border: 1px solid #ddd;
  padding: 8px;
}

th {
  background-color: #f2f2f2;
}

button {
  margin-top: 10px;
}
</style>
