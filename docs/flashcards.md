# Flashcards

Open **Flashcards** in the sidebar and choose a saved note. Generate creates a preview of up to ten question-and-answer cards. The selected note is sent to the configured OpenAI model and API charges may apply. Review the output for accuracy, edit or remove cards, and save the ones you want. Generation requires a nonempty note of at most 30,000 text characters. If the note changes while generating or before saving, generate a fresh preview.

Saved cards live in the local SQLite database. Cards link to their source note; deleting a note keeps its cards and the original source title. Identical cards from the same note version are not duplicated when saving again. Delete individual cards from the saved list.

Start review to see each question and reveal its answer. **Again** moves a card to the end of the current session; **Got it** removes it from that session. Each rating and the total review count are saved locally. Sessions are temporary and there is no spaced-repetition scheduling. Cards do not automatically update when a note changes.
