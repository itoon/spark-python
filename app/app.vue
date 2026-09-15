<script setup lang="ts">
useHead({
  titleTemplate: (title) => title ? `${title} · CodeVenture` : 'CodeVenture Python Lab',
  meta: [
    { name: 'description', content: 'Learn Python by seeing how your code works.' },
    { name: 'theme-color', content: '#071b3b' },
  ],
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
</template>
