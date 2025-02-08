<template>
  <div class="bg-white shadow-md rounded-lg p-6 mb-6">
    <!-- Hlavička s počtem dokumentů a tlačítkem pro přidání -->
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-lg font-bold text-gray-700">
        Documents <span class="text-gray-400">({{ localDocuments.length }})</span>
      </h4>
      <q-btn flat class="text-gray-400 hover:text-gray-700 text-xs" @click="addDocument">
        <q-icon name="add" size="12px" class="mr-1" />
        Add document
      </q-btn>
    </div>

    <!-- Tabulka s dokumenty -->
    <table class="w-full text-sm text-left border-collapse">
      <thead>
        <tr class="text-gray-600">
          <th class="px-4 py-2">Name</th>
          <th class="px-4 py-2">Type</th>
          <th class="px-4 py-2">Link</th>
          <th class="px-4 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(document, index) in localDocuments"
          :key="document.id || index"
          class="text-gray-800"
        >
          <!-- Název dokumentu -->
          <td class="px-4 py-2">
            <div v-if="document.isEditing">
              <q-input dense v-model="document.name" placeholder="Enter name" />
            </div>
            <div v-else>
              {{ document.name }}
            </div>
          </td>

          <!-- Typ dokumentu -->
          <td class="px-4 py-2">
            <div v-if="document.isEditing">
              <q-select
                dense
                v-model="document.docType"
                :options="[
                  { label: 'Datasheet', value: 'datasheet' },
                  { label: 'Manual', value: 'manual' },
                  { label: 'Specification', value: 'specification' },
                  { label: 'Application Note', value: 'application_note' },
                  { label: 'Drawing', value: 'drawing' },
                  { label: 'Certificate', value: 'certificate' },
                  { label: 'Image', value: 'image' },
                  { label: 'Other', value: 'other' },
                  { label: 'Undefined', value: 'undefined' }
                ]"
                placeholder="Select type"
              />
            </div>
            <div v-else>
              {{ document.docType }}
            </div>
          </td>

          <!-- Odkaz na dokument (http link) -->
          <td class="px-4 py-2">
            <div v-if="document.isEditing">
              <q-input
                dense
                type="url"
                v-model="document.url"
                placeholder="Enter http link"
              />
            </div>
            <div v-else>
              <a
                :href="document.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:underline"
              >
                {{ document.url.length > 30 ? document.url.substring(0, 30) + '...' : document.url }}
              </a>
            </div>
          </td>

          <!-- Akce: edit / save, cancel -->
          <td class="px-4 py-2">
            <div v-if="document.isEditing">
                <q-icon size="12px" name="save" color="green" @click="saveDocument(index)">
                  <q-tooltip anchor="bottom middle" self="top middle">
                  Save
                  </q-tooltip>
                </q-icon>
                <q-icon size="12px" name="cancel" color="orange" @click="cancelEdit(index)" class="q-ml-sm">
                  <q-tooltip anchor="bottom middle" self="top middle">
                  Cancel
                  </q-tooltip>
                </q-icon>
                <q-icon size="12px" name="delete" color="red" @click="deleteEdit(index)" class="q-ml-sm">
                  <q-tooltip anchor="bottom middle" self="top middle">
                  Delete
                  </q-tooltip>
                </q-icon>
            </div>
            <div v-else>
                <q-icon name="edit" size="12px" class="text-gray-400 cursor-pointer" @click="editDocument(index)" />
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
import { useMutation } from '@vue/apollo-composable'
import { QBtn, QIcon, QInput, QSelect } from 'quasar'

// Definice props – očekáváme pole dokumentů
const props = defineProps({
  documents: {
    type: Array,
    default: () => []
  },
  component_id: {
    type: String,
    default: ''
  }
})

// Lokální kopie dokumentů s vlastností pro režim editace
const localDocuments = ref([])

// Inicializace lokálních dokumentů s jednotnými názvy vlastností:
// - Používáme `docType` pro typ dokumentu (buď z původního `docType` či `type`)
// - Používáme `url` pro odkaz (buď z původního `url` či `link`)
onMounted(() => {
  localDocuments.value = props.documents.map(doc => ({
    ...doc,
    isEditing: false,
    docType: doc.docType || doc.type || 'PDF',
    url: doc.url || doc.link || ''
  }))
})

// Definice GraphQL mutací
const CREATE_DOCUMENT_MUTATION = gql`
  mutation CreateDocument($name: String!, $docType: String!, $url: String!, $componentId: UUID!) {
    createDocument(
        name: $name,
        docType: $docType,
        url: $url,
        componentId: $componentId
    ) {
      document {
        createdAt
        docType
        name
        id
        file
        url
      }
    }
  }
`

const UPDATE_DOCUMENT_MUTATION = gql`
  mutation UpdateDocument($id: UUID!, $name: String!, $docType: String!, $url: String!) {
    updateDocument(id: $id, name: $name, docType: $docType, url: $url) {
      document {
        id
        name
        docType
        url
      }
    }
  }
`

const DELETE_DOCUMENT_MUTATION = gql`
  mutation DeleteDocument($id: UUID!) {
    deleteDocument(id: $id) {
      document {
        name
      }
    }
  }
`

const { mutate: createDocumentMutate } = useMutation(CREATE_DOCUMENT_MUTATION)
const { mutate: updateDocumentMutate } = useMutation(UPDATE_DOCUMENT_MUTATION)
const { mutate: deleteDocumentMutate } = useMutation(DELETE_DOCUMENT_MUTATION)

const addDocument = () => {
  localDocuments.value.push({
    name: '',
    docType: 'PDF',
    url: '',
    isEditing: true
  })
}

// Při kliknutí na tlačítko Edit uložíme zálohu aktuálního stavu dokumentu a přepneme editaci
const editDocument = (index) => {
  const doc = localDocuments.value[index]
  // Uložíme záložní kopii (pro případ, že bude potřeba obnovit původní data)
  doc.backup = { ...doc }
  doc.isEditing = true
}

// Tlačítko Cancel obnoví původní data ze zálohy a ukončí režim editace
const cancelEdit = (index) => {
  const doc = localDocuments.value[index]
  if (doc.backup) {
    // Obnovíme všechny vlastnosti z uložené zálohy
    Object.assign(doc, doc.backup)
    doc.isEditing = false
    delete doc.backup
  } else {
    doc.isEditing = false
  }
}

// Tlačítko Delete odstraní dokument z lokálního pole
const deleteEdit = async (index) => {
  try {
    const result = await deleteDocumentMutate({
      id: localDocuments.value[index].id
    })
    if (result.data && result.data ) {
      localDocuments.value.splice(index, 1)
    }
  } catch (error) {
    console.error('Error deleting document:', error)
  }
}

// Uloží dokument – pokud dokument již existuje (má `id`), provede se aktualizace,
// jinak se provede mutace pro vytvoření nového dokumentu
const saveDocument = async (index) => {
  const doc = localDocuments.value[index]
  if (doc.id) {
    // Aktualizace existujícího dokumentu
    try {
      await updateDocumentMutate({
        id: doc.id,
        name: doc.name,
        docType: doc.docType,
        url: doc.url
      })
      doc.isEditing = false
      delete doc.backup
    } catch (error) {
      console.error('Error updating document:', error)
    }
  } else {
    // Vytvoření nového dokumentu
    try {
      const result = await createDocumentMutate({
        name: doc.name,
        docType: doc.docType.value,
        url: doc.url,
        componentId: props.component_id
      })
      if (
        result.data &&
        result.data.createDocument &&
        result.data.createDocument.document
      ) {
        doc.id = result.data.createDocument.document.id
      }
      doc.isEditing = false
      delete doc.backup
    } catch (error) {
      console.error('Error creating document:', error)
    }
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
