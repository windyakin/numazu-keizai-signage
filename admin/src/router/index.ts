import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useMediaStore } from '../stores/useMediaStore'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/playlists',
      name: 'playlists',
      component: () => import('../views/PlaylistsView.vue'),
    },
    {
      path: '/playlists/:id',
      name: 'playlist',
      component: () => import('../views/PlaylistView.vue'),
    },
    {
      path: '/media',
      name: 'media',
      component: () => import('../views/MediaView.vue'),
    },
    {
      path: '/articles',
      name: 'articles',
      component: () => import('../views/ArticlesView.vue'),
    },
    {
      path: '/weather',
      name: 'weather',
      component: () => import('../views/WeatherView.vue'),
    },
  ],
})

router.beforeEach((to, from) => {
  if (to.fullPath === from.fullPath) return
  const media = useMediaStore()
  if (media.uploading) return false
})

export default router
