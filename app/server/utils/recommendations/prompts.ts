import {
  INITIAL_RECOMMENDATION_COUNT,
  MAX_MY_LIST_RECOMMENDATIONS,
  TARGET_RECOMMENDATIONS,
  UNKNOWN_YEAR_LABEL,
} from './constants'
import { buildTasteProfile } from './taste-profile'
import type { WatchedMovieRecord } from './types'

function createSystemPrompt(candidateCount: number): string {
  return `You are a movie recommendation engine.
Analyze the user's taste profile from their watch history: preferred genres, directors, eras, themes, and tone.

Recommend exactly ${candidateCount} candidate movies, obeying these rules:
1. Backend validation is the source of truth. You suggest candidates; the server will remove watched movies, repeated recommendations, unresolved titles, duplicate TMDB matches, and excess My List matches.
2. WATCHLIST (My List): The user already knows about these movies and has deliberately saved them. Prefer undiscovered movies; the server will keep at most ${MAX_MY_LIST_RECOMMENDATIONS} My List matches.
3. Aim for variety across genres and decades while staying true to the inferred taste profile.
4. Return movie titles in their original release language and script exactly as TMDB original_title. Do not transliterate, anglicize, or use localized variants (e.g. ゴジラ-1.0 not Godzilla Minus One).
5. Each recommendation must be a tuple: [title, release_year], using null when the year is unknown.
6. Return ONLY valid JSON. No markdown. No explanations. No comments. No trailing text.
7. Return exactly ${candidateCount} recommendations.
8. Use this exact format: {"recommendations":[["Movie title",2012],["Another movie",null]]}`
}

const EXACT_ORIGINAL_TITLE_PROMPT_SUFFIX = `
Additional hard requirements:
- "title" must be the exact TMDB "original_title" value, character-for-character, in the original release language and script.
- Never translate, localize, anglicize, transliterate, simplify accents, or substitute an alternate marketing title in "title".
- Example: for The Fifth Element, use "Le Cinquième Élément" if that is the TMDB original title; do not output "The Fifth Element" as "title".`

const POPULAR_MOVIE_PROMPT_SUFFIX = `
Additional recommendation guidance:
- Do not avoid popular movies, mainstream movies, franchise movies, blockbuster movies, or movies from large studios when they genuinely fit the user's taste.
- If the watched history suggests the user likes Marvel, DC, Star Wars, Pixar, Disney, DreamWorks, major action franchises, or other studio-driven movies, include matches from those spaces when appropriate.
- Do not force obscure, arthouse, indie, or low-profile picks just to seem more sophisticated or diverse.
- Prefer the best taste match, whether it is a major studio release or a lesser-known movie.`

export const RECOMMENDATION_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'array',
        prefixItems: [
          { type: 'string', description: 'Movie title in original release language/script' },
          { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        ],
        minItems: 2,
        maxItems: 2,
      },
    },
  },
  required: ['recommendations'],
} satisfies Record<string, unknown>

export const REPLACEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'array',
        prefixItems: [
          { type: 'string', description: 'Movie title in original release language/script' },
          { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        ],
        minItems: 2,
        maxItems: 2,
      },
    },
  },
  required: ['recommendations'],
} satisfies Record<string, unknown>

export function createRecommendationSystemPrompt(
  candidateCount: number = INITIAL_RECOMMENDATION_COUNT
): string {
  return `${createSystemPrompt(candidateCount)}\n${EXACT_ORIGINAL_TITLE_PROMPT_SUFFIX}\n${POPULAR_MOVIE_PROMPT_SUFFIX}`
}

function formatRecommendationYear(year: number | null): string {
  return year === null ? UNKNOWN_YEAR_LABEL : year.toString()
}

function formatPromptMovies(movies: WatchedMovieRecord[], includeGenres: boolean): string {
  if (movies.length === 0) {
    return '- None'
  }

  return movies
    .map((movie) => {
      const genreLabel =
        includeGenres && movie.genres && movie.genres.length > 0
          ? ` - ${movie.genres.join(', ')}`
          : ''

      return `- ${movie.title} (${movie.year})${genreLabel}`
    })
    .join('\n')
}

export function buildUserMessage(
  watchedMovies: WatchedMovieRecord[],
  myListMovies: WatchedMovieRecord[],
  excludedMovies: Array<{ name: string; originalName?: string; year: number | null }> = [],
  candidateCount: number = INITIAL_RECOMMENDATION_COUNT
): string {
  const tasteProfile = buildTasteProfile(watchedMovies, myListMovies)
  const topGenres = tasteProfile.topGenres.length > 0 ? tasteProfile.topGenres.join(', ') : 'None'
  const favoriteDecades =
    tasteProfile.favoriteDecades.length > 0 ? tasteProfile.favoriteDecades.join(', ') : 'None'
  const excludedList = excludedMovies
    .map((movie) => {
      const originalLabel =
        movie.originalName && movie.originalName !== movie.name ? ` / ${movie.originalName}` : ''
      return `- ${movie.name}${originalLabel} (${formatRecommendationYear(movie.year)})`
    })
    .join('\n')
  const excludedSection =
    excludedMovies.length === 0
      ? ''
      : `
RECENTLY RECOMMENDED (FORBIDDEN) - do NOT repeat any of these:
${excludedList}
`

  return `TASTE PROFILE:
- Top genres: ${topGenres}
- Favorite decades/eras: ${favoriteDecades}

REPRESENTATIVE WATCHED MOVIES:
${formatPromptMovies(tasteProfile.representativeWatchedMovies, true)}

TOP WATCHED MOVIES:
${formatPromptMovies(tasteProfile.topWatchedMovies, false)}

MY LIST REMINDERS:
${formatPromptMovies(tasteProfile.myListReminderMovies, false)}
${excludedSection}
Recommend exactly ${candidateCount} candidate movies I would enjoy. These are candidates, not final output: the server will remove watched movies, recently recommended movies, unresolved titles, duplicates, and excess My List matches before keeping up to ${TARGET_RECOMMENDATIONS} final recommendations. At most ${MAX_MY_LIST_RECOMMENDATIONS} final recommendations may come from My List.
Prefer undiscovered movies over My List reminders.
Return ONLY valid JSON. No markdown. No explanations. No comments. No trailing text.
Return exactly ${candidateCount} recommendations.
Use this exact format: {"recommendations":[["Movie title",2012],["Another movie",null]]}`
}

export function buildReplacementUserMessage(
  acceptedIndexes: number[],
  blockedIndexes: number[],
  replacementsNeeded: number,
  useDeeperCutGuidance: boolean
): string {
  const deeperCutGuidance = useDeeperCutGuidance
    ? `
Many recommendations were blocked. Go less obvious, avoid mainstream repeats, vary decades, directors, and genres, and suggest deeper cuts that still fit the taste profile.`
    : ''

  return `Backend validation completed for your previous assistant response.
accepted_indexes: ${JSON.stringify(acceptedIndexes)}
blocked_indexes: ${JSON.stringify(blockedIndexes)}
new_replacements_needed: ${replacementsNeeded}

You already know which titles those indexes refer to from your previous assistant response.
Generate only ${replacementsNeeded} replacement recommendations for blocked indexes.
Do not repeat accepted or blocked recommendations from earlier rounds.
Map tuple positions to blocked_indexes in the same order.
Return ONLY valid JSON. No markdown. No explanations. No comments. No trailing text.
Return exactly ${replacementsNeeded} recommendations.
Use this exact format: {"recommendations":[["Movie title",2012],["Another movie",null]]}${deeperCutGuidance}`
}
