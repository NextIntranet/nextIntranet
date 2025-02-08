<template>
  <div class="bg-white shadow-md rounded-lg p-6 mb-6">
    <!-- Hlavička s počtem parametrů a tlačítkem pro přidání -->
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-lg font-bold text-gray-700">
        Parameters <span class="text-gray-400">({{ localParameters.length }})</span>
      </h4>
      <q-btn flat class="text-gray-400 hover:text-gray-700 text-xs" @click="addParameter">
        <q-icon name="add" size="12px" class="mr-1" />
        Add Parameter
      </q-btn>
    </div>

    <!-- Tabulka s parametry -->
    <table class="w-full text-sm text-left border-collapse">
      <thead>
        <tr class="text-gray-600">
          <th class="px-4 py-2">Parameter Type</th>
          <th class="px-4 py-2">Value</th>
          <th class="px-4 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(param, index) in localParameters"
          :key="param.id || index"
          class="text-gray-800"
        >
          <!-- Sloupec s názvem typu parametru -->
          <td class="px-4 py-2">
            <div v-if="!param.isEditing">
              {{ param.parameterType.name }} ({{ param.parameterType.description }})
            </div>
            <div v-else>
              <q-select
                v-model="param.parameterTypeId"
                :options="parameterOptions"
                label="Select parameter"
                use-input
                input-debounce="300"
                option-value="id"
                option-label="formattedLabel"
                dense
                emit-value
                map-options
              />
            </div>
          </td>

          <!-- Sloupec s hodnotou -->
          <td class="px-4 py-2">
            <div v-if="param.isEditing">
              <q-input dense v-model="param.value" placeholder="Enter value" />
            </div>
            <div v-else>
              {{ param.value }}<span v-if="param.unit"> {{ param.unit }}</span>
            </div>
          </td>

          <!-- Sloupec s akcemi -->
          <td class="px-4 py-2">
            <div v-if="param.isEditing">
              <q-icon size="12px" name="save" color="green" @click="saveParameter(index)">
                <q-tooltip anchor="bottom middle" self="top middle">
                  Save
                </q-tooltip>
              </q-icon>
              <q-icon size="12px" name="cancel" color="orange" @click="cancelEdit(index)" class="q-ml-sm">
                <q-tooltip anchor="bottom middle" self="top middle">
                  Cancel
                </q-tooltip>
              </q-icon>
              <q-icon size="12px" name="delete" color="red" @click="deleteParameter(index)" class="q-ml-sm">
                <q-tooltip anchor="bottom middle" self="top middle">
                  Delete
                </q-tooltip>
              </q-icon>
            </div>
            <div v-else>
              <q-icon name="edit" size="12px" class="text-gray-400 cursor-pointer" @click="editParameter(index)">
                <q-tooltip anchor="bottom middle" self="top middle">
                  Edit
                </q-tooltip>
              </q-icon>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { gql } from '@apollo/client/core'
import { useApolloClient } from '@vue/apollo-composable'
import { QBtn, QIcon, QInput, QSelect } from 'quasar'

// GraphQL dotaz pro načtení seznamu parametrů
const GET_PARAMETERS_QUERY = gql`
  query GetParameters {
    allParameters {
      id
      description
      name
    }
  }
`

// GraphQL mutace pro vytvoření, aktualizaci a smazání parametrů
const CREATE_COMPONENT_PARAMETER_MUTATION = gql`
  mutation CreateComponentParameter($componentId: UUID!, $parameterTypeId: UUID!, $value: String!) {
    createComponentParameter(componentId: $componentId, ParameterTypeId: $parameterTypeId, value: $value) {
      componentParameter {
        id
        value
        parameterType {
          id
          description
          name
        }
      }
    }
  }
`

const UPDATE_COMPONENT_PARAMETER_MUTATION = gql`
  mutation UpdateComponentParameter($id: UUID!, $value: String!) {
    updateComponentParameter(id: $id, value: $value) {
      componentParameter {
        id
        value
        parameterType {
          id
          name
          description
        }
      }
    }
  }
`

const DELETE_COMPONENT_PARAMETER_MUTATION = gql`
  mutation DeleteComponentParameter($id: UUID!) {
    deleteComponentParameter(id: $id) {
      componentParameter {
        id
      }
    }
  }
`

// Definice props
const props = defineProps({
  parameters: {
    type: Array,
    required: true,
  },
  component_id: {
    type: String,
    default: '',
  },
})

// Lokální kopie parametrů a možnosti pro výběr
const localParameters = ref([])
const parameterOptions = ref([])

// Apollo Client instance
const apolloClient = useApolloClient().client

// Funkce pro načtení parametrů z GraphQL API
const loadParameters = async () => {
  try {
    const { data } = await apolloClient.query({
      query: GET_PARAMETERS_QUERY,
    })

    parameterOptions.value = data.allParameters.map(param => ({
      ...param,
      formattedLabel: `${param.name} (${param.description})`,
    }))
  } catch (error) {
    console.error('Error fetching parameters:', error)
  }
}

// Funkce pro vytvoření nového parametru
const createParameter = async (componentId, parameterTypeId, value) => {
  try {
    const { data } = await apolloClient.mutate({
      mutation: CREATE_COMPONENT_PARAMETER_MUTATION,
      variables: {
        componentId,
        parameterTypeId,
        value,
      },
    })
    return data.createComponentParameter.componentParameter
  } catch (error) {
    console.error('Error creating parameter:', error)
  }
}

// Funkce pro aktualizaci parametru
const updateParameter = async (index, value) => {
  try {
    id = localParameters.value[index].id
    const { data } = await apolloClient.mutate({
      mutation: UPDATE_COMPONENT_PARAMETER_MUTATION,
      variables: {
        id,
        value,
      },
    })
    return data.updateComponentParameter.componentParameter
  } catch (error) {
    console.error('Error updating parameter:', error)
  }
}

// Funkce pro smazání parametru
const deleteParameter = async (index) => {
  try {
    const id = localParameters.value[index].id
    await apolloClient.mutate({
      mutation: DELETE_COMPONENT_PARAMETER_MUTATION,
      variables: {
        id,
      },
    })

    localParameters.value.splice(index, 1)

  } catch (error) {
    console.error('Error deleting parameter:', error)
  }
}

// Inicializace při mountu
onMounted(() => {
  localParameters.value = props.parameters.map(param => ({
    ...param,
    parameterTypeId: param.parameterType?.id || '',
    isEditing: false,
  }))
  loadParameters()
})

// Přidání nového parametru
const addParameter = () => {
  localParameters.value.push({
    parameterTypeId: '',
    value: '',
    unit: '',
    isEditing: true,
  })
}

// Editace parametru
const editParameter = (index) => {
  const param = localParameters.value[index]
  param.backup = { ...param }
  param.isEditing = true
}

// Zrušení úprav
const cancelEdit = (index) => {
  const param = localParameters.value[index]
  if (param.backup) {
    Object.assign(param, param.backup)
    param.isEditing = false
    delete param.backup
  } else {
    param.isEditing = false
  }
}

// Uložení parametru
const saveParameter = async (index) => {
  const param = localParameters.value[index]

  try {
    let savedParam
    if (param.id) {
      // Aktualizace existujícího parametru
      savedParam = await updateParameter(param.id, param.value)
    } else {
      // Vytvoření nového parametru
      savedParam = await createParameter(props.component_id, param.parameterTypeId, param.value)
      param.id = savedParam.id
    }

    param.isEditing = false
    param.parameterType = savedParam.parameterType
  } catch (error) {
    console.error('Error saving parameter:', error)
  }
}

</script>

<style scoped>
.table-auto {
  table-layout: auto;
}
th,
td {
  padding: 0.5rem;
  text-align: left;
}
th {
  border-bottom: 2px solid #e5e7eb;
}
td {
  border-bottom: 1px solid #e5e7eb;
}
</style>
