<template>
  <div class="flex flex-col items-center justify-center h-screen bg-gray-100">
    <!-- Container -->
    <div class="flex w-full max-w-4xl bg-white shadow-lg rounded-lg overflow-hidden">
      <!-- Left Section -->
      <div class="w-1/2 p-8 bg-gray-50 flex flex-col justify-center">
        <h1 class="text-3xl font-bold text-gray-800 mb-4 text-center">
          NextIntranet
        </h1>

        <!-- Logout Button -->
        <button @click="logout" class="bg-red-500 text-white px-4 py-2 rounded">
          Logout
        </button>

        <!-- Error Message Area -->
        <div v-if="errorMessage" class="mt-4 bg-red-100 text-red-800 p-4 rounded">
          {{ errorMessage }}
        </div>
      </div>

      <!-- Right Section -->
      <div class="w-1/2 p-8 bg-blue-500 text-white flex flex-col justify-between">
        <!-- Instance Identification -->
        <div>
          <h2 class="text-3xl font-bold mb-4">Goodbye from <b>NextIntranet</b></h2>
          <p>This instance belongs to:</p>
          <h3 class="text-xl font-semibold mt-2">{{ companyName }}</h3>
        </div>

        <!-- Informational Text -->
        <div>
          <p class="text-sm">
            We hope to see you again soon!
          </p>
        </div>
      </div>
    </div>

    <!-- Links Section -->
    <div class="mt-6 flex space-x-4">
      <a href="https://github.com" target="_blank" class="text-blue-500 hover:underline">
        GitHub
      </a>
      <a href="https://nextintranet.com" target="_blank" class="text-blue-500 hover:underline">
        NextIntranet
      </a>
    </div>
  </div>
</template>

<script>
  import { useMutation, useQuery, provideApolloClient } from '@vue/apollo-composable'
  import gql from 'graphql-tag'
  import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client/core'
  // import vue from 'eslint-plugin-vue'
  import { Cookies } from 'quasar'

  export default {
    name: 'AppLogin',
    data () {
      return {
        username: '',
        password: ''
      }
    },
    methods: {
      logout () {
      console.log('Logging out');

      // Clear user data
      Cookies.remove('token');
      Cookies.remove('tokenRefresh');

      // Redirect to login page
      this.$router.push('/login');
      }
    }
    }
  </script>
