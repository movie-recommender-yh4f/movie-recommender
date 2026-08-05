import { getAuthorizedUser } from '../../utils/auth/authorize-user'
import { throwSupabaseError } from '../../utils/shared/api-error'
import { createServiceSupabaseClient } from '../../utils/shared/supabase-client'

const DELETE_ACCOUNT_ERROR_MESSAGE = 'Unable to delete account.'

export default defineEventHandler(async (event) => {
  const { user } = await getAuthorizedUser(event)
  const supabase = createServiceSupabaseClient(event, 'account.delete.service_supabase_misconfigured')

  const { error } = await supabase.auth.admin.deleteUser(user.id)

  if (error) {
    throwSupabaseError(event, error, {
      event: 'account.delete_failed',
      publicMessage: DELETE_ACCOUNT_ERROR_MESSAGE,
      userId: user.id,
    })
  }

  return {
    success: true,
  }
})
