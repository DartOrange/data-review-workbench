# Asset and dependency inventory

Inventory reviewed before applying the repository's MIT license to original source and fixtures.

## Original material

- UI layout, CSS, favicon geometry, and small decorative shapes are original project material. No stock images, copied logos, or external icon packs were imported.
- Sample CSVs are synthetic. Names are fictional, email domains use `example.com`, and no private/employer/customer dataset was used.
- Screenshots were generated from this application with the synthetic fixtures in Microsoft Edge.
- Fonts use the operating system's Segoe UI/sans-serif and Georgia/serif fallbacks. Font files are not redistributed.

## Runtime dependencies

The installed package metadata reports MIT for each direct runtime dependency:

| Dependency                | Version | License |
| ------------------------- | ------- | ------- |
| React / React DOM         | 19.3.1  | MIT     |
| MUI Material              | 9.5.0   | MIT     |
| Emotion React             | 11.14.0 | MIT     |
| Emotion Styled            | 11.14.1 | MIT     |
| AG Grid Community / React | 36.2.0  | MIT     |
| Express                   | 5.3.0   | MIT     |
| csv-parse                 | 7.0.3   | MIT     |

AG Grid Enterprise is not installed. Node.js, SQLite, npm, development tools, and transitive dependencies retain their own upstream terms. The exact dependency graph is recorded in `package-lock.json`. The Windows executable includes Node 26.13.0 and bundled dependencies; the corresponding runtime license, dependency notices, and application license are distributed alongside it. The project license does not relicense third-party software.
