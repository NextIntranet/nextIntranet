<template>
  <q-select
    v-if="!loading"
    v-model="selectedSupplier"
    :options="suppliers.map(supplier => ({
      label: `${supplier.name}`,
      value: supplier.id
    }))"
    :dense="dense"
    :outlined="outlined"
    :class="customClass"
    :style="customStyle"
    class="supplier-select"
    @input="$emit('update:modelValue', selectedSupplier)"
  />
  <q-spinner v-else class="text-primary" />
</template>

<script>
import { useQuery } from '@vue/apollo-composable';
import { GET_SUPPLIERS } from './../../apollo/queries';
import { computed, ref, watch } from 'vue';

export default {
  name: 'SupplierSelect',
  props: {
    modelValue: {
      type: String,
      default: null,
    },
    dense: {
      type: Boolean,
      default: true,
    },
    outlined: {
      type: Boolean,
      default: true,
    },
    customClass: {
      type: String,
      default: '',
    },
    customStyle: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const { result, loading, error } = useQuery(GET_SUPPLIERS);

    const suppliers = computed(() => result.value?.allSuppliers || []);
    const selectedSupplier = ref(props.modelValue);

    watch(
      () => props.modelValue,
      (newValue) => {
        selectedSupplier.value = newValue;
      }
    );

    return {
      suppliers,
      selectedSupplier,
      loading,
    };
  },
};
</script>

<style scoped>
.supplier-select {
  width: 100%;
}
</style>
