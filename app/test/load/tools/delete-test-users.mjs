import { readFile, unlink } from 'node:fs/promises'
import {
  LOAD_TEST_MARKER,
  isMarkedTestUser,
  loadAdminConfiguration,
  writeError,
  writeOutput,
} from './shared.mjs'

const USER_SCOPED_TABLES = [
  { name: 'recommendations', column: 'user_id' },
  { name: 'user_watched_movies', column: 'user_id' },
  { name: 'user_my_list', column: 'user_id' },
  { name: 'profiles', column: 'id' },
]

async function loadAccounts(config) {
  let accounts
  try {
    accounts = JSON.parse(await readFile(config.accountFile, 'utf8'))
  } catch (error) {
    throw new Error('Unable to read the controlled account fixture: ' + error.message)
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('The controlled account fixture is empty or invalid.')
  }

  const expectedEmailStart = config.prefix + '-'
  const expectedEmailEnd = '@' + config.emailDomain
  for (const account of accounts) {
    const email = String(account?.email || '').toLowerCase()
    if (
      account?.marker !== LOAD_TEST_MARKER ||
      !email.startsWith(expectedEmailStart) ||
      !email.endsWith(expectedEmailEnd) ||
      typeof account?.userId !== 'string'
    ) {
      throw new Error('The account fixture contains an unmarked or out-of-scope user.')
    }
  }

  return accounts
}

async function verifyRemoteUsers(config, accounts) {
  for (const account of accounts) {
    const { data, error } = await config.client.auth.admin.getUserById(account.userId)
    if (error) {
      throw error
    }

    if (
      data.user.email?.toLowerCase() !== account.email.toLowerCase() ||
      !isMarkedTestUser(data.user, config.prefix)
    ) {
      throw new Error(
        'Remote Auth user verification failed for fixture user ' + account.userId + '.'
      )
    }
  }
}

async function deleteRows(config, accounts) {
  const userIds = accounts.map((account) => account.userId)

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await config.client.from(table.name).delete().in(table.column, userIds)

    if (error) {
      throw new Error('Failed to clean ' + table.name + ': ' + error.message)
    }
  }
}

async function deleteAuthUsers(config, accounts) {
  for (const account of accounts) {
    const { error } = await config.client.auth.admin.deleteUser(account.userId)
    if (error) {
      throw error
    }
  }
}

async function main() {
  const config = loadAdminConfiguration()
  const accounts = await loadAccounts(config)
  await verifyRemoteUsers(config, accounts)

  const requiredConfirmation = 'DELETE:' + config.actualProjectRef + ':' + config.prefix
  const providedConfirmation = process.env.LOAD_TEST_DELETE_CONFIRMATION || ''

  if (providedConfirmation !== requiredConfirmation) {
    writeOutput(
      'Dry run: verified ' +
        accounts.length +
        ' marked test users in project ' +
        config.actualProjectRef +
        '.'
    )
    writeOutput(
      'No data was deleted. Set LOAD_TEST_DELETE_CONFIRMATION=' +
        requiredConfirmation +
        ' to execute cleanup.'
    )
    return
  }

  await deleteRows(config, accounts)
  await deleteAuthUsers(config, accounts)
  await unlink(config.accountFile)

  writeOutput('Deleted ' + accounts.length + ' marked test users and scoped rows.')
  writeOutput('Deleted the local ignored account fixture.')
  writeOutput('Redis rate-limit keys expire by TTL; no database-wide cache flush was attempted.')
}

main().catch((error) => {
  writeError('Test-user cleanup failed: ' + (error?.message || String(error)))
  process.exitCode = 1
})
