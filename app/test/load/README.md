# NextWatch load, resilience, and capacity testing

This directory contains bounded k6 profiles and local-only Supabase account tools adapted to the current NextWatch implementation. No deployed load test was run as part of this repository change. Generated results are ignored unless deliberately copied elsewhere.

## Discovered architecture

The primary product is Nuxt 4 and Vue 3 in app/. Nitro/H3 server routes use Supabase APIs rather than a direct PostgreSQL connection. Upstash Redis backs rate limits and distributed locks. TMDB supplies public discovery data and movie-detail misses. Google AI Studio is the first live AI provider when configured, followed by OpenRouter.

| User action           | Actual route                 |                                               Supabase |                           Redis |                                 TMDB |                                        AI |                  Auth |
| --------------------- | ---------------------------- | -----------------------------------------------------: | ------------------------------: | -----------------------------------: | ----------------------------------------: | --------------------: |
| Load home/public app  | GET /                        |                                                     No |                              No |                                   No |                                        No |                    No |
| Popular movies        | GET /api/movies/popular      |                                                     No |             TMDB global limiter |                  On Nitro cache miss |                                        No |                    No |
| Search movies         | GET /api/movies/search?q=... |                                                     No |             TMDB global limiter |                                  Yes |                                        No |                    No |
| Movie details         | GET /api/movies/:id          |                              Service-role movies cache |      Guest/user and TMDB limits | On missing, stale, or incomplete row |                                        No |              Optional |
| Load watched IDs      | GET /api/watched             |                    Auth, profiles, user_watched_movies |               List-read limiter |                                   No |                                        No |                   Yes |
| Add/remove watched ID | POST/DELETE /api/watched     |                    Auth, profiles, user_watched_movies |                No write limiter |                                   No |                                        No |                   Yes |
| Load My List          | GET /api/mylist              |                           Auth, profiles, user_my_list |               List-read limiter |                                   No |                                        No |                   Yes |
| Add/remove My List ID | POST/DELETE /api/mylist      |                                   Auth, profiles, RPCs |                No write limiter |                                   No |                                        No |                   Yes |
| Load list metadata    | POST /api/movies/metadata    |                                           Auth, movies |                Metadata limiter |                                   No |                                        No |                   Yes |
| Recommendation quota  | GET /api/recommend/quota     |                                         Auth, profiles |          Recommendation limiter |                                   No |                                        No |                   Yes |
| Recommendations       | GET /api/recommend           | Auth, profiles, watched, list, movies, recommendations | Per-user lock and daily limiter |             Unmatched-title fallback | Google then OpenRouter, or protected mock |                   Yes |
| Signup                | POST /api/auth/signup        |               Auth Admin checks, Auth signup, profiles |                  No app limiter |                                   No |                                        No | No; hCaptcha required |
| Load-test preflight   | GET /api/load-test/status    |                                                     No |                              No |                                   No |                         Reports mode only |       Protected token |

### Verified behavior and plan differences

- The repository has no tracked database schema or migrations. A dedicated test Supabase project must receive the real schema, RLS policies, indexes, and RPCs from the project owner.
- Public movie search calls TMDB. Local full-text matching is used inside recommendation resolution against the Supabase movies table.
- Movie details use a 90-day positive cache in Supabase. There is no negative cache and no same-key request coalescing. The cache profile measures and reports this; it does not add either feature.
- Popular movies use Nitro cached-event handling for 12 hours with stale-while-revalidate.
- Recommendation cache rows last seven days and are invalidated by the watched-movie hash. A 90-second Redis lock returns 409 for duplicate jobs.
- Live AI provider order is Google AI Studio first, then OpenRouter. A real OpenRouter test deployment must omit the Google key so the protected preflight reports OpenRouter first.
- Signup requires hCaptcha, checks the auth_email_exists RPC with the service role, calls regular Supabase signUp, and seeds an incomplete profile. Supabase controls email confirmation and redirect because the route does not set emailRedirectTo.
- Existing structured JSON logs identify errors and recommendation filtering, but do not provide complete database, Redis, provider, or route timing spans. k6 supplies end-to-end and route timing; provider dashboards must be correlated over the same UTC window.

## Safety model

Every k6 profile requires BASE_URL, PRODUCTION_HOSTS for non-local targets, LOAD_TEST_TOKEN, and a successful protected preflight. High-load profiles require the target to report local, staging, or load-test through NUXT_LOAD_TEST_ENVIRONMENT unless the explicit production override is set.

The server-side mock requires both:

- NUXT_PLATFORM_AI_PROVIDER_MODE=mock
- NUXT_PLATFORM_AI_MOCK_ENABLED=true

The scenario and delay come only from deployment environment variables. No query parameter, body field, cookie, or public header can select them.

k6 fails if any service-role variable is present. Real AI has an absolute ten-request cap and requires two explicit confirmations. Signup is one iteration and is permanently refused for configured production hosts. Durations and VU counts have caps. Test-user cleanup is a dry run until an exact project-and-prefix confirmation is supplied.

## Manual setup checklist

1. Create a dedicated Vercel project or equivalent staging deployment from the exact commit under test. Do not use the production hostname for high-load work.
2. Create a dedicated Supabase project. Apply the same schema, RLS policies, indexes, triggers, and RPCs, including auth_email_exists, append_my_list_movie, and remove_my_list_movie. This repository does not contain migrations, so this step cannot be automated here.
3. Populate the test Supabase movies table with the same synthetic/non-sensitive TMDB index used by the tested release. Confirm the 25 deterministic mock titles resolve locally to minimize TMDB fallback.
4. Configure a separate Upstash Redis database when possible. The current app has no Redis namespace setting, so sharing production Redis would mix locks and rate-limit keys.
5. Configure TMDB credentials only on the staging deployment. Cache-miss, search, cold-cache, and recommendation-title fallback tests can consume TMDB quota.
6. In Supabase Auth, configure the staging Site URL and allowed redirect URLs. Use a sandbox SMTP provider or provider test mode for the one-request signup smoke test. Verify the email link manually.
7. Configure the protected load-test variables listed below on the staging deployment. Generate a unique 32-byte token; do not reuse an admin token.
8. For mocked recommendation runs, configure the protected mock variables and redeploy after each scenario change.
9. For the real OpenRouter run, create a separate OpenRouter key with the smallest practical spending limit and model restriction. Configure it only on a dedicated test deployment, remove the Google AI key there, keep provider mode live, and revoke the key afterward if desired.
10. Install k6 locally, synchronize the load-generator clock, record its region/network, create the controlled users, and remove the service-role variable before running k6.
11. Confirm access to Vercel function/log metrics, Supabase Auth/database metrics, Upstash analytics, TMDB usage, and OpenRouter usage for the exact run window.
12. Choose and record known warm IDs, verified uncached valid IDs, a separate uncached stampede ID, realistic workload percentages, provisional thresholds, and the exact production hostname list.

## Deployment environment variables

Configure these only on the dedicated app deployment.

| Variable                       | Purpose                                                          |              Secret | Cost impact         |
| ------------------------------ | ---------------------------------------------------------------- | ------------------: | ------------------- |
| NUXT_LOAD_TEST_ENABLED         | Enables the protected status route                               |                  No | None                |
| NUXT_LOAD_TEST_TOKEN           | Authorizes status preflight                                      |                 Yes | None                |
| NUXT_LOAD_TEST_ENVIRONMENT     | Must be local, staging, or load-test for high-load defaults      |                  No | None                |
| NUXT_PLATFORM_AI_PROVIDER_MODE | live or mock; defaults live                                      |                  No | Live can cost money |
| NUXT_PLATFORM_AI_MOCK_ENABLED  | Second mock opt-in                                               | No, but server-only | None                |
| NUXT_PLATFORM_AI_MOCK_SCENARIO | Deployment-level deterministic scenario                          | No, but server-only | None                |
| NUXT_PLATFORM_AI_MOCK_DELAY_MS | Optional 0-30000 override                                        | No, but server-only | Function duration   |
| NUXT_OPENROUTER_API_KEY        | Dedicated real-AI key                                            |                 Yes | OpenRouter credits  |
| NUXT_OPENROUTER_MODELS         | Restricted real-AI model list                                    |                  No | Model-dependent     |
| NUXT_GOOGLE_API_KEY            | Live Google provider key; remove for OpenRouter-only measurement |                 Yes | Provider usage      |
| NUXT_GOOGLE_MODELS             | Google model order                                               |                  No | Model-dependent     |
| NUXT_PUBLIC_SUPABASE_URL       | Dedicated test project URL                                       |                  No | Supabase usage      |
| NUXT_PUBLIC_SUPABASE_ANON_KEY  | Public anon key for the test project                             |   Public credential | Supabase usage      |
| NUXT_SUPABASE_SERVICE_ROLE_KEY | Server database/admin operations                                 |                 Yes | Supabase usage      |
| UPSTASH_REDIS_REST_URL         | Dedicated test Redis                                             |           Sensitive | Redis usage         |
| UPSTASH_REDIS_REST_TOKEN       | Dedicated test Redis token                                       |                 Yes | Redis usage         |
| NUXT_TMDB_API_KEY              | TMDB bearer key                                                  |                 Yes | TMDB quota          |
| NUXT_HCAPTCHA_SECRET           | Staging hCaptcha verification                                    |                 Yes | Provider-dependent  |
| NUXT_PUBLIC_HCAPTCHA_SITE_KEY  | Staging hCaptcha site key                                        |              Public | Provider-dependent  |

The existing ADMIN_API_TOKEN is not used by load tests.

## Local environment variables

- BASE_URL: required target app URL; not secret.
- PRODUCTION_HOSTS: required comma-separated production hostnames for non-local runs; not secret.
- LOAD_TEST_TOKEN: must match NUXT_LOAD_TEST_TOKEN; secret.
- LOAD_TEST_SUPABASE_URL: dedicated test Supabase URL; not secret.
- LOAD_TEST_SUPABASE_ANON_KEY: test anon key used for password grants; public credential.
- LOAD_TEST_ACCOUNTS_FILE: ignored local credentials JSON; the file is secret.
- LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY: local account tools only; secret and forbidden inside k6.
- LOAD_TEST_EXPECTED_PROJECT_REF: destructive-operation target confirmation; not secret.
- PRODUCTION_SUPABASE_PROJECT_REFS: required deny-list for local Auth administration; not secret.
- LOAD_TEST_USER_PASSWORD: shared synthetic user password; secret.
- LOAD_TEST_DELETE_CONFIRMATION: exact destructive cleanup confirmation; sensitive operational value.
- SIGNUP_PASSWORD and HCAPTCHA_TEST_TOKEN: signup-only secrets.
- REAL_AI_CONFIRMATION: explicit cost acknowledgement; not an API secret.
- All VU, duration, movie-ID, search-term, threshold, plan, region, and assumption variables are non-secret.

See .env.example for every optional profile variable. The file is documentation only and is not auto-loaded.

## Installation

Run from the repository root:

```powershell
Set-Location 'D:\Aki\NextWatch\movie-recommender\app'
npm ci
winget install -e --id k6.k6
k6 version
```

If k6 is already installed, omit winget. No npm load-testing framework is added.

## Generate the protected token

Generate once, then put the same value in the staging deployment as NUXT_LOAD_TEST_TOKEN and in the local shell as LOAD_TEST_TOKEN:

```powershell
$tokenBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
$loadTestToken = [Convert]::ToHexString($tokenBytes).ToLowerInvariant()
$env:LOAD_TEST_TOKEN = $loadTestToken
```

Do not print or commit the token.

## Create pre-verified users

Run only against the dedicated Supabase project. The script verifies the URL project reference, creates or refreshes at most 200 marked users, confirms email administratively without sending email, completes onboarding, seeds bounded watched IDs, and writes an ignored credential fixture.

```powershell
Set-Location 'D:\Aki\NextWatch\movie-recommender\app'
$env:LOAD_TEST_SUPABASE_URL = 'https://PROJECT_REF.supabase.co'
$env:LOAD_TEST_EXPECTED_PROJECT_REF = 'PROJECT_REF'
$env:PRODUCTION_SUPABASE_PROJECT_REFS = 'YOUR-PRODUCTION-PROJECT-REF'
$env:LOAD_TEST_USER_COUNT = '10'
$env:LOAD_TEST_USER_PREFIX = 'nextwatch-loadtest'
$env:LOAD_TEST_USER_EMAIL_DOMAIN = 'example.invalid'
$env:LOAD_TEST_WATCHED_TMDB_IDS = '550,680,155,13,122'

$serviceRole = Read-Host 'Supabase service-role key' -AsSecureString
$env:LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new('', $serviceRole).Password
$userPassword = Read-Host 'Synthetic test-user password' -AsSecureString
$env:LOAD_TEST_USER_PASSWORD = [Net.NetworkCredential]::new('', $userPassword).Password

npm run load:users:create
Remove-Item Env:LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY
```

The fixture is app/test/load/data/accounts.json. It contains synthetic email, password, user ID, and marker only. It never contains tokens or service-role keys.

## Common k6 shell setup

```powershell
Set-Location 'D:\Aki\NextWatch\movie-recommender\app'
$env:BASE_URL = 'https://YOUR-STAGING-DEPLOYMENT'
$env:PRODUCTION_HOSTS = 'YOUR-PRODUCTION-HOST'
$env:LOAD_TEST_SUPABASE_URL = 'https://PROJECT_REF.supabase.co'
$env:LOAD_TEST_SUPABASE_ANON_KEY = 'YOUR-TEST-ANON-KEY'
$env:LOAD_TEST_ACCOUNTS_FILE = '../data/accounts.json'
$env:NUXT_LOAD_TEST_ENVIRONMENT = 'staging'
```

Set LOAD_TEST_TOKEN with the protected value without printing it. Confirm this command returns no value before k6:

```powershell
Get-Item Env:LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
```

## Scenarios

| Profile              | Default                           | What it measures                                                               | External cost                |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| smoke                | 1 VU, 30s                         | Page, popular, search, detail, optional authenticated flow                     | TMDB/Supabase/Redis          |
| browse               | 5 VUs, 2m                         | Realistic public browse with think time                                        | TMDB/Redis/Vercel            |
| authenticated        | 5 VUs, 2m                         | Auth, watched/list reads, metadata, bounded add/remove                         | Supabase/Redis               |
| movie-details-cache  | Bounded phased run                | Warm/cold positive, distinct misses, same-key stampede, first/repeated invalid | TMDB/Supabase/Redis          |
| rate-limits          | One bounded iteration per limiter | Guest/user detail, list, metadata, mocked recommendation limits                | Supabase/Redis; mock only    |
| mixed-workload       | 10 VUs, 5m                        | Assumed 65% browse, 25% account, 10% mock recommendation                       | Staging services; mock only  |
| spike                | 2 to 20 VUs                       | Cold starts, autoscaling, recovery                                             | Staging services             |
| stress               | 5/10/20/30 VUs                    | Staged degradation with abort thresholds                                       | Staging services             |
| soak                 | 5 VUs, 20m                        | Drift, sessions, connections, cache/log volume                                 | Staging services             |
| recommendations-mock | 5 users, bounded                  | Distinct-user concurrency and same-user duplicate lock                         | No AI credits                |
| recommendations-real | 1 VU, 1 request                   | Real OpenRouter latency/reliability through app endpoint                       | OpenRouter and staging usage |
| signup-smoke         | 1 iteration                       | hCaptcha and signup acceptance/duplicate behavior                              | Up to one email              |
| browser-smoke        | 1 browser iteration               | LCP, CLS, navigation, hydration/session-visible behavior                       | Minimal staging usage        |

The mixed percentages are test assumptions, not production analytics.

## Commands in the safest order

### 1. Smoke

```powershell
.\test\load\run-load-test.ps1 -Scenario smoke
```

### 2. Browser smoke

```powershell
.\test\load\run-load-test.ps1 -Scenario browser-smoke
```

### 3. Browse

```powershell
$env:BROWSE_VUS = '5'
$env:BROWSE_DURATION = '2m'
.\test\load\run-load-test.ps1 -Scenario browse
```

### 4. Authenticated activity

```powershell
$env:AUTHENTICATED_VUS = '5'
$env:AUTHENTICATED_DURATION = '2m'
.\test\load\run-load-test.ps1 -Scenario authenticated
```

### 5. Movie-detail cache

Choose IDs not already present in the staging movies table. STAMPEDE_MOVIE_ID must be a different uncached valid ID.

```powershell
$env:WARM_MOVIE_ID = '550'
$env:COLD_MOVIE_IDS = 'VALID_UNCACHED_ID_1,VALID_UNCACHED_ID_2'
$env:STAMPEDE_MOVIE_ID = 'VALID_UNCACHED_ID_3'
$env:INVALID_MOVIE_ID = '2147483647'
.\test\load\run-load-test.ps1 -Scenario movie-details-cache
```

Repeated invalid IDs are expected to call TMDB again because negative caching is absent. Prove that with TMDB/Vercel logs; response latency alone is not sufficient.

### 6. Mock recommendation scenarios

On the deployment, set provider mode mock, mock enabled true, and one scenario, then redeploy. Locally set the expected scenario and expected HTTP statuses.

```powershell
$env:EXPECTED_MOCK_SCENARIO = 'success-normal'
$env:EXPECTED_RECOMMENDATION_STATUSES = '200'
$env:RECOMMENDATION_VUS = '5'
.\test\load\run-load-test.ps1 -Scenario recommendations-mock
```

Available scenarios:

| Scenario             | Default delay | Expected result without stale fallback |
| -------------------- | ------------: | -------------------------------------- |
| success-fast         |          0 ms | 200                                    |
| success-normal       |        500 ms | 200                                    |
| success-slow         |       5000 ms | 200                                    |
| malformed-json       |          0 ms | 502                                    |
| schema-invalid       |          0 ms | 502                                    |
| partial-response     |        500 ms | 200 with fewer candidates              |
| provider-429         |          0 ms | 429                                    |
| provider-500         |          0 ms | 502                                    |
| timeout              |      10000 ms | 504                                    |
| duplicate-results    |        500 ms | 502 after replacement attempts         |
| blocked-results      |        500 ms | 502 after replacement attempts         |
| insufficient-results |        500 ms | 502                                    |

A stored recommendation fallback can turn an AI failure into a 200 stale response. Set EXPECTED_RECOMMENDATION_STATUSES to 200,502 or use a fresh controlled account when testing that recovery path.

### 7. Rate limits

This requires mock mode and consumes the dedicated user’s 10/day recommendation quota.

```powershell
$env:EXPECTED_MOCK_SCENARIO = 'success-fast'
.\test\load\run-load-test.ps1 -Scenario rate-limits
```

Expected 429 responses are recorded in expected_rate_limits and are not added to unexpected_failures. The script does not hammer the global 40/second TMDB limiter because that would create avoidable real provider traffic; verify its configured value with tests and inspect it during later staging profiles.

### 8. Mixed workload

```powershell
$env:MIXED_VUS = '10'
$env:MIXED_DURATION = '5m'
$env:EXPECTED_MOCK_SCENARIO = 'success-normal'
.\test\load\run-load-test.ps1 -Scenario mixed-workload
```

### 9. Small spike

```powershell
$env:SPIKE_BASE_VUS = '2'
$env:SPIKE_MAX_VUS = '20'
.\test\load\run-load-test.ps1 -Scenario spike
```

### 10. Conservative stress stages

```powershell
$env:STRESS_LEVELS = '5,10,20,30'
.\test\load\run-load-test.ps1 -Scenario stress
```

Levels above 50 require ALLOW_HIGH_VU_COUNT=true and are still capped at 200. Unexpected failures above 10% or sustained p95 above the configured stress threshold abort the run after the evaluation delay.

### 11. Soak

```powershell
$env:SOAK_VUS = '5'
$env:SOAK_DURATION = '20m'
.\test\load\run-load-test.ps1 -Scenario soak
```

Durations above 30 minutes require ALLOW_LONG_SOAK=true and remain absolutely capped.

### 12. One signup smoke

Use a sandbox inbox and a fresh hCaptcha token. This sends at most one signup request.

```powershell
$env:ALLOW_SIGNUP_TEST = 'true'
$env:SIGNUP_EMAIL = 'nextwatch-loadtest-001@YOUR-SANDBOX-DOMAIN'
$env:SIGNUP_USERNAME = 'Load Test Signup'
$signupPassword = Read-Host 'Signup password' -AsSecureString
$env:SIGNUP_PASSWORD = [Net.NetworkCredential]::new('', $signupPassword).Password
$captchaToken = Read-Host 'One-time hCaptcha token' -AsSecureString
$env:HCAPTCHA_TEST_TOKEN = [Net.NetworkCredential]::new('', $captchaToken).Password
.\test\load\run-load-test.ps1 -Scenario signup-smoke
```

Manually inspect Supabase Auth and the SMTP sandbox to confirm user creation, email request/delivery, redirect, link expiry/reuse, resend limits, and post-confirmation session. Those steps are intentionally not automated at volume.

### 13. Strictly capped real OpenRouter

Use a separate deployment with provider mode live, mock disabled, no Google key, and only the spending-limited OpenRouter test key. The status preflight must report OpenRouter first.

```powershell
$env:ALLOW_REAL_AI_TEST = 'true'
$env:REAL_AI_CONFIRMATION = 'I_UNDERSTAND_REAL_AI_COSTS'
$env:REAL_AI_REQUESTS = '1'
$env:MAX_REAL_AI_REQUESTS = '5'
$env:REAL_AI_VUS = '1'
.\test\load\run-load-test.ps1 -Scenario recommendations-real
```

The absolute code cap is 10 total requests and three VUs. More than one VU additionally requires ALLOW_REAL_AI_CONCURRENCY=true. Never use this profile for stress, spike, or soak work.

## Result export

Each wrapper run writes a timestamped ignored directory under test/load/results containing:

- metadata.json with commit, target, plans, regions, mode, and assumptions;
- summary.json with aggregate k6 metrics;
- metrics.json with raw tagged points;
- console.txt with the k6 console summary.

Copy REPORT_TEMPLATE.md into the run directory and complete it with dashboard evidence. A test is not a capacity result until the workload, thresholds, target, external limits, stable/degraded levels, and evidence are recorded.

## Dashboard checklist

During every staged run, use the same UTC interval:

- Vercel: function duration, invocation count, errors, timeouts, concurrency, cold starts where available, bandwidth, and logs by route/event.
- Supabase Auth: password-grant rate/errors and Auth rate limits.
- Supabase database: CPU, memory, connections, query latency, locks, row growth, and slow queries for profiles, movies, watched, list, and recommendations.
- Upstash: request count, latency, errors, rate-limit analytics, and recommendation lock keys. Do not flush a shared database.
- TMDB: application TMDB rate-limit headers, provider status, staging logs for tmdb.fetch_failed, and usage/quota.
- OpenRouter: model, request count, latency, token usage, spend, provider errors, and key limit. The app currently does not export cost metadata to k6.
- Load generator: CPU, memory, network saturation, dropped iterations, and clock accuracy.

Interpret 429 by route and scenario. An expected limiter 429 is not a capacity failure. An unexpected 429, 5xx, timeout, threshold abort, database connection failure, or load-generator saturation is separate evidence.

## Cleanup

Dry run:

```powershell
Set-Location 'D:\Aki\NextWatch\movie-recommender\app'
$env:LOAD_TEST_EXPECTED_PROJECT_REF = 'PROJECT_REF'
$env:PRODUCTION_SUPABASE_PROJECT_REFS = 'YOUR-PRODUCTION-PROJECT-REF'
$serviceRole = Read-Host 'Supabase service-role key' -AsSecureString
$env:LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new('', $serviceRole).Password
$env:LOAD_TEST_USER_PASSWORD = 'unused-but-required-for-config-validation'
npm run load:users:delete
```

After verifying the printed project reference, prefix, and count:

```powershell
$env:LOAD_TEST_DELETE_CONFIRMATION = 'DELETE:PROJECT_REF:nextwatch-loadtest'
npm run load:users:delete
Remove-Item Env:LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:LOAD_TEST_USER_PASSWORD
Remove-Item Env:LOAD_TEST_DELETE_CONFIRMATION
```

The cleanup tool verifies every remote Auth user’s app metadata and local email marker before deleting only the fixture IDs and their rows in recommendations, user_watched_movies, user_my_list, and profiles. It then deletes only those Auth users and the local fixture. Rate-limit and lock keys expire by TTL; no Redis-wide deletion is automated.

Delete local results only after archiving what you need:

```powershell
Remove-Item -LiteralPath '.\test\load\results\RUN-DIRECTORY' -Recurse
```

Revoke the separate OpenRouter key, remove staging-only mock and load-test variables, delete the SMTP sandbox messages/users, and delete the dedicated staging resources when no longer needed.

## Unresolved or intentionally manual items

- Database schema/migrations are not in this repository, so test-project parity cannot be automated or verified from source.
- Negative movie-detail caching and same-key request coalescing do not exist. This setup measures the gap without changing application caching.
- Redis, Supabase, and TMDB outage injection is not exposed by the app. Use disposable deployment configuration and provider dashboards; do not add request-controlled failure flags.
- Email-link clicking, expired/reused link behavior, resend behavior, and delivery are manual low-volume checks.
- Browser auth-resolution timing is observable only with a small real browser run and browser/devtools traces; k6 HTTP tests do not represent hydration or image rendering.
- Real AI token and cost metadata remain in OpenRouter’s dashboard because the application does not expose them.
- Provider plan/region limits and production analytics are owner-supplied; default workload percentages and thresholds are provisional assumptions.
- No production, staging, signup, or real-AI run was performed while creating this setup.
