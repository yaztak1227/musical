# Push Checklist

- Before pushing Git tags, compare the translation tag sets across all multilingual locale files under `src/locales/`, not only `en.xml` and `ja.xml`.
- For every locale file, verify that ICU-style placeholders such as `{count}` and `{message}` match the English source string.
- Do not use English fallback text to complete non-English locale files. Add actual translations for missing or changed UI copy; only proper nouns, product names, fixed acronyms, and literal paths may intentionally remain identical.
