// Only clear, direct undo requests bypass generation. Questions about how undo
// works and negated requests remain ordinary assistant questions.
export function isNoteUndoRequest(text: string) {
  const request = text.trim().replace(/[.!?]+$/, '').trim()
  if (/\b(don't|do not|never|not yet|without|explain|how|if|unless)\b/i.test(request)) return false
  return /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|would like)\s+you\s+to\s+)?(?:undo|revert|roll\s+back)(?:\s+(?:it|that|this|the\s+(?:last\s+)?(?:change|changes|edit|edits|update)|your\s+(?:last\s+)?(?:change|changes|edit|edits|update)|last\s+(?:change|edit|update)))?(?:\s+please)?$/i.test(request)
}
