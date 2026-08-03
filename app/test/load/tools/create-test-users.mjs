import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  LOAD_TEST_MARKER,
  createTestEmail,
  isMarkedTestUser,
  listAllAuthUsers,
  loadAdminConfiguration,
  validatePassword,
  writeError,
  writeOutput,
} from './shared.mjs'

const PROFILES_TABLE = 'profiles'
const WATCHED_TABLE = 'user_watched_movies'
const WATCHED_CONFLICT_TARGET = 'user_id,tmdb_id'

async function ensureAuthUser(config, existingUsers, email, index) {
  const existing = existingUsers.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  const metadata = {
    load_test_marker: LOAD_TEST_MARKER,
    load_test_prefix: config.prefix,
  }

  if (existing) {
    if (!isMarkedTestUser(existing, config.prefix)) {
      throw new Error('Refusing to modify existing unmarked Auth user ' + email + '.')
    }

    const { data, error } = await config.client.auth.admin.updateUserById(existing.id, {
      password: config.password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: {
        full_name: 'Load Test User ' + String(index + 1).padStart(3, '0'),
      },
    })
    if (error) {
      throw error
    }

    return data.user
  }

  const { data, error } = await config.client.auth.admin.createUser({
    email,
    password: config.password,
    email_confirm: true,
    app_metadata: metadata,
    user_metadata: {
      full_name: 'Load Test User ' + String(index + 1).padStart(3, '0'),
    },
  })
  if (error) {
    throw error
  }

  return data.user
}

async function seedProfiles(config, users) {
  const onboardingCompletedAt = new Date().toISOString()
  const profileRows = users.map((user) => ({
    id: user.id,
    onboarding_completed_at: onboardingCompletedAt,
  }))
  const { error } = await config.client
    .from(PROFILES_TABLE)
    .upsert(profileRows, { onConflict: 'id' })

  if (error) {
    throw error
  }
}

async function seedWatchedMovies(config, users) {
  const watchedRows = users.flatMap((user) =>
    config.watchedIds.map((tmdbId) => ({
      user_id: user.id,
      tmdb_id: tmdbId,
    }))
  )
  const { error } = await config.client.from(WATCHED_TABLE).upsert(watchedRows, {
    onConflict: WATCHED_CONFLICT_TARGET,
    ignoreDuplicates: true,
  })

  if (error) {
    throw error
  }
}

async function main() {
  const config = loadAdminConfiguration()
  validatePassword(config.password)

  writeOutput(
    'Preparing ' +
      config.count +
      ' pre-verified users in Supabase project ' +
      config.actualProjectRef +
      '.'
  )

  const existingUsers = await listAllAuthUsers(config.client)
  const users = []

  for (let index = 0; index < config.count; index++) {
    const email = createTestEmail(config.prefix, config.emailDomain, index)
    users.push(await ensureAuthUser(config, existingUsers, email, index))
  }

  await seedProfiles(config, users)
  await seedWatchedMovies(config, users)

  const accounts = users.map((user) => ({
    userId: user.id,
    email: user.email,
    password: config.password,
    marker: LOAD_TEST_MARKER,
  }))

  await mkdir(path.dirname(config.accountFile), { recursive: true })
  await writeFile(config.accountFile, JSON.stringify(accounts, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })

  writeOutput('Created or refreshed ' + users.length + ' controlled test users.')
  writeOutput('Credential fixture written to the ignored load-test data directory.')
  writeOutput('Remove the service-role variable from the shell before starting k6.')
}

main().catch((error) => {
  writeError('Test-user creation failed: ' + (error?.message || String(error)))
  writeError('Run the dry-run cleanup command before retrying if users were partially created.')
  process.exitCode = 1
})
