<template>
  <div class="container mx-auto py-8 px-4">
    <div class="flex items-center mb-6">
      <button @click="$router.go(-1)" class="mr-2 text-gray-500 hover:text-gray-700">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
      </button>
      <h1 class="text-3xl font-bold text-gray-800">Item Details</h1>

      <button @click="refreshData" class="ml-2 text-gray-500 hover:text-gray-700">
        <span class="material-icons text-3xl">refresh</span>
      </button>

    </div>

    <div v-if="loading">Načítání...</div>
    <div v-else-if="error" class="error">Chyba při načítání dat</div>
    <div v-else>
      <div class="flex flex-wrap -mx-4">
        <div class="w-full lg:w-2/3 px-4">
          <StoreItemCard v-bind:item_id="result?.component?.id" v-bind:component="result?.component" />
          <StoreItemParameters v-bind:parameters="result?.component?.parameters" v-bind:component_id="result?.component?.id" />
          <StoreWarehouseStock :packets="result?.component.packets" />
          <StoreDocuments :documents="result?.component.documents" v-bind:component_id="result?.component?.id" />
        </div>
        <div class="w-full lg:w-1/3 px-4">
          <StoreSuppliers v-bind:suppliers="result?.component?.suppliers" />
          <StoreActions />
          <StoreUsage v-bind:component_id="result?.component?.id" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import StoreItemCard from '../../components/store/component/StoreItemCard.vue';
import StoreItemParameters from '../../components/store/component/StoreItemParameters.vue';
import StoreWarehouseStock from '../../components/store/component/StoreWarehouseStock.vue';
import StoreDocuments from '../../components/store/component/StoreDocuments.vue';
import StoreSuppliers from '../../components/store/component/StoreSuppliers.vue';
import StoreActions from '../../components/store/component/StoreActions.vue';
import StoreUsage from '../../components/store/component/StoreUsage.vue';

import { gql } from '@apollo/client/core';
import { useQuery } from '@vue/apollo-composable';
import { useRoute } from 'vue-router';
import { ref } from 'vue';

export default {
  name: 'ComponentDetail',
  components: {
    StoreItemCard,
    StoreItemParameters,
    StoreWarehouseStock,
    StoreDocuments,
    StoreSuppliers,
    StoreActions,
    StoreUsage,
  },
  setup() {
    const route = useRoute();

    // GraphQL query
    const query = gql`
      query ComponentQuery($id: UUID!) {
        component(id: $id) {
          createdAt
          description
          id
          internalPrice
          name
          sellingPrice
          unitType
          suppliers {
            description
            symbol
            id
            apiData
            supplier {
              website
              name
            }
          }
          category {
            id
            icon
            level
            name
            treeId
            abbreviation
            color
            description
          }
          parameters {
            parameterType {
              description
              id
              name
            }
            value
            id
          }
          packets {
            id
            isTrackable
            location {
              name
              location
            }
            description
          }
          documents {
            createdAt
            docType
            file
            id
            name
            url
          }
        }
      }
    `;

    // Fetch data
    const { result, loading, error } = useQuery(query, { id: route.params.uuid });

    return {
      result,
      loading,
      error,
    };
  },
};
</script>

<style scoped>
.component-detail {
  margin: 20px;
}

.error {
  color: red;
  font-weight: bold;
}
</style>
