import { defineStore } from 'pinia'
import { useApolloClient } from '@vue/apollo-composable'
import checkTokenQuery from 'src/graphql/checkToken.gql'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: null
  }),

  getters: {
    isAuthenticated(state) {
      return !!state.token
    }
  },

  actions: {
    async checkToken() {
      if (!this.token) return false

      try {
        const client = useApolloClient()
        const { data } = await client.query({
          query: checkTokenQuery,
          variables: { token: this.token }
        })

        if (data.validToken) {
          this.user = data.user
          return true
        } else {
          this.logout()
          return false
        }
      } catch (error) {
        console.error('Token validation failed', error)
        this.logout()
        return false
      }
    },

    login(token, user) {
      this.token = token
      this.user = user
      localStorage.setItem('token', token)
    },

    logout() {
      this.token = null
      this.user = null
      localStorage.removeItem('token')
    }
  }
})
