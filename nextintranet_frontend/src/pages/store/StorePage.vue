<template>
  <div class="store-page">
    <h1>Store Page</h1>
    <p>Welcome to the store page!</p>

    <div class="search-bar mb-4">
      <input
        v-model="searchQuery"
        @input="onSearch"
        type="text"
        placeholder="Search components..."
        class="px-4 py-2 border rounded w-full"
      />
    </div>

    <div>
      <button @click="refetch" class="px-4 py-2 bg-blue-500 text-white rounded">Refresh</button>
    </div>
    <div>
      <button @click="prevPage" class="px-4 py-2 bg-blue-500 text-white rounded">Previous</button>
      <button @click="nextPage" class="px-4 py-2 bg-blue-500 text-white rounded">Next</button>

    </div>

    <div v-if="result && result.components">
      <div v-for="edge in result.components.edges" :key="edge.node.id">
        <ComponentListRow :component="edge.node" />
      </div>

      <div class="flex justify-between items-center mt-4">
        <button
          :disabled="!result.components.pageInfo.startCursor"
          @click="prevPage"
          class="px-4 py-2 bg-gray-200 text-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {{ result.components.pageInfo.startCursor }} - {{ result.components.pageInfo.endCursor }}
        <button
          :disabled="!result.components.pageInfo.endCursor"
          @click="nextPage"
          class="px-4 py-2 bg-gray-200 text-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>



    </div>
    <div v-else-if="loading">Načítání...</div>
    <div v-else>Data nelze načíst</div>
  </div>
</template>

<script>
import { useQuery } from "@vue/apollo-composable";
import { gql } from "@apollo/client/core";

import ComponentListRow from "../../components/store/list/ComponentListRow.vue";
import { ref } from "vue";

export default {
  name: "StorePage",
  components: {
    ComponentListRow,
  },
  setup() {
    const afterCursor = ref(null);
    const beforeCursor = ref(null);
    const first = ref(10);
    const last = ref(null);
    const searchQuery = ref(null);

    const query = gql`
      query MyQuery($first: Int, $after: String, $before: String, $last: Int, $search: String) {
        components(first: $first, after: $after, before: $before, last: $last, search: $search) {
          edges {
            cursor
            node {
              id
              description
              createdAt
              internalPrice
              name
              sellingPrice
              unitType
              packets {
                id
                isTrackable
                description
                dateAdded
                createdAt
                location {
                  name
                  location
                }
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    `;

    const { result, loading, error, refetch } = useQuery(query, () => ({
      first: first.value,
      last: last.value,
      after: afterCursor.value,
      before: beforeCursor.value,
      search: searchQuery.value,
    }));

    const nextPage = () => {
      afterCursor.value = result.value?.components.pageInfo.endCursor;
      beforeCursor.value = null;
      first.value = 10;
      last.value = null;

      console.log(result.value?.components.pageInfo);
      refetch();
    };

    const prevPage = () => {
      beforeCursor.value = result.value?.components.pageInfo.startCursor;
      afterCursor.value = null;
      first.value = null;
      last.value = 10;

      console.log(result.value?.components.pageInfo);
      refetch();
    };

    const onSearch = () => {
      afterCursor.value = null;
      beforeCursor.value = null;
      first.value = 10;
      last.value = null;
      searchQuery.value = searchQuery.value;

      refetch();

      console.log(result.value?.components.pageInfo);
    };

    return {
      result,
      loading,
      error,
      nextPage,
      prevPage,
      onSearch,
      searchQuery,
    };
  },
};
</script>

<style scoped>
.store-page {
  padding: 20px;
}
</style>
