# Контекстная справка (онбординг по экранам)

Многошаговая справка в виде bottom sheet (Radix `Dialog`). На части экранов вызов — пункт **«Справка»** в `DropdownMenu`; на других — кнопка **«?»** ([`OnboardingHelpButton`](../../src/components/onboarding/OnboardingHelpButton.tsx)) в `actions`. **Форма дела** (`/deeds/new`, `/deeds/:id/edit`): в шапке рядом **галочка** (сохранить) и **«?»**. Страница **добавления записи** (`/deeds/:id/fill`) справку в UI не показывает. Страница кликера справку не показывает (`help_clicker` можно оставить в реестре на будущее).

## Код

| Часть | Путь |
|--------|------|
| Тип шага | [`src/onboarding/types.ts`](../../src/onboarding/types.ts) |
| Тексты и `flowId` | [`src/onboarding/flows.ts`](../../src/onboarding/flows.ts) |
| Провайдер и хук | [`src/lib/onboarding-context.tsx`](../../src/lib/onboarding-context.tsx) |
| Sheet UI | [`src/components/onboarding/OnboardingSheet.tsx`](../../src/components/onboarding/OnboardingSheet.tsx) |
| Кнопка «?» | [`src/components/onboarding/OnboardingHelpButton.tsx`](../../src/components/onboarding/OnboardingHelpButton.tsx) |

Провайдер подключён в [`src/main.tsx`](../../src/main.tsx) внутри `AuthProvider`, чтобы справка была доступна на всех экранах после входа.

## Соответствие маршрутов и `flowId`

| `flowId` | Страница / маршрут |
|----------|-------------------|
| `help_deeds_list` | `/` — список дел |
| `help_deed_form` | `/deeds/new`, `/deeds/:id/edit` |
| `help_quick_add_defaults` | Редактор дела: кнопка «?» у блока «Быстрое добавление» (вкладка «Дело») |
| `help_deed_view` | `/deeds/:id` |
| `help_fill_form` | `/deeds/:id/fill` (тексты в реестре; в UI не вызывается) |
| `help_record` | `/records/:id` |
| `help_history` | `/history` |
| `help_widgets` | `/widgets` |
| `help_clicker` | `/widgets/clicker` (в UI не вызывается) |
| `help_profile` | `/profile` |

## Как добавить слайд или сценарий

1. В [`flows.ts`](../../src/onboarding/flows.ts) добавьте элемент в массив нужного ключа объекта `ONBOARDING_FLOWS` или новый ключ (TypeScript подхватит тип `OnboardingFlowId`).
2. Для нового `flowId` вставьте [`OnboardingHelpButton`](../../src/components/onboarding/OnboardingHelpButton.tsx) в `actions` соответствующей страницы.
3. Опционально: поле `imageSrc` в шаге — путь **относительно `public/`** без ведущего слэша (например `onboarding/foo.webp`); в UI подставляется `import.meta.env.BASE_URL`.

## Ограничения

- Панель прижата к низу через CSS `:has()` на разметке Radix Dialog; при проблемах в старых движках может понадобиться другой контейнер.
- Автопоказ при первом визите не реализован — только явный вызов `openFlow` / кнопка «?».
