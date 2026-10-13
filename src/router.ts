import { createRouter, createWebHistory } from 'vue-router'
import GalleryPage from './pages/GalleryPage.vue'
import { watch } from 'vue'
import { adminSession } from './lib/adminSession'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('./pages/AdminLogin.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('./pages/AdminPage.vue'),
      meta: { requiresAdmin: true },
    },
    { path: '/', name: 'gallery', component: GalleryPage },
    { path: '/photos/:id', name: 'photo', component: GalleryPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAdmin && !adminSession.authenticated.value)
    return { name: 'admin-login' }
  if (to.name === 'admin-login' && adminSession.authenticated.value)
    return { name: 'admin' }
})
watch(adminSession.authenticated, (authenticated) => {
  if (!authenticated && router.currentRoute.value.meta.requiresAdmin)
    void router.replace({ name: 'admin-login' })
})
