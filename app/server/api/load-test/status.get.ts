export default defineEventHandler((event) => {
  return getProtectedLoadTestStatus(event)
})
