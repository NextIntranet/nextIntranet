<template>
  <q-page class="flex flex-center">
  <div class="welcome-message"></div>
  <div class="text-center">
    <h1>Vítejte v OpenIntranetu!</h1>
    <p>Jsme rádi, že jste tady. Prozkoumejte naše funkce a užijte si svůj čas.</p>

    {{ result }}
    {{ error }}
    {{ loading }}
  </div>

  </q-page>
</template>

<script>
import { gql } from '@apollo/client/core';
import { useQuery } from '@vue/apollo-composable';


export default {
  name: 'IndexPage',

  setup(){
    const GET_WELCOME_MESSAGE = gql`
      query MyQuery {
        me {
          username
          email
          firstName
          id
          isActive
          isStaff
          isSuperuser
          lastLogin
          lastName
          password
          dateJoined
        }
      }
    `;

    const { result, loading, error } = useQuery(GET_WELCOME_MESSAGE);
    return { result, loading, error };
  },
};

</script>

