# NextWatch Load-Test Report

## Run identity

| Field                         | Value |
| ----------------------------- | ----- |
| Date/time (UTC)               |       |
| Application Git commit        |       |
| Test script Git commit        |       |
| Target URL                    |       |
| Deployment environment/region |       |
| Load-generator region         |       |
| Vercel plan                   |       |
| Supabase plan/compute         |       |
| Redis plan                    |       |
| AI provider mode/model        |       |
| Cache state                   |       |
| Scenario and assumptions      |       |

## Quality criteria

Document the provisional or approved thresholds used for this run. Do not combine normal API and AI latency into one target.

| Route/workflow class           | p95 target | p99 target | Unexpected error target | Notes |
| ------------------------------ | ---------: | ---------: | ----------------------: | ----- |
| Cached API                     |            |            |                         |       |
| Database-backed API            |            |            |                         |       |
| TMDB-backed API                |            |            |                         |       |
| Mock recommendation            |            |            |                         |       |
| Real OpenRouter recommendation |            |            |                         |       |

## Results

| Active users | Approx. RPS | p50 | p90 | p95 | p99 | Expected 429 | Unexpected errors | Timeouts | Result |
| -----------: | ----------: | --: | --: | --: | --: | -----------: | ----------------: | -------: | ------ |
|              |             |     |     |     |     |              |                   |          |        |

## Status-code distribution

| Route | 2xx | 4xx excluding 429 | Expected 429 | Unexpected 429 | 5xx | Timeouts |
| ----- | --: | ----------------: | -----------: | -------------: | --: | -------: |
|       |     |                   |              |                |     |          |

## Dependency evidence

Record dashboard screenshots or exported values over the exact test window.

| Dependency             | Evidence inspected | Saturation/error signal | Conclusion |
| ---------------------- | ------------------ | ----------------------- | ---------- |
| Vercel functions/logs  |                    |                         |            |
| Supabase Auth/database |                    |                         |            |
| Upstash Redis          |                    |                         |            |
| TMDB                   |                    |                         |            |
| Google/OpenRouter      |                    |                         |            |
| Load generator         |                    |                         |            |

## Cache evidence

- Positive cache warm-up method:
- Cold IDs and proof they were uncached:
- Warm-hit behavior:
- Same-key miss behavior:
- Invalid-ID first request:
- Invalid-ID repeated requests:
- TMDB call evidence:
- Note: the inspected implementation has no negative cache or same-key request coalescing.

## Findings

- Last clearly stable level:
- First degraded level:
- First unacceptable level:
- Likely first bottleneck:
- Evidence:
- Intentional application rate limit or capacity failure:
- External provider constraint:
- Recovery after spike:
- Latency drift during soak:
- Confidence:
- Limitations:

## Defensible conclusion

> In the tested workload, the application remained within the stated criteria at approximately X concurrently active users and Y requests per second. At the next stage, p95 increased to Z and unexpected errors rose to N%. The first observed bottleneck was the identified component, based on the recorded evidence. This is a measured safe operating point for this scenario, not a theoretical maximum.

## Artifacts

- metadata.json:
- summary.json:
- metrics.json:
- console.txt:
- Dashboard exports/screenshots:
- Related deployment/log query:
