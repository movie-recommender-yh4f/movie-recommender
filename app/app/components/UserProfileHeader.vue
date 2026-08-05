<template>
  <section class="w-full max-w-3xl pt-8">
    <div class="mb-8 flex flex-col items-center text-center">
      <div
        class="mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-zinc-300 bg-white text-4xl font-black uppercase tracking-[-0.08em] text-zinc-950 shadow-lg dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:shadow-glow"
      >
        {{ profileInitial }}
      </div>

      <div class="w-full max-w-sm">
        <div v-if="isEditingName" class="flex items-center gap-2">
          <input
            v-model="newName"
            type="text"
            :maxlength="MAX_NAME_LENGTH"
            class="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-center text-lg font-bold text-zinc-950 outline-none transition-colors focus:border-zinc-950 dark:border-zinc-700 dark:bg-black dark:text-white dark:focus:border-white"
            placeholder="Enter new name..."
            @keyup.enter="saveName"
          />
          <button
            :disabled="isSavingName"
            class="btn-press rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            @click="saveName"
          >
            Save
          </button>
          <button
            class="btn-press rounded-full border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-white dark:hover:text-white"
            @click="cancelEdit"
          >
            Cancel
          </button>
        </div>

        <template v-else>
          <h1 class="truncate text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
            {{ displayName }}
          </h1>
          <p class="mt-1 text-sm font-medium text-zinc-500">{{ user?.email }}</p>
        </template>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <button
        class="group flex min-h-14 items-center justify-between rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/80 dark:hover:border-white"
        @click="startEditing"
      >
        <span class="flex items-center gap-3">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors group-hover:border-zinc-950 group-hover:text-zinc-950 dark:border-zinc-800 dark:group-hover:border-white dark:group-hover:text-white"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.75"
                d="M15.232 5.232l3.536 3.536M4 20h3.5L19.768 7.732a2.5 2.5 0 00-3.536-3.536L4 16.464V20z"
              />
            </svg>
          </span>
          <span class="font-semibold text-zinc-950 dark:text-white">Edit Username</span>
        </span>
        <span
          class="text-zinc-400 transition-colors group-hover:text-zinc-950 dark:text-zinc-600 dark:group-hover:text-white"
          >&rarr;</span
        >
      </button>

      <button
        class="group flex min-h-14 items-center justify-between rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/80 dark:hover:border-white"
        @click="openPasswordModal"
      >
        <span class="flex items-center gap-3">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors group-hover:border-zinc-950 group-hover:text-zinc-950 dark:border-zinc-800 dark:group-hover:border-white dark:group-hover:text-white"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.75"
                d="M12 3l7 3v5c0 4.5-2.8 8.5-7 10-4.2-1.5-7-5.5-7-10V6l7-3z"
              />
            </svg>
          </span>
          <span class="font-semibold text-zinc-950 dark:text-white">Change Password</span>
        </span>
        <span
          class="text-zinc-400 transition-colors group-hover:text-zinc-950 dark:text-zinc-600 dark:group-hover:text-white"
          >&rarr;</span
        >
      </button>
    </div>

    <section
      class="mb-8 rounded-[1.25rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-glow"
    >
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
            Recommendation Limit
          </h2>
          <p class="mt-1 text-sm text-zinc-500">See how much quota you have left.</p>
        </div>
        <div class="text-right">
          <p class="text-xl font-black text-zinc-950 dark:text-white">
            {{ quota.remaining }} / {{ RECOMMENDATION_LIMIT }}
          </p>
          <p class="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Requests left
          </p>
        </div>
      </div>

      <div class="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          class="h-full rounded-full bg-zinc-950 transition-[width] duration-500 dark:bg-white dark:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
          :style="{ width: quotaProgressWidth }"
        />
      </div>

      <div class="mt-4 flex items-center justify-between gap-3 text-sm">
        <p class="text-zinc-500">
          <span v-if="quotaError">{{ quotaError }}</span>
          <span v-else>{{ quotaUsedPercent }}% of daily quota used</span>
        </p>
        <button
          class="font-bold text-zinc-950 transition-colors hover:text-zinc-600 disabled:opacity-50 dark:text-white dark:hover:text-zinc-300"
          :disabled="quotaPending"
          @click="fetchQuota"
        >
          {{ quotaPending ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-zinc-500">
        More Settings
      </h2>

      <div
        class="overflow-hidden rounded-[1.25rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80"
      >
        <div
          class="flex min-h-14 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <span class="flex items-center gap-3">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 dark:border-zinc-800"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M12 8a4 4 0 100 8 4 4 0 000-8z"
                />
              </svg>
            </span>
            <span class="font-semibold text-zinc-950 dark:text-white">Appearance</span>
          </span>

          <span
            class="flex rounded-full border border-zinc-200 bg-zinc-100 p-1 text-xs font-bold dark:border-zinc-700 dark:bg-black"
          >
            <button
              class="rounded-full px-3 py-1 transition-colors"
              :class="isDarkMode ? activeThemeClass : inactiveThemeClass"
              @click="setTheme(darkThemeValue)"
            >
              Dark
            </button>
            <button
              class="rounded-full px-3 py-1 transition-colors"
              :class="!isDarkMode ? activeThemeClass : inactiveThemeClass"
              @click="setTheme(lightThemeValue)"
            >
              Light
            </button>
          </span>
        </div>

        <button
          v-if="showInstallOption"
          class="group flex min-h-14 w-full items-center justify-between border-b border-zinc-200 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
          @click="openInstallModal"
        >
          <span class="flex items-center gap-3">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors group-hover:border-zinc-950 group-hover:text-zinc-950 dark:border-zinc-800 dark:group-hover:border-white dark:group-hover:text-white"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                />
              </svg>
            </span>
            <span class="font-semibold text-zinc-950 dark:text-white">Install App</span>
          </span>
          <span
            class="text-zinc-400 transition-colors group-hover:text-zinc-950 dark:text-zinc-600 dark:group-hover:text-white"
            >&rarr;</span
          >
        </button>

        <div
          v-for="setting in comingSoonSettings"
          :key="setting.label"
          class="flex min-h-14 items-center justify-between border-b border-zinc-200 px-4 py-3 last:border-b-0 dark:border-zinc-800"
        >
          <span class="flex items-center gap-3">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 dark:border-zinc-800"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  :d="setting.icon"
                />
              </svg>
            </span>
            <span class="font-semibold text-zinc-600 dark:text-zinc-400">{{ setting.label }}</span>
          </span>
          <span
            class="rounded-full border border-zinc-200 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
          >
            Coming soon
          </span>
        </div>

        <button
          class="group flex min-h-14 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
          @click="handleLogout"
        >
          <span class="flex items-center gap-3">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full border border-red-200 text-red-500 transition-colors group-hover:border-red-500 group-hover:text-red-600 dark:border-red-900 dark:text-red-400 dark:group-hover:border-red-300 dark:group-hover:text-red-300"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M15.75 9V5.75A1.75 1.75 0 0014 4h-7a1.75 1.75 0 00-1.75 1.75v12.5C5.25 19.216 6.034 20 7 20h7a1.75 1.75 0 001.75-1.75V15M12 12h8m0 0l-3-3m3 3l-3 3"
                />
              </svg>
            </span>
            <span class="font-semibold text-red-600 dark:text-red-400">Log Out</span>
          </span>
        </button>
      </div>
    </section>

    <section class="pb-8">
      <button
        class="group flex min-h-14 w-full items-center justify-between rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950/80 dark:hover:bg-red-950/20"
        @click="openDeleteAccountModal"
      >
        <span class="flex items-center gap-3">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full border border-red-200 text-red-500 transition-colors group-hover:border-red-500 group-hover:text-red-600 dark:border-red-900 dark:text-red-400 dark:group-hover:border-red-300 dark:group-hover:text-red-300"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.75"
                d="M10 11v6m4-6v6m-7 4h10a2 2 0 002-2V7H5v12a2 2 0 002 2zm8-14V4a1 1 0 00-1-1H10a1 1 0 00-1 1v1H4"
              />
            </svg>
          </span>
          <span class="font-semibold text-red-600 dark:text-red-400">Delete Account</span>
        </span>
        <span
          class="text-red-300 transition-colors group-hover:text-red-600 dark:text-red-900 dark:group-hover:text-red-300"
          >&rarr;</span
        >
      </button>
    </section>

    <section class="mb-8">
      <h2 class="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-zinc-500">
        About & Legal
      </h2>

      <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-1 text-center">
        <NuxtLink
          v-for="link in LEGAL_PAGE_LINKS"
          :key="link.href"
          :to="link.href"
          class="group inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M4.75 6.75A1.75 1.75 0 016.5 5h11A1.75 1.75 0 0119.25 6.75v10.5A1.75 1.75 0 0117.5 19h-11a1.75 1.75 0 01-1.75-1.75V6.75zM8 9h8M8 12h8m-8 3h5"
                />
              </svg>
            </span>

            <span class="min-w-0">{{ link.label }}</span>
          </span>

          <span
            class="shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-700 dark:text-zinc-700 dark:group-hover:text-zinc-300"
            >&rarr;</span
          >
        </NuxtLink>
      </div>
    </section>
  </section>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isPasswordModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        @click.self="closePasswordModal"
      >
        <div
          class="flex w-full max-w-md flex-col gap-4 rounded-[1.25rem] border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-glow"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-2xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
                Change Password
              </h3>
              <p class="mt-1 text-sm text-zinc-500">Enter a new password for your account.</p>
            </div>
            <button
              class="text-zinc-500 transition-colors hover:text-zinc-950 disabled:opacity-50 dark:hover:text-white"
              :disabled="isSavingPassword"
              @click="closePasswordModal"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <AlertMessage type="error" :message="passwordErrorMessage" />

          <form class="flex flex-col gap-3" @submit.prevent="savePassword">
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              placeholder="Current password"
              required
              class="w-full rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-950 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white"
            />

            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="New password"
              required
              class="w-full rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-950 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white"
            />

            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Confirm new password"
              required
              class="w-full rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-950 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white"
            />

            <button
              type="submit"
              :disabled="isSavingPassword"
              class="btn-press mt-2 flex h-12 w-full items-center justify-center rounded-full bg-zinc-950 px-6 py-3 font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-70 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <LoadingSpinner v-if="isSavingPassword" size="h-5 w-5" color="text-current" />
              <span v-else>Update Password</span>
            </button>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isDeleteAccountModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        @click.self="closeDeleteAccountModal"
      >
        <div
          class="flex w-full max-w-md flex-col gap-4 rounded-[1.25rem] border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-glow"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-2xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
                Delete Account
              </h3>
              <p class="mt-1 text-sm text-zinc-500">
                Type <strong>delete account</strong> to permanently remove your account.
              </p>
            </div>
            <button
              class="text-zinc-500 transition-colors hover:text-zinc-950 disabled:opacity-50 dark:hover:text-white"
              :disabled="isDeletingAccount"
              @click="closeDeleteAccountModal"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <AlertMessage type="error" :message="deleteAccountErrorMessage" />

          <form class="flex flex-col gap-3" @submit.prevent="confirmDeleteAccount">
            <input
              v-model="deleteAccountConfirmation"
              type="text"
              :placeholder="DELETE_ACCOUNT_CONFIRMATION_TEXT"
              autocomplete="off"
              class="w-full rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-950 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white"
            />

            <button
              type="submit"
              :disabled="isDeletingAccount || !canConfirmDeleteAccount"
              class="btn-press mt-2 flex h-12 w-full items-center justify-center rounded-full bg-red-600 px-6 py-3 font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-70 dark:bg-red-500 dark:hover:bg-red-400"
            >
              <LoadingSpinner v-if="isDeletingAccount" size="h-5 w-5" color="text-current" />
              <span v-else>Delete Account</span>
            </button>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>

</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import { RECOMMENDATION_LIMIT } from '../constants'
import { LEGAL_PAGE_LINKS } from '~/constants/legal'
import { THEME_DARK_VALUE, THEME_LIGHT_VALUE, THEME_STORAGE_KEY } from '~/utils/theme'

const { user, session, logout, updatePassword, setCurrentUser, resetClientState } = useAuth()
const supabase = useSupabase()
const mode = useColorMode({
  initialValue: THEME_DARK_VALUE,
  storageKey: THEME_STORAGE_KEY,
})
const { quota, pending: quotaPending, error: quotaError, fetchQuota } = useRecommendationQuota()
const { showInstallOption, openInstallModal } = usePwaInstall()

const CURRENT_PASSWORD_ERROR_PATTERNS = [
  'current password',
  'current_password',
  'incorrect password',
  'invalid password',
  'invalid credentials',
]
const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 25
const DELETE_ACCOUNT_ROUTE = '/api/account/delete'
const DELETE_ACCOUNT_REDIRECT_PATH = '/profile?auth=login'
const DELETE_ACCOUNT_CONFIRMATION_TEXT = 'delete account'
const DELETE_ACCOUNT_ERROR_MESSAGE = 'Unable to delete account.'
const activeThemeClass = 'bg-zinc-950 text-white dark:bg-white dark:text-black'
const inactiveThemeClass = 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
const comingSoonSettings = [
  {
    label: 'Bring Your Own Key',
    icon: 'M15 7a4 4 0 10-3.46 5.99L5 19.5V22h2.5l1-1H11v-2.5l3.01-3.01A4 4 0 1015 7z',
  },
]

const isEditingName = ref(false)
const newName = ref('')
const isSavingName = ref(false)
const isPasswordModalOpen = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordErrorMessage = ref('')
const isSavingPassword = ref(false)
const isDeleteAccountModalOpen = ref(false)
const deleteAccountConfirmation = ref('')
const deleteAccountErrorMessage = ref('')
const isDeletingAccount = ref(false)

const displayName = computed(
  () => user.value?.user_metadata?.username || user.value?.user_metadata?.full_name || 'User'
)
const profileInitial = computed(() => displayName.value.trim().charAt(0) || 'U')
const isDarkMode = computed(() => mode.value === THEME_DARK_VALUE)
const darkThemeValue = THEME_DARK_VALUE
const lightThemeValue = THEME_LIGHT_VALUE
const canConfirmDeleteAccount = computed(
  () => deleteAccountConfirmation.value.trim().toLowerCase() === DELETE_ACCOUNT_CONFIRMATION_TEXT
)
const quotaUsedPercent = computed(() => {
  if (RECOMMENDATION_LIMIT <= 0) {
    return 0
  }

  return Math.round(((RECOMMENDATION_LIMIT - quota.value.remaining) / RECOMMENDATION_LIMIT) * 100)
})
const quotaProgressWidth = computed(() => `${Math.min(100, Math.max(0, quotaUsedPercent.value))}%`)

onMounted(() => {
  void fetchQuota()
})

const setTheme = (theme) => {
  mode.value = theme
}

const startEditing = () => {
  newName.value = displayName.value
  isEditingName.value = true
}

const cancelEdit = () => {
  isEditingName.value = false
  newName.value = ''
}

const saveName = async () => {
  const trimmedName = newName.value.trim()

  if (!trimmedName) return

  isSavingName.value = true

  try {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: trimmedName.slice(0, MAX_NAME_LENGTH) },
    })

    if (error) throw error

    setCurrentUser(data.user)
    isEditingName.value = false
  } catch {
    // Keep the editor open so the user can retry saving the name.
  } finally {
    isSavingName.value = false
  }
}

const handleLogout = async () => {
  await logout()
}

const isCurrentPasswordMismatchError = (error) => {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  return CURRENT_PASSWORD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

const getErrorMessage = (error) => {
  if (isCurrentPasswordMismatchError(error)) {
    return 'Current password is incorrect'
  }

  return error instanceof Error ? error.message : 'Something went wrong.'
}

const getDeleteAccountErrorMessage = (error) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'statusMessage' in error.data &&
    typeof error.data.statusMessage === 'string'
  ) {
    return error.data.statusMessage
  }

  return error instanceof Error ? error.message : DELETE_ACCOUNT_ERROR_MESSAGE
}

const resetPasswordForm = () => {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  passwordErrorMessage.value = ''
}

const openPasswordModal = () => {
  resetPasswordForm()
  isPasswordModalOpen.value = true
}

const closePasswordModal = () => {
  if (isSavingPassword.value) return

  isPasswordModalOpen.value = false
  resetPasswordForm()
}

const resetDeleteAccountForm = () => {
  deleteAccountConfirmation.value = ''
  deleteAccountErrorMessage.value = ''
}

const openDeleteAccountModal = () => {
  resetDeleteAccountForm()
  isDeleteAccountModalOpen.value = true
}

const closeDeleteAccountModal = () => {
  if (isDeletingAccount.value) return

  isDeleteAccountModalOpen.value = false
  resetDeleteAccountForm()
}

const validatePasswords = () => {
  if (!currentPassword.value) {
    throw new Error('Current password is required')
  }

  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password must be at least 6 characters')
  }

  if (!/[a-z]/.test(newPassword.value)) {
    throw new Error('Password must include a lowercase letter')
  }

  if (!/[A-Z]/.test(newPassword.value)) {
    throw new Error('Password must include an uppercase letter')
  }

  if (!/[0-9]/.test(newPassword.value)) {
    throw new Error('Password must include a number')
  }

  if (newPassword.value !== confirmPassword.value) {
    throw new Error('Passwords do not match')
  }
}

const savePassword = async () => {
  passwordErrorMessage.value = ''
  isSavingPassword.value = true

  try {
    validatePasswords()

    const { error } = await updatePassword(newPassword.value, currentPassword.value)

    if (error) throw error

    await logout()
    await navigateTo('/profile?auth=login&passwordReset=success')
  } catch (error) {
    passwordErrorMessage.value = getErrorMessage(error)
  } finally {
    isSavingPassword.value = false
  }
}

const confirmDeleteAccount = async () => {
  if (!canConfirmDeleteAccount.value) {
    deleteAccountErrorMessage.value = `Type "${DELETE_ACCOUNT_CONFIRMATION_TEXT}" to continue.`
    return
  }

  const accessToken = session.value?.access_token

  if (!accessToken) {
    deleteAccountErrorMessage.value = 'You need to be signed in to delete your account.'
    return
  }

  deleteAccountErrorMessage.value = ''
  isDeletingAccount.value = true

  try {
    await $fetch(DELETE_ACCOUNT_ROUTE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    await supabase.auth.signOut({ scope: 'local' })
    resetClientState()
    isDeleteAccountModalOpen.value = false
    await navigateTo(DELETE_ACCOUNT_REDIRECT_PATH)
  } catch (error) {
    deleteAccountErrorMessage.value = getDeleteAccountErrorMessage(error)
  } finally {
    isDeletingAccount.value = false
  }
}
</script>
