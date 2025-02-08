<template>
  <div class="flex flex-col items-center justify-center h-screen bg-gray-100">
    <!-- Container -->
    <div class="flex w-full max-w-4xl bg-white shadow-lg rounded-lg overflow-hidden">
      <!-- Left Section -->
      <div class="w-1/2 p-8 bg-gray-50 flex flex-col justify-center">
        <h1 class="text-3xl font-bold text-gray-800 mb-4 text-center">
          NextIntranet
        </h1>

        <!-- Error Message Area -->
        <div v-if="errorMessage" class="mb-4 bg-red-100 text-red-800 p-4 rounded">
          {{ errorMessage }}
        </div>

        <!-- Login Form -->
        <q-form @submit.prevent="confirm" class="space-y-4">
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <q-input
              v-model="username"
              id="username"
              name="username"
              type="text"
              placeholder="Username"
              outlined
              class="w-full"
              required
            />
          </div>
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <q-input
              v-model="password"
              id="password"
              name="password"
              type="password"
              placeholder="Password"
              outlined
              class="w-full"
              required
            />
          </div>
          <q-btn
            type="submit"
            label="Submit"
            color="primary"
            class="w-full"
          />
        </q-form>
      </div>

      <!-- Right Section -->
      <div class="w-1/2 p-8 bg-blue-500 text-white flex flex-col justify-between">
        <!-- Instance Identification -->
        <div>
          <h2 class="text-3xl font-bold mb-4">Welcome to <b>NextIntranet</b></h2>
          <p>This instance belongs to:</p>
          <h3 class="text-xl font-semibold mt-2">{{ companyName }}</h3>
        </div>

        <!-- Informational Text -->
        <div>
          <p class="text-sm">
            NextIntranet is a platform designed to improve collaboration and communication within your organization.
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
      confirm () {
        console.log('confirm');

        const client = new ApolloClient({
          link: new HttpLink({ uri: 'http://localhost:8080/api/v1/graphql/' }),
          cache: new InMemoryCache()
        });

        provideApolloClient(client);

        const LOGIN_MUTATION = gql`
          mutation LoginMutation($username: String!, $password: String!) {
            tokenAuth(username: $username, password: $password) {
                token
                refreshExpiresIn
                payload
            }
          }
        `;

        const { mutate: login } = useMutation(LOGIN_MUTATION);

        login({ username: this.username, password: this.password })
          .then(response => {
            console.log(response)
            this.saveUserData('', response.data.tokenAuth.token, null);
            this.$router.push('/');
          })
          .catch(error => {
            console.error('Error logging in:', error);
          });
      },
      saveUserData (id, token, tokenRefresh) {
        // localStorage.setItem(GC_USER_ID, id)
        // localStorage.setItem(GC_AUTH_TOKEN, token)
        // localStorage.setItem(GC_TOKEN_REFRESH, tokenRefresh)

        Cookies.set(
            'token',
            token,
          )
        Cookies.set(
            'tokenRefresh',
            tokenRefresh,
          )

      },
      loadUserInfo () {

        const ME_QUERY = gql`
          query Me {
            me {
              email
              firstName
              lastLogin
              dateJoined
              id
              isActive
              isStaff
              isSuperuser
              lastName
              password
              username
            }
          }
        `;

        const { result, loading, error } = useQuery(ME_QUERY);

        if (loading.value) {
          console.log('Loading user info...');
        } else if (error.value) {
          console.error('Error loading user info:', error.value);
        } else {
          console.log('User info:', result.value.me);
        }

      }
    }
  }
</script>
