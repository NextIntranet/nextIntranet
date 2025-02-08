import AppLogin from '../components/AppLogin.vue'
import AppLogout from '../components/AppLogout.vue'

import { gql } from '@apollo/client/core';
import { useMutation, useQuery, provideApolloClient } from '@vue/apollo-composable'



const GET_USER_QUERY = gql`
  query MyQuery {
    me {
      id
      username
      email
    }
  }
`


const requireAuth = async (to, from, next) => {
  console.log('requireAuth', to, from, next)

  const { result, loading, error } = useQuery(GET_USER_QUERY)

  // Wait for the query to complete
  while (loading.value) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  if (error.value || !result.value || !result.value.me) {
    console.log('error', error.value)
    next({ path: '/login' })
  } else {
    console.log('User is authenticated', result.value)
    next()
  }
}

const routes = [

  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') }
    ],
    beforeEnter: requireAuth
  },

  {
    path: '/login',
    component: AppLogin
  },
  {
    path: '/logout',
    component: AppLogout
  },

  {
    path: '/store',
    component: () => import('layouts/MainLayout.vue'),
    beforeEnter: requireAuth,
    children: [
      { path: '', component: () => import('pages/store/StorePage.vue')},
      { path: 'component/:uuid/', component: () => import('pages/store/ComponentPage.vue')},
    ]
  },

  {
    path: '/purchase',
    component: () => import('layouts/MainLayout.vue'),
    beforeEnter: requireAuth,
    children: [
      { path: '', component: () => import('pages/purchase/PurchaseList.vue') },
      { path: ':uuid/', component: () => import('pages/purchase/PurchasePage.vue') }
    ]
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
