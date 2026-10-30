export type CardText = { question: string; answer: string }
export type Flashcard = CardText & {
  id: string
  noteId: string | null
  sourceTitle: string
  sourceFingerprint: string
  createdAt: number
  reviewCount: number
  lastRating: 'again' | 'got-it' | null
  lastReviewedAt: number | null
}
export type FlashcardDraft = {
  noteId: string
  sourceTitle: string
  sourceFingerprint: string
  cards: CardText[]
}
