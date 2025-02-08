import { createHttpLink } from '@apollo/client/link/http/index.js'
import { InMemoryCache } from '@apollo/client/cache/index.js'
import { setContext } from '@apollo/client/link/context'
import { Cookies } from 'quasar'


export /* async */ function getClientOptions(
  /* {app, router, ...} */ options
) {
  console.log('Apollo getClientOptions called with:', options);

  const httpLink = createHttpLink({
    uri:
      process.env.GRAPHQL_URI ||
      'http://localhost:8080/api/v1/graphql/',
      credentials: "include",
  })

  const authLink = setContext((_, { headers }) => {
    // Get the authentication token from cookies
    const token = Cookies.get('token')
    console.log('Apollo getClientOptions token:', token);
    return {
      headers: {
        ...headers,
        authorization: token ? `JWT ${token}` : '',
      }
    }
  })


 // const link = ApolloLink.from([authLink, httpLink]);


  return Object.assign(
    // General options.
    {
      link: authLink.concat(httpLink),
      cache: new InMemoryCache(),
    },

    // Specific Quasar mode options.
    process.env.MODE === 'spa'
      ? {
          //
        }
      : {},
    process.env.MODE === 'ssr'
      ? {
          //
        }
      : {},
    process.env.MODE === 'pwa'
      ? {
          //
        }
      : {},
    process.env.MODE === 'bex'
      ? {
          //
        }
      : {},
    process.env.MODE === 'cordova'
      ? {
          //
        }
      : {},
    process.env.MODE === 'capacitor'
      ? {
          //
        }
      : {},
    process.env.MODE === 'electron'
      ? {
          //
        }
      : {},

    // dev/prod options.
    process.env.DEV
      ? {
          //
        }
      : {},
    process.env.PROD
      ? {
          //
        }
      : {},

    // For ssr mode, when on server.
    process.env.MODE === 'ssr' && process.env.SERVER
      ? {
          ssrMode: true,
        }
      : {},
    // For ssr mode, when on client.
    process.env.MODE === 'ssr' && process.env.CLIENT
      ? {
          ssrForceFetchDelay: 100,
        }
      : {}
  )

}
