import type { Note } from '../src/types/note.ts'
import { noteText } from '../src/lib/note-text.ts'

const ignored = new Set('a an and are as at be been but by can could do for from had has have i in into is it its me my of on or please should that the their these this to was we were what when which with would you your add added adding also again about above below continue details explain include information more new note notes organize previous same some something tell then those too update updates want'.split(' '))

function stem(word: string) {
  if (!/^[a-z]+$/.test(word)) return word
  if (word.length > 4 && word.endsWith('ies')) word = `${word.slice(0, -3)}y`
  else if (word.length > 5 && word.endsWith('ing')) {
    word = word.slice(0, -3)
    if (/([bdgmnprt])\1$/.test(word)) word = word.slice(0, -1)
  } else if (word.length > 4 && word.endsWith('ed')) {
    word = word.slice(0, -2)
    if (/([bdgmnprt])\1$/.test(word)) word = word.slice(0, -1)
  } else if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) word = word.slice(0, -1)
  if (word.length > 3 && word.endsWith('e') && !word.endsWith('ee')) word = word.slice(0, -1)
  return word
}

function words(text: string) {
  const normalized = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  return (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 1 && !ignored.has(word)).map(stem)
}

function frequencies(terms: string[]) {
  const counts = new Map<string, number>()
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
  return counts
}

export function retrievalQuery(query: string, recentUserMessages: string[] = []) {
  const followUp = !/\b(new topic|different topic|switch|instead)\b/i.test(query)
    && /\b(this|that|it|these|those|same|also|too|more|above|previous|continue)\b/i.test(query) && words(query).length <= 8
  return followUp ? [...recentUserMessages.slice(-3).map((message) => message.slice(0, 1000)), query].join('\n') : query
}

export function findRelatedNotes(notes: Note[], query: string, recentUserMessages: string[] = [], limit = 4): Note[] {
  const latest = [...new Set(words(query))].slice(0, 80)
  const changedTopic = /\b(new topic|different topic|switch|instead)\b/i.test(query)
  const followUp = !changedTopic && /\b(this|that|it|these|those|same|also|too|more|above|previous|continue)\b/i.test(query) && latest.length <= 8
  const weights = new Map(latest.map((term) => [term, 1]))
  if (followUp) {
    recentUserMessages.slice(-3).reverse().forEach((message, index) => {
      for (const term of [...new Set(words(message.slice(0, 4000)))].slice(0, 80)) {
        weights.set(term, Math.max(weights.get(term) ?? 0, [0.6, 0.25, 0.1][index]))
      }
    })
  }
  if (!weights.size) return []

  // Complete originals only: a truncated note must never be used as the basis for a replacement.
  const documents = notes.flatMap((note) => {
    const content = noteText(note.content)
    if (content.length > 16000) return []
    const title = words(note.title)
    const body = words(content)
    return [{ note, title, body, titleCounts: frequencies(title), bodyCounts: frequencies(body) }]
  })
  if (!documents.length) return []
  const averageLength = Math.max(1, documents.reduce((sum, doc) => sum + doc.body.length, 0) / documents.length)
  const rarity = new Map([...weights.keys()].map((term) => {
    const count = documents.filter((doc) => doc.titleCounts.has(term) || doc.bodyCounts.has(term)).length
    return [term, Math.log(1 + (documents.length - count + 0.5) / (count + 0.5))]
  }))
  const phrase = latest.length > 1 ? ` ${latest.join(' ')} ` : ''
  return documents.map((doc) => {
    let score = 0
    for (const [term, weight] of weights) {
      const titleFrequency = doc.titleCounts.get(term) ?? 0
      const bodyFrequency = doc.bodyCounts.get(term) ?? 0
      const titleScore = 4 * titleFrequency / (titleFrequency + 1)
      const bodyScore = bodyFrequency / (bodyFrequency + 1.2 * (0.25 + 0.75 * doc.body.length / averageLength))
      score += weight * rarity.get(term)! * (titleScore + bodyScore)
    }
    const coverage = latest.filter((term) => doc.titleCounts.has(term) || doc.bodyCounts.has(term)).length / Math.max(1, latest.length)
    score *= 1 + coverage
    if (score && phrase) {
      if (` ${doc.title.join(' ')} `.includes(phrase)) score *= 1.5
      else if (` ${doc.body.join(' ')} `.includes(phrase)) score *= 1.15
    }
    return { note: doc.note, score }
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.note.createdAt - a.note.createdAt || a.note.id.localeCompare(b.note.id))
    .slice(0, limit).map(({ note }) => note)
}
