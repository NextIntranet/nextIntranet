<template>
  <div class="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 mb-6">
    <div class="bg-white p-6 pb-2 relative">

      <div class="flex">
        <!-- Obrázek -->
        <img
          :src="component?.primary_image?.get_url || 'https://placehold.co/300x300.png'"
          class="rounded-md shadow-sm w-1/3 object-cover skeleton"
        />
        <!-- Informace -->
        <div class="pl-6">
          <div class="flex justify-between items-center">
        <h2 v-if="!isEditing" class="text-2xl font-semibold text-gray-700 mb-2 flex items-center">
          {{ component?.name }}
          <span class="material-icons text-sm text-gray-400 hover:text-gray-700 cursor-pointer ml-2" @click="isEditing = true">edit</span>
        </h2>
        <q-input
          v-else
          v-model="EditName"
          class="text-2xl font-semibold text-gray-700 mb-2 flex-grow"
          dense
          autofocus
        />
        <div v-if="isEditing" class="flex space-x-2 ml-2">
          <button @click="saveComponentInfo" class="text-gray-400 hover:text-gray-700">
        <span class="material-icons">save</span>
          </button>
          <button @click="isEditing = false" class="text-gray-400 hover:text-gray-700">
        <span class="material-icons">cancel</span>
          </button>
        </div>
      </div>

          <div class="text-xs text-gray-400 flex items-center">
        <button
          @click="copyToClipboard(component?.id)"
          class="text-gray-300 hover:text-gray-700 mr-1"
          title="Zkopírovat UUID"
        >
          <span class="material-icons text-sm">content_copy</span>
        </button>
        {{ component?.id }}
          </div>
          <!-- Kategorie -->
          <div class="text-gray-600 text-sm font-semibold mb-2">Kategorie</div>
          <div class="flex items-center mb-2">
            <span v-if="!isEditing" class="bg-blue-100 text-blue-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-md flex items-center">
              <img :src="`http://t/icons/${component?.category?.icon.toLowerCase()}.svg`" class="h-4 w-4 inline-block mr-1" />
              {{ component?.category?.name }}
            </span>
            <div v-else>
              <q-select
                use-input
                clearable
                v-model="EditCategory"
                label="Categories"
                :options="EditCategoryOptions"
                @filter="CategoryfilterFn"
                style="width: 250px"
              >
                <template v-slot:no-option>
                  <q-item>
                    <q-item-section class="text-grey">
                      No results
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            </div>
          <!-- Tagy -->
          <div class="text-gray-600 text-sm font-semibold mb-2">Tagy</div>
          <div class="flex flex-wrap gap-1">
            <div v-if="!isEditing">
        <span
          v-for="tag in component?.tags"
          :key="tag"
          class="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full shadow-sm"
        >
          {{ tag }}
        </span>
        </div>

        <div v-else>
              <q-select
                filled
                v-model="model"
                use-chips
                label="Tags"
                :options="EditTagsOptions"
                @filter="TagsfilterFn"
                @filter-abort="abortFilterFn"
                style="width: 250px"
              >
                <template v-slot:no-option>
                  <q-item>
                    <q-item-section class="text-grey">
                      No results
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

          </div>
        </div>
      </div>
      <div v-if="!isEditing" class="bg-gray-200 p-4 py-2 mt-4 mb-2 rounded-md">
        <div v-html="component?.description"></div>
      </div>
    <q-editor
      class="py-2 my-4"
      v-else
      v-model="EditDescription"
      :definitions="{
        bold: {label: 'Bold', icon: null, tip: 'My bold tooltip'}
      }"
    />
        </div>
      </div>
    </template>

    <script setup>
    import { QPopupEdit, QInput, QEditor } from 'quasar';
    import { ref, watch } from "vue";
    import { useMutation } from "@vue/apollo-composable";
    import { gql } from "@apollo/client/core";

    const props = defineProps({
      item_id: {
        type: String,
        required: false,
      },
      component: {
        type: Object,
        required: false,
      },
    });

    // GraphQL mutace
    const UPDATE_COMPONENT = gql`
      mutation updateComponent($id: UUID!, $name: String!, $description: String, $categoryId: UUID) {
        updateComponent(id: $id, name: $name, description: $description, categoryId: $categoryId) {
          component {
            id
            name
            description
            category {
              abbreviation
              id
              name
            }
          }
        }
      }
    `;

    // Inicializace useMutation
    const { mutate: updateComponent } = useMutation(UPDATE_COMPONENT);

    const EditName = ref(props.component?.name || "");
    const EditDescription = ref(props.component?.description || "");
    const EditCategory = ref(props.component?.category?.name || null);
    const EditCategoryOptions = ref(props.component?.category || []);
    const originalCategoryOptions = ref([]);
    const EditTags = ref(props.component?.tags || []);
    const EditTagsOptions = ref(props.component?.tags || []);
    const isEditing = ref(false);


    // Sledujeme změny v props.component.name
    watch(
      isEditing,
      (newValue) => {
        console.log(`isEditing changed to: ${newValue}`
      );
    });

    watch(
      () => props.component?.name,
      (newValue) => {
        EditName.value = newValue;
      }
    );

    watch(
      () => props.component?.description,
      (newValue) => {
        EditDescription.value = newValue;
      }
    );


    const saveComponentInfo = async () => {
      console.log("saveComponentInfo called"); // Debug log
      console.log("Saving component info:", EditName.value, EditDescription.value);

      try {
        const response = await updateComponent({
          id: props.component.id,
          name: EditName.value,
          description: EditDescription.value,
          categoryId: EditCategory.value.value,
        });
        console.log("Component updated successfully:", response);
        props.component.category = {
          id: EditCategory.value.value,
          name: EditCategory.value.label.split(" (")[0],
          icon: props.component.category?.icon
        };
      } catch (error) {
        console.error("Error updating component info:", error);
      }

      isEditing.value = false;
    };

    import { useQuery } from "@vue/apollo-composable";

    const GET_CATEGORIES = gql`
      query GetCategories {
        allCategories {
            edges {
              node {
                  color
                  description
                  icon
                  name
                  id
                }
              }
            }
        }
    `;

    const { result: categoriesResult, loading: categoriesLoading, error: categoriesError } = useQuery(GET_CATEGORIES);
    watch(
      categoriesResult,
      (newValue) => {
        if (newValue && newValue.allCategories) {
          console.log("Categories loaded:", newValue.allCategories.edges);
          EditCategoryOptions.value = newValue.allCategories.edges.map(category => ({
            label: category.node.name + " (" + category.node.description + ")",
            value: category.node.id,
          }));
          originalCategoryOptions.value = EditCategoryOptions.value;
        }
      },
      { immediate: true }
    );

    watch(
      () => props.component?.category,
      (newValue) => {
        EditCategory.value = newValue?.name || null;
      }
    );

    const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text);
    };

    const CategoryfilterFn = (val, update, abort) => {
      if (val === "") {
        update(() => {
          EditCategoryOptions.value = [...originalCategoryOptions.value]
        });
        return;
      }
      update(() => {
        const needle = val.toLowerCase();
        EditCategoryOptions.value = originalCategoryOptions.value.filter(option =>
          option.label.toLowerCase().includes(needle)
        );
      });

    }

    const TagsfilterFn = (val, update) => {
      update(() => {});
    };

    const abortFilterFn = () => {};

    defineExpose({
      EditName,
      EditDescription,
      copyToClipboard,

    });

    </script>

    <style>
    /* Add your styles here */
    </style>
