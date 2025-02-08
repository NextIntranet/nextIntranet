<template>
      <div>
        {{ purchases.value?.allPurchase }}
      </div>
      <div class="my-2">

        <h2 class="text-2xl font-bold mb-4">Purchase List</h2>

        <div class="bg-white p-4 rounded shadow-md mx-auto max-w-4xl my-2">
        <div v-for="purchase in purchases.value?.allPurchase" :key="purchase.id" class="purchase-row" style="display: flex; gap: 10px;">
          <q-btn :to="'/purchase/' + purchase.id+'/'" label="View Purchase" />
          <div>{{ purchase.created_at }}</div>
          <div>{{ purchase.supplier.name }}</div>
          <div>{{ purchase.status }}</div>
        </div>
        </div>
      </div>
    </template>


<script>
import { useQuery } from '@vue/apollo-composable';
import { GET_PURCHASES } from './../../apollo/queries';
import { computed } from 'vue';


export default {
  name: 'PurchaseList',
  data() {
    return {
      // Your data properties here
    };
  },
  methods: {
    // Your methods here
  },
  mounted() {
    // Your mounted hook here
  },
  setup( props, { emit } ) {
    const { result, loading, error } = useQuery(GET_PURCHASES);

    const purchases = computed(() => result || []);


    return {
      purchases,
      loading,
    };
  },
};
</script>

<style scoped>
/* Your styles here */
</style>
