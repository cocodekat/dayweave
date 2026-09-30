# Study-set data

`lists.json` is now a small schema-version-3 manifest. It points to separate subject files instead of storing thousands of lines in one document. Latin is split further into `latin/grammar.json`, `latin/flumen.json`, and `latin/lupa.json` so each lesson stays manageable.

Every list still has an explicit `subject` and `kind`, so adding a subject does not require changing the dashboard layout.

Vocabulary lists use the existing card shape:

```json
{
  "id": "german-unit-1",
  "subject": "german",
  "kind": "vocabulary",
  "title": "Unit 1",
  "cards": [{ "id": "card-1", "question": "audire", "answer": "horen", "hint": "Ik <audire> de baby naast mij." }]
}
```

The optional `hint` is shown as context beneath the prompt while the answer remains hidden.

Declension material is stored compactly as paradigms. The app expands each form into an open-answer card at runtime:

```json
{
  "id": "declension-set-id",
  "subject": "latin",
  "kind": "declension",
  "group": "group-name",
  "title": "Set title",
  "entries": [
    {
      "lemma": "lemma and genitive",
      "gender": "masculine",
      "forms": {
        "nominative_singular": "answer",
        "dative_singular": "answer",
        "accusative_singular": "answer",
        "nominative_plural": "answer",
        "dative_plural": "answer",
        "accusative_plural": "answer"
      }
    }
  ]
}
```

The Latin route uses this model for verbuigingsgroepen 1, 2A, 2B, 3A and 3B. Forms are grouped by their visible spelling at runtime and become toggle exercises for naamval, getal, and geslacht; ambiguous forms can have multiple correct toggles. Greek remains reserved and does not yet appear on the dashboard.

Regular and irregular verbs use compact conjugation entries. Each entry becomes three open-answer cards: third-person singular, third-person plural, and back to the infinitive.

```json
{
  "kind": "conjugation",
  "entries": [
    { "infinitive": "esse", "thirdSingular": "est", "thirdPlural": "sunt" }
  ]
}
```
