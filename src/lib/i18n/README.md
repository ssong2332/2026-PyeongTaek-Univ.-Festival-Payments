# lib/i18n — 고객 화면 다국어(T-04, F-05)

- `translate.ts`: `messages/*.json` 사전, `translate()`·`createT()`(누락·공백 번역은 ko로 폴백), `koT`.
- `locale.ts`: `useLocale()`·`useT()`·`setLocale()` — 고른 언어는 이 기기 localStorage(`hotteok-locale`).
- 언어 목록의 원본은 `src/domain/i18n/locales.ts`. 메뉴·옵션 이름은 서버가 `GET /api/menu?lang=`에서 번역·폴백한다.
