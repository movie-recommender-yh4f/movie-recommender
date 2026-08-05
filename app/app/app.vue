<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <PwaInstallModal />
    <PwaUpdateNotice />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
const { initialize } = useAuth()

onMounted(() => {
  initialize()
})
</script>
