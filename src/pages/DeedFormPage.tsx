/**
 * Страница создания и редактирования дела.
 * Маршрут: /deeds/new (создание) или /deeds/:id (редактирование).
 */
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Box,
  Button,
  Card,
  CheckboxGroup,
  Flex,
  Heading,
  IconButton,
  Select,
  SegmentedControl,
  Switch,
  Tabs,
  Text,
  TextField,
  Separator,
} from "@radix-ui/themes";
import {
  AutoGrowTextArea,
  AUTO_GROW_TEXTAREA_MAX_PX,
  AUTO_GROW_TEXTAREA_MIN_TWO_LINES_PX,
} from "@/components/AutoGrowTextArea";
import { AppBar } from "@/components/AppBar";
import { OnboardingHelpButton } from "@/components/onboarding/OnboardingHelpButton";
import { PageLoading } from "@/components/PageLoading";
import { DurationInput } from "@/components/DurationInput";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import scaleSegmentedStyles from "@/components/ScaleSegmentedControl.module.css";
import { ArrowBottomRightIcon, ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronDownIcon, Cross2Icon, PlusIcon, QuestionMarkIcon, TrashIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api";
import {
  RADIX_COLOR_9_PRESETS,
  findRadixColor9PresetByHex,
} from "@/lib/radix-color9-presets";
import {
  areDefaultValuesCompleteForBlocks,
  createInitialDefaultForBlockType,
  normalizeDefaultValueForBlock,
} from "@/lib/block-default-value";
import { blurActiveInputInForm, blurInputOnEnter } from "@/lib/ios-input-blur";
import { getSingleSelectUi } from "@/lib/block-config";
import type { BlockConfig, BlockType, DeedWithBlocks, ValueJson } from "@/types/database";
import type { DeedAnalyticsConfigV1 } from "@/types/deed-analytics-config";
import { DEFAULT_DEED_ANALYTICS_CONFIG } from "@/types/deed-analytics-config";
import { normalizeDeedAnalyticsConfig } from "@/lib/deed-analytics-config";
import layoutStyles from "@/styles/layout.module.css";
import styles from "./DeedFormPage.module.css";
import { useOnboarding } from "@/lib/onboarding-context";

/** Модель блока в UI — может не иметь id до сохранения в БД */
type UiBlock = {
  id?: string;
  title: string;
  block_type: BlockType;
  is_required: boolean;
  recent_suggestions_enabled: boolean;
  /** Подставлять `default_value` при новой записи; сам JSON не стираем при выкл. */
  default_value_enabled: boolean;
  default_value: ValueJson | null;
  config: BlockConfig | null;
};

/** Человекочитаемые названия типов блоков для Select */
const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  number: "Число",
  text_paragraph: "Текст",
  single_select: "Один из списка",
  multi_select: "Несколько из списка",
  scale: "Шкала",
  yes_no: "Да/Нет",
  duration: "Время",
};

/** Создаёт пустой блок с дефолтными значениями (текст вопроса — только placeholder, без автозаполнения) */
function createDefaultBlock(): UiBlock {
  return {
    title: "",
    block_type: "number",
    is_required: false,
    recent_suggestions_enabled: true,
    default_value_enabled: false,
    default_value: null,
    config: null,
  };
}

function createDefaultScaleConfig(): BlockConfig {
  return { divisions: 5, labels: [] };
}

/** Уникальный id для опции в select — crypto.randomUUID или fallback для старых браузеров */
function createOptionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function createDefaultSelectConfig(): BlockConfig {
  // «Вариант 1/2» только в placeholder полей — value пустой, пока пользователь не введёт текст
  return {
    options: [
      { id: createOptionId(), label: "", sort_order: 0 },
      { id: createOptionId(), label: "", sort_order: 1 },
    ],
    singleSelectUi: "select",
  };
}

/** Варианты списка для редактора дефолта (как на FillForm). */
function deedFormGetBlockOptions(config: BlockConfig | null): { id: string; label: string }[] {
  const fromConfig = config?.options;
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label }));
  return [];
}

/**
 * Редактор значения по умолчанию для блока (футер карточки на DeedFormPage).
 */
function DeedBlockDefaultValueEditor({
  block,
  blockIndex,
  updateBlock,
  hasValidationError,
}: {
  block: UiBlock;
  blockIndex: number;
  updateBlock: (index: number, updater: (b: UiBlock) => UiBlock) => void;
  hasValidationError: boolean;
}) {
  const opts = deedFormGetBlockOptions(block.config);
  const divisions = Math.min(10, Math.max(1, block.config?.divisions ?? 5));

  if (block.block_type === "number") {
    const n = (block.default_value as { number?: number } | null)?.number ?? 1;
    return (
      <Flex direction="column" mt="1">
        <TextField.Root
          size="3"
          color={hasValidationError ? "red" : undefined}
          type="text"
          inputMode="numeric"
          value={String(n)}
          onKeyDown={blurInputOnEnter}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isFinite(parsed) || parsed < 1) return;
            updateBlock(blockIndex, (b) => ({
              ...b,
              default_value: { number: Math.floor(parsed) },
            }));
          }}
        />
        {hasValidationError ? (
          <Text size="1" color="red" role="alert">
            Укажи целое число не меньше 1
          </Text>
        ) : null}
      </Flex>
  );
  }

  if (block.block_type === "text_paragraph") {
    const t = (block.default_value as { text?: string } | null)?.text ?? "";
    return (
      <Flex direction="column" mt="1">
        <TextField.Root
          size="3"
          color={hasValidationError ? "red" : undefined}
          value={t}
          onKeyDown={blurInputOnEnter}
          onChange={(e) =>
            updateBlock(blockIndex, (b) => ({
              ...b,
              default_value: { text: e.target.value },
            }))
          }
        />
        {hasValidationError ? (
          <Text size="1" color="red" role="alert">
            Текст не может быть пустым
          </Text>
        ) : null}
      </Flex>
    );
  }

  if (block.block_type === "single_select") {
    const oid = (block.default_value as { optionId?: string } | null)?.optionId ?? "";
    return (
      <Flex direction="column" mt="1">
        <Select.Root
          size="3"
          value={oid || undefined}
          onValueChange={(v) =>
            updateBlock(blockIndex, (b) => ({
              ...b,
              default_value: { optionId: v },
            }))
          }
        >
          <Select.Trigger
            placeholder="Выбери вариант"
            color={hasValidationError ? "red" : undefined}
          />
          <Select.Content className={styles.selectContentConstrained}>
            {opts.map((o) => (
              <Select.Item key={o.id} value={o.id}>
                {o.label || "—"}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {hasValidationError ? (
          <Text size="1" color="red" role="alert">
            Выбери вариант из списка
          </Text>
        ) : null}
      </Flex>
    );
  }

  if (block.block_type === "multi_select") {
    const ids = (block.default_value as { optionIds?: string[] } | null)?.optionIds ?? [];
    return (
      <Flex direction="column" mt="1">
        <CheckboxGroup.Root
          size="3"
          value={ids}
          onValueChange={(nextValues) => {
            flushSync(() => {
              updateBlock(blockIndex, (b) => ({
                ...b,
                default_value: { optionIds: nextValues },
              }));
            });
          }}
        >
          <Flex direction="column" gap="2">
            {opts.map((o) => (
              <CheckboxGroup.Item key={o.id} value={o.id}>
                {o.label || "—"}
              </CheckboxGroup.Item>
            ))}
          </Flex>
        </CheckboxGroup.Root>
        {hasValidationError ? (
          <Text size="1" color="red" role="alert">
            Отметь хотя бы один вариант
          </Text>
        ) : null}
      </Flex>
    );
  }

  if (block.block_type === "scale") {
    const sv = (block.default_value as { scaleValue?: number } | null)?.scaleValue ?? 1;
    return (
      <Flex direction="column" mt="1">
        <SegmentedControl.Root
          className={scaleSegmentedStyles.root}
          value={String(sv)}
          onValueChange={(v) =>
            updateBlock(blockIndex, (b) => ({
              ...b,
              default_value: { scaleValue: Number(v) },
            }))
          }
          size={{ initial: "1", sm: "2" }}
        >
          {Array.from({ length: divisions }, (_, i) => i + 1).map((n) => (
            <SegmentedControl.Item key={n} value={String(n)}>
              {n}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </Flex>
    );
  }

  if (block.block_type === "yes_no") {
    const yn = (block.default_value as { yesNo?: boolean } | null)?.yesNo === true;
    return (
      <Flex mt="1">
        <Switch
          size="3"
          checked={yn}
          onCheckedChange={(checked) =>
            updateBlock(blockIndex, (b) => ({
              ...b,
              default_value: { yesNo: checked },
            }))
          }
        />
      </Flex>
    );
  }

  if (block.block_type === "duration") {
    const hms =
      (block.default_value as { durationHms?: string } | null)?.durationHms ?? "00:00:00";
    return (
      <Flex mt="1">
        <DurationInput
          value={hms}
          onChange={(next) =>
            updateBlock(blockIndex, (b) => ({
              ...b,
              default_value: { durationHms: next },
            }))
          }
        />
        {hasValidationError ? (
          <Text size="1" color="red" role="alert">
            Укажи время в формате ЧЧ:ММ:СС
          </Text>
        ) : null}
      </Flex>
    );
  }

  return null;
}

/** Перед API: trim подписей и порядок sort_order (валидация непустых подписей — при сабмите формы) */
function normalizeSelectOptionsForPayload(
  config: BlockConfig | null,
): BlockConfig | null {
  if (!config?.options?.length) return config;
  return {
    ...config,
    options: config.options.map((o, i) => ({
      ...o,
      label: o.label.trim(),
      sort_order: i,
    })),
  };
}

type SummaryShowPatch = Partial<
  Pick<
    DeedAnalyticsConfigV1["summary"],
    "show_today" | "show_month" | "show_total"
  >
>;

/**
 * Сводка («Активность»): если все три карточки выключены — `enabled: false`,
 * чтобы мастер-тоггл не оставался «включён» при пустой секции.
 */
function applySummaryShowPatch(
  summary: DeedAnalyticsConfigV1["summary"],
  patch: SummaryShowPatch,
): DeedAnalyticsConfigV1["summary"] {
  const next = { ...summary, ...patch }
  const anyWidget = next.show_today || next.show_month || next.show_total
  return {
    ...next,
    enabled: anyWidget,
  }
}

type ActivityCorePatch = Partial<
  Pick<
    DeedAnalyticsConfigV1["activity"],
    "streak_enabled" | "record_count_enabled" | "workday_weekend_enabled"
  >
>

/**
 * «Стрики и записи»: мастер `enabled` синхронизируем с фактом «есть что показать» —
 * стрик или блок «Всего» (как у max_streak при выключенном стрике: флаг будни/выходные
 * в состоянии сохраняется, просто скрыт, пока «Всего» выкл).
 */
function applyActivityCorePatch(
  activity: DeedAnalyticsConfigV1["activity"],
  patch: ActivityCorePatch,
): DeedAnalyticsConfigV1["activity"] {
  const next = { ...activity, ...patch }
  const anyVisible =
    next.streak_enabled || next.record_count_enabled
  return {
    ...next,
    enabled: anyVisible,
  }
}

/** Категории по умолчанию + пользовательские из существующих дел */
const DEFAULT_CATEGORIES = [
  "Здоровье",
  "Работа",
  "Спорт",
  "Обучение",
  "Хобби",
  "Семья",
  "Финансы",
  "Продуктивность",
];

/** Значение Select цвета карточки: по умолчанию / пресет / «Другое». */
function cardColorSelectValue(cardColor: string): string {
  const c = cardColor.trim();
  if (!c) return "__none__";
  const preset = findRadixColor9PresetByHex(c);
  return preset ? preset.id : "__custom__";
}

const CARD_COLOR_SWATCH_DEFAULT: CSSProperties = {
  backgroundColor: "var(--accent-9)",
};

/** Маркер пункта «Другое» в выпадающем списке */
const CARD_COLOR_SWATCH_CUSTOM: CSSProperties = {
  background:
    "conic-gradient(from 0deg, #e5484d, #ffc53d, #30a46c, #0090ff, #8e4ec6, #e5484d)",
};

/** Видимый слой кнопки color input справа */
function cardColorPickerVisualStyle(
  cardColor: string,
  pickerPristine: boolean,
): CSSProperties {
  const sel = cardColorSelectValue(cardColor);
  if (sel === "__none__") return { backgroundColor: "var(--accent-9)" };
  if (sel === "__custom__" && pickerPristine)
    return { backgroundColor: "#888888" };
  const hex = cardColor.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return { backgroundColor: hex };
  return { backgroundColor: "#888888" };
}

function CardColorSelectOptionLabel({
  label,
  swatchStyle,
}: {
  label: string;
  swatchStyle: CSSProperties;
}) {
  return (
    <Flex align="center" gap="2">
      <Box
        className={styles.cardColorSwatch}
        style={swatchStyle}
        aria-hidden
      />
      <span className={styles.cardColorSelectOptionText}>{label}</span>
    </Flex>
  );
}

/**
 * Конфигурация блока типа «Шкала»: число делений (1–10) и подписи.
 * Подписи для средних делений показываются по кнопке «Заполнить все подписи».
 */
function ScaleBlockConfig({
  divisions,
  labels: rawLabels,
  onChangeDivisions,
  onChangeLabels,
}: {
  divisions: number;
  labels: (string | null)[];
  onChangeDivisions: (d: number) => void;
  onChangeLabels: (labels: (string | null)[]) => void;
}) {
  // Дополняем массив подписей до divisions, чтобы не было undefined
  const labels = Array.from(
    { length: divisions },
    (_, i) => rawLabels[i] ?? null,
  );
  const [expanded, setExpanded] = useState(false);
  const setLabel = (i: number, value: string) => {
    const full = [...rawLabels];
    while (full.length <= i) full.push(null);
    full[i] = value || null;
    onChangeLabels(full.slice(0, 10));
  };
  const hasMiddle = divisions > 2;
  return (
    <Flex direction="column" gap="1" mt="2">
      <Text as="label" size="2" weight="medium">
        Делений (1–10)
      </Text>
      <TextField.Root
        size="3"
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        value={String(divisions)}
        onKeyDown={blurInputOnEnter}
        onChange={(e) =>
          onChangeDivisions(
            Math.min(10, Math.max(1, Number(e.target.value) || 1)),
          )
        }
      />
      <Flex direction="row" align="center" gap="3">

      <Text as="label" size="2" color="gray" weight="medium" mt="1">
         <ArrowBottomRightIcon /> 1
      </Text>
      <TextField.Root
        className={styles.scaleTextField}
        placeholder="Введите подпись"
        size="3"
        value={labels[0] ?? ""}
        onKeyDown={blurInputOnEnter}
        onChange={(e) => setLabel(0, e.target.value)}
        />
        </Flex>
      {divisions > 1 && (
        <>
          {hasMiddle && (
            <Button
              type="button"
              color="gray"
              variant="surface"
              size="3"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? "Свернуть" : "Заполнить все подписи"}
            </Button>
          )}
          {hasMiddle && expanded && (
            <Flex direction="column" gap="2">
              {Array.from({ length: divisions - 2 }, (_, i) => i + 1).map(
                (i) => (
                  <Flex key={i} direction="row" align="center" gap="3">
                    <Text as="label" size="2" color="gray" weight="medium">
                    <ArrowBottomRightIcon /> {i + 1}
                    </Text>
                    <TextField.Root
                      className={styles.scaleTextField}
                      placeholder="Введите подпись"
                      size="3"
                      value={labels[i] ?? ""}
                      onKeyDown={blurInputOnEnter}
                      onChange={(e) => setLabel(i, e.target.value)}
                    />
                  </Flex>
                ),
              )}
            </Flex>
          )}
          <Flex direction="row" align="center" gap="3">
          <Text as="label" size="2" color="gray" weight="medium">
          <ArrowBottomRightIcon /> {divisions}
          </Text>
          <TextField.Root
            className={styles.scaleTextField}
            placeholder="Введите подпись"
            size="3"
            value={labels[divisions - 1] ?? ""}
            onKeyDown={blurInputOnEnter}
            onChange={(e) => setLabel(divisions - 1, e.target.value)}
            />
            </Flex>
        </>
      )}
    </Flex>
  );
}

export function DeedFormPage() {
  // === Роутинг и режим ===
  const { id } = useParams<{ id: string }>(); // id из URL: /deeds/123
  const navigate = useNavigate();
  const isNew = !id || id === "new"; // создание нового или редактирование

  // === Состояние загрузки и сохранения ===
  const [loading, setLoading] = useState(!isNew); // при редактировании сразу грузим
  const [saving, setSaving] = useState(false);
  const [deedsList, setDeedsList] = useState<{ category: string | null }[]>([]);

  // === Поля формы дела ===
  const [emoji, setEmoji] = useState("📋");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [categoryCustom, setCategoryCustom] = useState(false);
  const [cardColor, setCardColor] = useState("");
  /** «Другое»: серый на кнопке пикера, пока не меняли нативный color input */
  const [cardColorPickerPristine, setCardColorPickerPristine] = useState(true);
  const [blocks, setBlocks] = useState<UiBlock[]>([createDefaultBlock()]);
  /** Вкладка редактора: поля дела или настройки аналитики на карточке. */
  const [editorTab, setEditorTab] = useState<"deed" | "analytics">("deed");
  const [analyticsConfig, setAnalyticsConfig] = useState<DeedAnalyticsConfigV1>(
    () => ({ ...DEFAULT_DEED_ANALYTICS_CONFIG }),
  );
  /** Быстрое «+» на карточке и экране дела — только при полных дефолтах и явном включении. */
  const [quickAddDefaultsEnabled, setQuickAddDefaultsEnabled] = useState(false);
  const { openFlow } = useOnboarding();
  const formRef = useRef<HTMLFormElement>(null);
  /** Ошибки после попытки сохранить — подсветка полей и тексты (кнопка сохранения не блокируется) */
  const [nameFieldError, setNameFieldError] = useState(false);
  const [blocksEmptyError, setBlocksEmptyError] = useState(false);
  /** Индексы блоков с пустым «Вопрос» */
  const [blockQuestionErrorIndices, setBlockQuestionErrorIndices] = useState<
    number[]
  >([]);
  /** Ключи «индексБлока-индексВарианта» для пустых подписей в single/multi select */
  const [selectOptionFieldErrors, setSelectOptionFieldErrors] = useState<
    string[]
  >([]);
  /** Блоки-списки без ни одного варианта */
  const [selectBlocksNoOptions, setSelectBlocksNoOptions] = useState<number[]>(
    [],
  );
  /** Индексы блоков с невалидным default_value при сохранении */
  const [blockDefaultErrorIndices, setBlockDefaultErrorIndices] = useState<
    number[]
  >([]);

  /** Сброс подсветок при изменении состава/порядка блоков (индексы ошибок перестают совпадать) */
  function clearAllSubmitValidation() {
    setNameFieldError(false);
    setBlocksEmptyError(false);
    setBlockQuestionErrorIndices([]);
    setSelectOptionFieldErrors([]);
    setSelectBlocksNoOptions([]);
    setBlockDefaultErrorIndices([]);
  }

  /** Числовые блоки для выбора в сводке и heatmap (порядок формы). */
  const numericBlocksUi = useMemo(() => {
    return blocks.filter(
      (b) =>
        b.block_type === "number" ||
        b.block_type === "scale" ||
        b.block_type === "duration",
    );
  }, [blocks]);

  /** Категории, которые пользователь уже использовал в других делах */
  const userCategories = useMemo(() => {
    const set = new Set<string>();
    for (const d of deedsList) {
      const c = d.category?.trim();
      if (c && !DEFAULT_CATEGORIES.includes(c)) set.add(c);
    }
    return Array.from(set).sort();
  }, [deedsList]);

  /** Дефолтные + пользовательские категории для Select */
  const allCategories = useMemo(
    () => [...DEFAULT_CATEGORIES, ...userCategories],
    [userCategories],
  );

  // Загружаем список дел для извлечения пользовательских категорий
  useEffect(() => {
    let cancelled = false;
    api.deeds
      .list()
      .then((list) => {
        if (!cancelled) setDeedsList(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true; // отмена при размонтировании — не обновлять state
    };
  }, []);

  // Загружаем дело при редактировании (id из URL)
  useEffect(() => {
    if (!id || isNew) return;
    let cancelled = false;
    setLoading(true);
    api.deeds
      .get(id)
      .then((deed: DeedWithBlocks | null) => {
        if (!deed || cancelled) return;
        setEmoji(deed.emoji || "📋");
        setName(deed.name || "");
        setDescription(deed.description ?? "");
        const cat = deed.category ?? "";
        setCategory(cat);
        setCategoryCustom(!!cat && !allCategories.includes(cat));
        const cc = (deed.card_color ?? "").trim();
        setCardColor(cc);
        setCardColorPickerPristine(
          !cc || !!findRadixColor9PresetByHex(cc),
        );
        // Миграция старого формата шкалы (labelLeft/labelRight) в новый (labels[])
        const mapped: UiBlock[] = deed.blocks?.map((b) => {
          let config = b.config ?? null;
          if (
            config &&
            b.block_type === "scale" &&
            ("labelLeft" in config || "labelRight" in config)
          ) {
            const divs = Math.min(10, Math.max(1, config.divisions ?? 5));
            const old = config as {
              divisions?: number;
              labelLeft?: string;
              labelRight?: string;
            };
            const labels: (string | null)[] = Array.from(
              { length: divs },
              (_, i) => {
                if (i === 0) return old.labelLeft ?? null;
                if (i === divs - 1) return old.labelRight ?? null;
                return null;
              },
            );
            config = { ...config, divisions: divs, labels };
            delete (config as Record<string, unknown>).labelLeft;
            delete (config as Record<string, unknown>).labelRight;
          }
          return {
            id: b.id,
            title: b.title,
            block_type: b.block_type,
            is_required: b.is_required,
            recent_suggestions_enabled: b.recent_suggestions_enabled ?? true,
            default_value_enabled: b.default_value_enabled ?? false,
            default_value:
              normalizeDefaultValueForBlock(
                { block_type: b.block_type, config },
                b.default_value,
              ) ?? null,
            config,
          };
        }) ?? [createDefaultBlock()];
        setBlocks(mapped.length ? mapped : [createDefaultBlock()]);
        setAnalyticsConfig(normalizeDeedAnalyticsConfig(deed.analytics_config));
        setQuickAddDefaultsEnabled(deed.quick_add_defaults_enabled ?? false);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e?.message ?? "Ошибка загрузки дела");
          navigate("/", { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, navigate]);

  /** Пока не у всех блоков валидные дефолты — выключаем быстрое добавление (нельзя оставить противоречие с БД). */
  useEffect(() => {
    if (!areDefaultValuesCompleteForBlocks(blocks)) {
      setQuickAddDefaultsEnabled(false);
    }
  }, [blocks]);

  // Если пользователь ввёл свою категорию, а она появилась в списке — сбрасываем custom
  useEffect(() => {
    if (category && categoryCustom && allCategories.includes(category))
      setCategoryCustom(false);
  }, [allCategories, category, categoryCustom]);

  /** Обновить блок по индексу — updater получает текущий блок и возвращает новый */
  function updateBlock(index: number, updater: (block: UiBlock) => UiBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? updater(b) : b)));
  }

  /** Поменять блок местами с соседом (вверх/вниз) */
  function moveBlock(index: number, direction: "up" | "down") {
    clearAllSubmitValidation();
    setBlocks((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      // Деструктуризация для обмена двух элементов массива
      [next[targetIndex], next[index]] = [next[index], next[targetIndex]];
      return next;
    });
  }

  function removeBlock(index: number) {
    clearAllSubmitValidation();
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlock() {
    clearAllSubmitValidation();
    setBlocks((prev) => [...prev, createDefaultBlock()]);
  }

  /** Отправка формы: создание или обновление дела через API */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // без этого страница перезагрузится
    blurActiveInputInForm(e.currentTarget);
    if (saving) return;

    const nameErr = !name.trim();
    const blocksEmpty = blocks.length === 0;
    const emptyQuestionIndices = blocks
      .map((b, i) => (!b.title.trim() ? i : -1))
      .filter((i) => i >= 0);
    const selectBlocksNoOpts: number[] = [];
    const selectOptErrKeys: string[] = [];
    blocks.forEach((b, bi) => {
      if (
        b.block_type !== "single_select" &&
        b.block_type !== "multi_select"
      ) {
        return;
      }
      const opts = b.config?.options ?? [];
      if (opts.length === 0) selectBlocksNoOpts.push(bi);
      opts.forEach((o, oi) => {
        if (!o.label.trim()) selectOptErrKeys.push(`${bi}-${oi}`);
      });
    });

    const defaultValErrIndices: number[] = [];
    blocks.forEach((b, bi) => {
      if (!b.default_value_enabled) return;
      if (b.default_value === null) {
        defaultValErrIndices.push(bi);
        return;
      }
      const ok = normalizeDefaultValueForBlock(
        { block_type: b.block_type, config: b.config },
        b.default_value,
      );
      if (!ok) defaultValErrIndices.push(bi);
    });

    const hasErrors =
      nameErr ||
      blocksEmpty ||
      emptyQuestionIndices.length > 0 ||
      selectBlocksNoOpts.length > 0 ||
      selectOptErrKeys.length > 0 ||
      defaultValErrIndices.length > 0;

    if (hasErrors) {
      setNameFieldError(nameErr);
      setBlocksEmptyError(blocksEmpty);
      setBlockQuestionErrorIndices(emptyQuestionIndices);
      setSelectBlocksNoOptions(selectBlocksNoOpts);
      setSelectOptionFieldErrors(selectOptErrKeys);
      setBlockDefaultErrorIndices(defaultValErrIndices);
      return;
    }

    clearAllSubmitValidation();
    setSaving(true);
    try {
      // Преобразуем UI-блоки в формат API (добавляем sort_order)
      const payloadBlocks = blocks.map((b, index) => {
        const rawConfig = b.config ?? null;
        let config =
          b.block_type === "single_select" || b.block_type === "multi_select"
            ? normalizeSelectOptionsForPayload(rawConfig)
            : rawConfig;
        // В jsonb всегда явный singleSelectUi для «один из списка» (как после миграции).
        if (b.block_type === "single_select" && config) {
          config = {
            ...config,
            singleSelectUi: getSingleSelectUi(config),
          };
        }
        const normalizedDefault =
          b.default_value === null
            ? null
            : normalizeDefaultValueForBlock(
                { block_type: b.block_type, config },
                b.default_value,
              );
        return {
          id: b.id,
          sort_order: index,
          title: b.title.trim(),
          block_type: b.block_type,
          is_required: b.is_required,
          recent_suggestions_enabled: b.recent_suggestions_enabled,
          default_value_enabled: b.default_value_enabled,
          default_value: normalizedDefault,
          config,
        };
      });

      const analyticsPayload: DeedAnalyticsConfigV1 = analyticsConfig;
      const quickAddPayload =
        quickAddDefaultsEnabled && areDefaultValuesCompleteForBlocks(blocks);

      if (isNew) {
        const deed = await api.deeds.create({
          emoji: emoji || "📋",
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || null,
          card_color: cardColor.trim() || null,
          analytics_config: analyticsPayload,
          quick_add_defaults_enabled: quickAddPayload,
          blocks: payloadBlocks,
        });
        navigate(`/deeds/${deed.id}`);
      } else if (id) {
        await api.deeds.update(id, {
          emoji: emoji || "📋",
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || null,
          card_color: cardColor.trim() || null,
          analytics_config: analyticsPayload,
          quick_add_defaults_enabled: quickAddPayload,
          blocks: payloadBlocks,
        });
        navigate(`/deeds/${id}`);
      }
    } catch (err: unknown) {
      console.error(
        err instanceof Error ? err.message : "Ошибка сохранения дела",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageLoading
        backHref="/"
        backButtonIcon="close"
        title=""
        titleReserve
        actionsReserveCount={2}
      />
    );
  }

  return (
    <Box className={layoutStyles.pageContainer}>
      <AppBar
        backHref={id ? `/deeds/${id}` : "/"}
        backButtonIcon="close"
        title={isNew ? "Новое дело" : "Редактирование дела"}
        actions={
          <Flex gap="2" align="center">
            <OnboardingHelpButton flowId="help_deed_form" />
            <Separator orientation="vertical" />
            <IconButton
              size="3"
              variant="classic"
              radius="full"
              disabled={saving}
              onClick={() => formRef.current?.requestSubmit()}
              aria-label={saving ? "Сохранение…" : "Сохранить дело"}
            >
              <CheckIcon />
            </IconButton>
          </Flex>
        }
      />

      <form ref={formRef} onSubmit={handleSubmit}>

        <Tabs.Root value={editorTab} onValueChange={(v) => setEditorTab(v as "deed" | "analytics")}>
          <Tabs.List>
            <Tabs.Trigger value="deed">Дело</Tabs.Trigger>
            <Tabs.Trigger value="analytics">Аналитика</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="deed">

        <Flex direction="column" gap="4" mt="4">

          <Flex direction="row" gap="4">
            <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor="emoji">
              Эмодзи
            </Text>
            <EmojiPickerButton value={emoji} onChange={setEmoji} />
            </Flex>
            <Flex direction="column" gap="1" className={styles.nameField}>
              <Text size="2" weight="medium" as="label" htmlFor="name">
                Название
              </Text>
              <TextField.Root
                id="name"
                size="3"
                color={nameFieldError ? "red" : undefined}
                value={name}
                onKeyDown={blurInputOnEnter}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameFieldError(false);
                }}
                placeholder="Название"
                aria-invalid={nameFieldError}
              />
              {nameFieldError ? (
                <Text size="1" color="red" role="alert">
                  Заполни поле
                </Text>
              ) : null}
            </Flex>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor="description">
              Описание
            </Text>
            <AutoGrowTextArea
              id="description"
              className={styles.descriptionTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите дело"
              minHeightPx={AUTO_GROW_TEXTAREA_MIN_TWO_LINES_PX}
              maxHeightPx={AUTO_GROW_TEXTAREA_MAX_PX}
            />
          </Flex>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor="category">
              Категория
            </Text>
            {/* __none__ = пусто, __custom__ = своё значение (показываем TextField ниже) */}
            <Select.Root
              size="3"
              value={
                categoryCustom
                  ? "__custom__"
                  : allCategories.includes(category)
                    ? category
                    : "__none__"
              }
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setCategoryCustom(true);
                  setCategory("");
                } else if (v === "__none__") {
                  setCategoryCustom(false);
                  setCategory("");
                } else {
                  setCategoryCustom(false);
                  setCategory(v);
                }
              }}
            >
              <Select.Trigger id="category" placeholder="—" />
              <Select.Content className={styles.selectContentConstrained}>
                <Select.Item value="__none__">Без категории</Select.Item>
                {allCategories.map((c) => (
                  <Select.Item key={c} value={c}>
                    {c}
                  </Select.Item>
                ))}
                <Select.Item value="__custom__">Другое</Select.Item>
              </Select.Content>
            </Select.Root>
            {categoryCustom && (
              <TextField.Root
                size="3"
                value={category}
                onKeyDown={blurInputOnEnter}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Введите категорию"
              />
            )}
          </Flex>

          {/* Список блоков: каждый блок — карточка с настройками */}
          {/* Блоки */}

          <Flex direction="column" gap="1" mt="4">
            <Heading size="5" mb="-1">
              Блоки
            </Heading>
            {blocksEmptyError ? (
              <Text size="2" color="red" role="alert">
                Добавьте хотя бы один блок
              </Text>
            ) : null}
          </Flex>

          <Flex direction="column" gap="4">
            {/* key = block.id ?? index: у новых блоков нет id, используем индекс */}
            {blocks.map((block, index) => (
              <Card
                key={block.id ?? index}
              >
                <Flex align="center" gap="3" mb="2">
                  <Box
                    className={styles.blockTitle}
                  >
                    <Text size="3" color="gray">
                      Блок {index + 1}
                    </Text>
                  </Box>
                  <Flex gap="1">
                    <IconButton
                      type="button"
                      size="3"
                      color="gray"
                      variant="surface"
                      disabled={index === 0}
                      onClick={() => moveBlock(index, "up")}
                      aria-label="Переместить блок вверх"
                    >
                      <ArrowUpIcon />
                    </IconButton>

                    <IconButton
                      type="button"
                      size="3"
                      color="gray"
                      variant="surface"
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(index, "down")}
                      aria-label="Переместить блок вниз"
                    >
                      <ArrowDownIcon />
                    </IconButton>
                    
                    <IconButton
                      type="button"
                      size="3"
                      variant="surface"
                      color="red"
                      onClick={() => removeBlock(index)}
                      aria-label="Удалить блок"
                    >
                      <TrashIcon />
                    </IconButton>
                  </Flex>
                </Flex>

                <Flex direction="column" gap="2">
                  <Flex direction="column" gap="1">
                    <Text as="label" size="2" weight="medium">
                      Тип
                    </Text>
                    <Select.Root
                      size="3"
                      value={block.block_type}
                      onValueChange={(nextType) => {
                        // Сбрасываем ошибки вариантов для этого блока — тип сменился
                        setSelectOptionFieldErrors((prev) =>
                          prev.filter((k) => !k.startsWith(`${index}-`)),
                        );
                        setSelectBlocksNoOptions((prev) =>
                          prev.filter((i) => i !== index),
                        );
                        updateBlock(index, (b) => {
                          let nextConfig: BlockConfig | null = b.config;
                          if (nextType === "scale")
                            nextConfig = createDefaultScaleConfig();
                          else if (
                            nextType === "single_select" ||
                            nextType === "multi_select"
                          ) {
                            if (b.config?.options?.length) {
                              nextConfig =
                                nextType === "single_select"
                                  ? {
                                      options: [...b.config!.options!],
                                      singleSelectUi: getSingleSelectUi(b.config),
                                    }
                                  : { options: [...b.config!.options!] };
                            } else {
                              nextConfig = createDefaultSelectConfig();
                            }
                          } else nextConfig = null;
                          return {
                            ...b,
                            block_type: nextType as BlockType,
                            config: nextConfig,
                            default_value: null,
                            default_value_enabled: false,
                          };
                        });
                      }}
                    >
                      <Select.Trigger />
                      <Select.Content className={styles.selectContentConstrained}>
                        {(Object.keys(BLOCK_TYPE_LABEL) as BlockType[]).map(
                          (t) => (
                            <Select.Item key={t} value={t}>
                              {BLOCK_TYPE_LABEL[t]}
                            </Select.Item>
                          ),
                        )}
                      </Select.Content>
                    </Select.Root>
                  </Flex>

                  <Flex direction="column" gap="1">
                    <Text as="label" size="2" weight="medium">
                      Вопрос
                    </Text>
                    <TextField.Root
                      size="3"
                      color={
                        blockQuestionErrorIndices.includes(index)
                          ? "red"
                          : undefined
                      }
                      value={block.title}
                      onKeyDown={blurInputOnEnter}
                      onChange={(e) => {
                        setBlockQuestionErrorIndices((prev) =>
                          prev.filter((i) => i !== index),
                        );
                        updateBlock(index, (b) => ({
                          ...b,
                          title: e.target.value,
                        }));
                      }}
                      placeholder="Опиши вопрос..."
                      aria-invalid={blockQuestionErrorIndices.includes(index)}
                    />
                    {blockQuestionErrorIndices.includes(index) ? (
                      <Text size="1" color="red" role="alert">
                        Заполни поле
                      </Text>
                    ) : null}
                  </Flex>
                </Flex>

                {/* Конфиг шкалы: деления и подписи — только для block_type === "scale" */}
                {block.block_type === "scale" && (
                  <ScaleBlockConfig
                    divisions={Math.min(
                      10,
                      Math.max(1, block.config?.divisions ?? 5),
                    )}
                    labels={block.config?.labels ?? []}
                    onChangeDivisions={(d) =>
                      updateBlock(index, (b) => {
                        const prevLabels = b.config?.labels ?? [];
                        // Не обрезаем массив при уменьшении делений — сохраняем до 10 подписей, чтобы при смене числа обратно значение не терялось
                        const labels =
                          prevLabels.length >= d
                            ? prevLabels.slice(0, 10)
                            : [
                                ...prevLabels,
                                ...Array.from(
                                  { length: d - prevLabels.length },
                                  () => null,
                                ),
                              ].slice(0, 10);
                        return {
                          ...b,
                          config: { ...(b.config ?? {}), divisions: d, labels },
                        };
                      })
                    }
                    onChangeLabels={(labels) =>
                      updateBlock(index, (b) => ({
                        ...b,
                        config: { ...(b.config ?? {}), labels },
                      }))
                    }
                  />
                )}

                {/* Варианты ответа для single/multi select — добавляем, удаляем, меняем порядок */}
                {(block.block_type === "single_select" ||
                  block.block_type === "multi_select") && (
                    
                  <Flex direction="column" gap="2" mt="2">
                    <Text as="label" size="2" weight="medium" mb="-1">
                      Варианты
                    </Text>
                    {selectBlocksNoOptions.includes(index) ? (
                      <Text size="1" color="red" role="alert">
                        Добавьте хотя бы один вариант
                      </Text>
                    ) : null}
                    {(block.config?.options ?? []).map((opt, optIndex) => {
                      const optErrKey = `${index}-${optIndex}`;
                      const optionHasError =
                        selectOptionFieldErrors.includes(optErrKey);
                      return (
                      <Flex key={opt.id} gap="1" align="start">
                        <Flex
                          direction="column"
                          gap="1"
                          className={styles.single_select_textField}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          <TextField.Root
                            size="3"
                            color={optionHasError ? "red" : undefined}
                            value={opt.label}
                            onKeyDown={blurInputOnEnter}
                            onChange={(e) => {
                              setSelectOptionFieldErrors((prev) =>
                                prev.filter((k) => k !== optErrKey),
                              );
                              updateBlock(index, (b) => {
                                const nextOptions = [
                                  ...(b.config?.options ?? []),
                                ];
                                nextOptions[optIndex] = {
                                  ...nextOptions[optIndex],
                                  label: e.target.value,
                                };
                                return {
                                  ...b,
                                  config: {
                                    ...(b.config ?? {}),
                                    options: nextOptions,
                                  },
                                };
                              });
                            }}
                            placeholder={`Вариант ${optIndex + 1}`}
                            aria-invalid={optionHasError}
                          />
                          {optionHasError ? (
                            <Text size="1" color="red" role="alert">
                              Заполни поле
                            </Text>
                          ) : null}
                        </Flex>
                        <IconButton
                          type="button"
                          size="3"
                          color="gray"
                          variant="surface"
                          disabled={optIndex === 0}
                          aria-label="Переместить вариант вверх"
                          onClick={() =>
                            updateBlock(index, (b) => {
                              const nextOptions = [
                                ...(b.config?.options ?? []),
                              ];
                              if (optIndex === 0) return b;
                              [
                                nextOptions[optIndex - 1],
                                nextOptions[optIndex],
                              ] = [
                                nextOptions[optIndex],
                                nextOptions[optIndex - 1],
                              ];
                              return {
                                ...b,
                                config: {
                                  ...(b.config ?? {}),
                                  options: nextOptions.map((o, i) => ({
                                    ...o,
                                    sort_order: i,
                                  })),
                                },
                              };
                            })
                          }
                        >
                          <ArrowUpIcon />
                        </IconButton>
                        <IconButton
                        type="button"
                        size="3"
                        color="gray"
                        variant="surface"
                        aria-label="Переместить вариант вниз"
                          disabled={
                            optIndex ===
                            (block.config?.options?.length ?? 1) - 1
                          }
                          onClick={() =>
                            updateBlock(index, (b) => {
                              const nextOptions = [
                                ...(b.config?.options ?? []),
                              ];
                              if (optIndex === nextOptions.length - 1) return b;
                              [
                                nextOptions[optIndex],
                                nextOptions[optIndex + 1],
                              ] = [
                                nextOptions[optIndex + 1],
                                nextOptions[optIndex],
                              ];
                              return {
                                ...b,
                                config: {
                                  ...(b.config ?? {}),
                                  options: nextOptions.map((o, i) => ({
                                    ...o,
                                    sort_order: i,
                                  })),
                                },
                              };
                            })
                          }
                        >
                          <ArrowDownIcon />
                        </IconButton>
                        <IconButton
                        type="button"
                        size="3"
                        variant="surface"
                        color="red"
                        aria-label="Удалить вариант"
                          onClick={() =>
                            updateBlock(index, (b) => ({
                              ...b,
                              config: {
                                ...(b.config ?? {}),
                                options: (b.config?.options ?? [])
                                  .filter((_, i) => i !== optIndex)
                                  .map((o, i) => ({ ...o, sort_order: i })),
                              },
                            }))
                          }
                        >
                          <Cross2Icon />
                        </IconButton>
                      </Flex>
                      );
                    })}
                    <Button
                      type="button"
                      color="gray"
                      variant="surface"
                      size="3"
                      aria-label="Добавить вариант"
                      onClick={() => {
                        setSelectBlocksNoOptions((prev) =>
                          prev.filter((i) => i !== index),
                        );
                        updateBlock(index, (b) => {
                          const current = b.config?.options ?? [];
                          return {
                            ...b,
                            config: {
                              ...(b.config ?? {}),
                              options: [
                                ...current,
                                {
                                  id: createOptionId(),
                                  label: "",
                                  sort_order: current.length,
                                },
                              ],
                            },
                          };
                        });
                      }}
                    >
                      <PlusIcon /> 
                      Добавить вариант
                    </Button>
                  </Flex>
                )}

                {/* Аккордеон: доп. настройки не загромождают карточку блока, пока не раскроешь */}
                <Collapsible.Root defaultOpen={false} style={{ marginTop: '8px' }}>
                  <Collapsible.Trigger
                    type="button"
                    className={styles.blockAdditionalAccordionTrigger}
                  >
                    <Text size="3" weight="medium" as="span">
                      Дополнительные настройки
                    </Text>
                    <ChevronDownIcon
                      className={styles.blockAdditionalAccordionChevron}
                      aria-hidden
                    />
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <Flex direction="column" gap="3" mt="2" pb="1">
                      <Flex align="center" justify="between" gap="3" wrap="wrap">
                        <Text size="3">Обязательное поле</Text>
                        <Switch
                          size="3"
                          checked={block.is_required}
                          onCheckedChange={(checked) =>
                            updateBlock(index, (b) => ({ ...b, is_required: checked }))
                          }
                        />
                      </Flex>
                      {(block.block_type === "number" ||
                        block.block_type === "single_select") && (
                        <Flex align="center" justify="between" gap="3" wrap="wrap">
                          <Text size="3">Подсказки из недавних записей</Text>
                          <Switch
                            size="3"
                            checked={block.recent_suggestions_enabled}
                            onCheckedChange={(checked) =>
                              updateBlock(index, (b) => ({
                                ...b,
                                recent_suggestions_enabled: checked,
                              }))
                            }
                          />
                        </Flex>
                      )}
                      {block.block_type === "single_select" && (
                        <Flex direction="column" gap="2">
                          <Text size="3" weight="medium" as="span">
                            Вид списка
                          </Text>
                          <SegmentedControl.Root
                            size="3"
                            value={
                              block.config?.singleSelectUi === "checkbox"
                                ? "checkbox"
                                : "select"
                            }
                            onValueChange={(v) =>
                              updateBlock(index, (b) => ({
                                ...b,
                                config: {
                                  ...(b.config ?? {}),
                                  singleSelectUi:
                                    v === "checkbox" ? "checkbox" : "select",
                                },
                              }))
                            }
                          >
                            <SegmentedControl.Item value="select">
                              Список
                            </SegmentedControl.Item>
                            <SegmentedControl.Item value="checkbox">
                              Чекбоксы
                            </SegmentedControl.Item>
                          </SegmentedControl.Root>
                        </Flex>
                      )}
                      <Flex direction="column" gap="2">
                        <Flex align="center" justify="between" gap="3" wrap="wrap">
                          <Text size="3">Значение по умолчанию</Text>
                          <Switch
                            size="3"
                            checked={block.default_value_enabled}
                            onCheckedChange={(on) => {
                              setBlockDefaultErrorIndices((prev) =>
                                prev.filter((i) => i !== index),
                              );
                              if (!on) {
                                updateBlock(index, (b) => ({
                                  ...b,
                                  default_value_enabled: false,
                                }));
                                return;
                              }
                              updateBlock(index, (b) => {
                                let next = { ...b, default_value_enabled: true };
                                if (b.default_value === null) {
                                  const init = createInitialDefaultForBlockType(
                                    b.block_type,
                                    b.config,
                                  );
                                  if (init) next = { ...next, default_value: init };
                                }
                                return next;
                              });
                            }}
                          />
                        </Flex>
                        {/* Редактор дефолта только при включённой подстановке; JSON в состоянии сохраняем при выкл. */}
                        {block.default_value_enabled && block.default_value !== null ? (
                          <DeedBlockDefaultValueEditor
                            block={block}
                            blockIndex={index}
                            updateBlock={updateBlock}
                            hasValidationError={blockDefaultErrorIndices.includes(
                              index,
                            )}
                          />
                        ) : null}
                      </Flex>
                    </Flex>
                  </Collapsible.Content>
                </Collapsible.Root>
              </Card>
            ))}
          </Flex>

          <Button 
          type="button" 
          variant="soft" 
          size="4" 
          onClick={addBlock} 
          aria-label="Добавить блок">
            <PlusIcon /> 
            Добавить блок
          </Button>

          <Card>
            <Flex direction="column" gap="3">
              <Flex align="center" justify="between" gap="3" wrap="wrap">
                <Flex direction="column" gap="1" style={{ flex: "1", minWidth: 0 }}>
                  <Heading size="3">Быстрое добавление</Heading>
                  <Text size="2" color="gray">
                    Короткое нажатие «+» создаёт запись с дефолтами; удерживайте «+», чтобы
                    открыть форму. Сначала задайте значение по умолчанию для каждого блока.
                  </Text>
                </Flex>
                <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
                  <Switch
                    size="3"
                    checked={quickAddDefaultsEnabled}
                    disabled={!areDefaultValuesCompleteForBlocks(blocks)}
                    onCheckedChange={setQuickAddDefaultsEnabled}
                    aria-label="Быстрое добавление записей по умолчанию"
                  />
                  <IconButton
                    type="button"
                    size="3"
                    color="gray"
                    variant="surface"
                    aria-label="Справка о быстром добавлении"
                    onClick={() => openFlow("help_quick_add_defaults")}
                  >
                    <QuestionMarkIcon />
                  </IconButton>
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Flex>
          </Tabs.Content>

          <Tabs.Content value="analytics">
            <Flex direction="column" gap="4" mt="4">
              {/* Сводка: Сегодня / За месяц / Всего */}
              <Card>
                <Flex direction="column" gap="3">
                <Flex direction="row" gap="4">
                  <Flex direction="column" gap="1" style={{ flex: "1", minWidth: 0 }}>
                    <Heading size="3">Активность</Heading>
                    <Text size="2" color="gray">
                      Просмотр количества выполненных действий
                    </Text>
                  </Flex>
                  <Switch
                    size="3"
                    checked={analyticsConfig.summary.enabled}
                    onCheckedChange={(checked) =>
                      setAnalyticsConfig((c) => {
                        if (!checked) {
                          return {
                            ...c,
                            summary: { ...c.summary, enabled: false },
                          }
                        }
                        const s = c.summary
                        const anyWidget =
                          s.show_today || s.show_month || s.show_total
                        return {
                          ...c,
                          summary: {
                            ...s,
                            enabled: true,
                            ...(!anyWidget
                              ? {
                                  show_today: true,
                                  show_month: true,
                                  show_total: true,
                                }
                              : {}),
                          },
                        }
                      })
                    }
                  />
                </Flex>
                {analyticsConfig.summary.enabled ? (
                  <>
                  <Flex direction="column" gap="1">
                    <Text as="label" size="2" weight="medium" htmlFor="analytics-summary-block">
                      Блок для суммы
                    </Text>
                    <Select.Root
                      size="3"
                      disabled={numericBlocksUi.filter((b) => b.id).length === 0}
                      value={
                        analyticsConfig.summary.block_id
                        ? analyticsConfig.summary.block_id
                        : "__default__"
                      }
                      onValueChange={(v) =>
                        setAnalyticsConfig((c) => ({
                          ...c,
                          summary: {
                            ...c.summary,
                            block_id: v === "__default__" ? null : v,
                          },
                        }))
                      }
                      >
                      <Select.Trigger
                        id="analytics-summary-block"
                        placeholder="Блок"
                        style={{ width: "100%", maxWidth: "100%" }}
                        />
                      <Select.Content
                        position="popper"
                        className={styles.selectContentConstrained}
                      >
                        <Select.Item value="__default__">
                          Первый числовой блок (по умолчанию)
                        </Select.Item>
                        {numericBlocksUi
                          .filter((b): b is UiBlock & { id: string } => !!b.id)
                          .map((b) => (
                            <Select.Item key={b.id} value={b.id}>
                              {b.title || "Блок"}
                            </Select.Item>
                          ))}
                      </Select.Content>
                    </Select.Root>
                    {numericBlocksUi.filter((b) => b.id).length === 0 ? (
                      <Text size="1" color="gray" mt="1">
                        Создайте дело с числовым блоком, чтобы выбрать блок для сводки
                      </Text>
                    ) : null}
                    </Flex>
                    {/* Видимость карточек сводки на карточке дела */}
                    <Flex direction="column" gap="3">
                      <Flex align="center" justify="between" gap="3">
                        <Text size="3">Блок «Сегодня»</Text>
                        <Switch
                        size="3"
                        color="gray"
                          checked={analyticsConfig.summary.show_today}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              summary: applySummaryShowPatch(c.summary, {
                                show_today: checked,
                              }),
                            }))
                          }
                        />
                      </Flex>
                      <Flex align="center" justify="between" gap="3">
                        <Text size="3">Блок «За месяц»</Text>
                        <Switch
                        size="3"
                        color="gray"
                          checked={analyticsConfig.summary.show_month}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              summary: applySummaryShowPatch(c.summary, {
                                show_month: checked,
                              }),
                            }))
                          }
                        />
                      </Flex>
                      <Flex align="center" justify="between" gap="3">
                        <Text size="3">Блок «Всего»</Text>
                        <Switch
                        size="3"
                        color="gray"
                          checked={analyticsConfig.summary.show_total}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              summary: applySummaryShowPatch(c.summary, {
                                show_total: checked,
                              }),
                            }))
                          }
                        />
                      </Flex>
                    </Flex>
                  </>
                ) : null}
                </Flex>
              </Card>

              {/* Стрики, записи, будни/выходные */}
              <Card>
              <Flex direction="column" gap="3">
                <Flex direction="row" gap="4">
                  <Flex direction="column" gap="1" style={{ flex: "1", minWidth: 0 }}>
                    <Heading size="3">Стрики и записи</Heading>
                    <Text size="2" color="gray">
                      Просмотр количества записей
                    </Text>
                  </Flex>
                  <Switch
                    size="3"
                    checked={analyticsConfig.activity.enabled}
                    onCheckedChange={(checked) =>
                      setAnalyticsConfig((c) => {
                        if (!checked) {
                          return {
                            ...c,
                            activity: { ...c.activity, enabled: false },
                          }
                        }
                        const a = c.activity
                        const anyWidget =
                          a.streak_enabled ||
                          a.record_count_enabled ||
                          a.workday_weekend_enabled
                        return {
                          ...c,
                          activity: {
                            ...a,
                            enabled: true,
                            ...(!anyWidget
                              ? {
                                  streak_enabled: true,
                                  max_streak_enabled: true,
                                  record_count_enabled: true,
                                  workday_weekend_enabled: true,
                                }
                              : {}),
                          },
                        }
                      })
                    }
                  />
                </Flex>
                {analyticsConfig.activity.enabled ? (
                    <Flex direction="column" gap="3">
                      <Flex align="center" justify="between" gap="3">
                        <Text size="3">Блок «Текущий стрик»</Text>
                        <Switch
                          size="3"
                          color="gray"
                          checked={analyticsConfig.activity.streak_enabled}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              activity: applyActivityCorePatch(c.activity, {
                                streak_enabled: checked,
                              }),
                            }))
                          }
                        />
                      </Flex>
                      {analyticsConfig.activity.streak_enabled ? (
                        <Flex align="center" justify="between" gap="3" pl="4">
                          <Text size="3">Счётчик «Максимальный стрик»</Text>
                          <Switch
                            size="3"
                            color="gray"
                            checked={analyticsConfig.activity.max_streak_enabled}
                            onCheckedChange={(checked) =>
                              setAnalyticsConfig((c) => ({
                                ...c,
                                activity: { ...c.activity, max_streak_enabled: checked },
                              }))
                            }
                          />
                        </Flex>
                      ) : null}
                      <Flex direction="column" gap="3">
                        <Flex align="center" justify="between" gap="3">
                          <Text size="3">Блок «Всего записей»</Text>
                          <Switch
                            size="3"
                            color="gray"
                            checked={analyticsConfig.activity.record_count_enabled}
                            onCheckedChange={(checked) =>
                              setAnalyticsConfig((c) => ({
                                ...c,
                                activity: applyActivityCorePatch(c.activity, {
                                  record_count_enabled: checked,
                                }),
                              }))
                            }
                          />
                        </Flex>
                        {analyticsConfig.activity.record_count_enabled ? (
                          <Flex align="center" justify="between" gap="3" pl="4">
                            <Text size="3">Счётчик «Будни · Выходные»</Text>
                            <Switch
                              size="3"
                              color="gray"
                              checked={
                                analyticsConfig.activity.workday_weekend_enabled
                              }
                              onCheckedChange={(checked) =>
                                setAnalyticsConfig((c) => ({
                                  ...c,
                                  activity: applyActivityCorePatch(c.activity, {
                                    workday_weekend_enabled: checked,
                                  }),
                                }))
                              }
                            />
                          </Flex>
                        ) : null}
                      </Flex>
                    </Flex>
                ) : null}
                </Flex>
              </Card>

              {/* Heatmap: расчёт по блоку + цвет карточки (card_color) для heatmap */}
              <Card>
              <Flex direction="column" gap="3">
                <Flex direction="row" gap="4">
                  <Flex direction="column" gap="1" style={{ flex: "1", minWidth: 0 }}>
                    <Heading size="3">Тепловая карта</Heading>
                    <Text size="2" color="gray">
                      Показывает цветом интенсивность выполненных действий
                    </Text>
                  </Flex>
                  <Switch
                    size="3"
                    checked={analyticsConfig.heatmap.enabled}
                    onCheckedChange={(checked) =>
                      setAnalyticsConfig((c) => ({
                        ...c,
                        heatmap: { ...c.heatmap, enabled: checked },
                      }))
                    }
                  />
                </Flex>
                {analyticsConfig.heatmap.enabled ? (
                  <>
                  <Flex direction="column" gap="1">

                    <Text as="label" size="2" weight="medium" htmlFor="analytics-heatmap-block">
                      Расчёт по блоку
                    </Text>

                    <Select.Root
                      size="3"
                      disabled={numericBlocksUi.filter((b) => b.id).length === 0}
                      value={
                        analyticsConfig.heatmap.block_id
                        ? analyticsConfig.heatmap.block_id
                        : "__default__"
                      }
                      onValueChange={(v) =>
                        setAnalyticsConfig((c) => ({
                          ...c,
                          heatmap: {
                            ...c.heatmap,
                            block_id: v === "__default__" ? null : v,
                          },
                        }))
                      }
                      >
                      <Select.Trigger
                        id="analytics-heatmap-block"
                        placeholder="Блок"
                        style={{ width: "100%", maxWidth: "100%" }}
                        />
                      <Select.Content
                        position="popper"
                        className={styles.selectContentConstrained}
                      >
                        <Select.Item value="__default__">
                          Число записей в день (по умолчанию)
                        </Select.Item>
                        {numericBlocksUi
                          .filter((b): b is UiBlock & { id: string } => !!b.id)
                          .map((b) => (
                            <Select.Item key={b.id} value={b.id}>
                              {b.title || "Блок"}
                            </Select.Item>
                          ))}
                      </Select.Content>
                    </Select.Root>
                  </Flex>

                  <Flex direction="column" gap="1">
                    <Text as="label"  size="2" weight="medium" htmlFor="deed-card-color-select">
                      Цвет квадратов
                    </Text>
                      <Flex align="center" gap="3" wrap="wrap">
                        <Box className={styles.cardColorSelectWrap}>
                          <Select.Root
                            size="3"
                            value={cardColorSelectValue(cardColor)}
                            onValueChange={(v) => {
                              if (v === "__none__") {
                                setCardColor("");
                                setCardColorPickerPristine(true);
                              } else if (v === "__custom__") {
                                setCardColorPickerPristine(true);
                                setCardColor((prev) => {
                                  const p = prev.trim();
                                  if (!/^#[0-9A-Fa-f]{6}$/.test(p)) return "#888888";
                                  if (findRadixColor9PresetByHex(p)) return "#888888";
                                  return p;
                                });
                              } else {
                                setCardColorPickerPristine(true);
                                const preset = RADIX_COLOR_9_PRESETS.find((x) => x.id === v);
                                if (preset) setCardColor(preset.hex);
                              }
                            }}
                            >
                            <Select.Trigger
                              id="deed-card-color-select"
                              placeholder="Выберите цвет"
                              aria-label="Цвет карточки: по умолчанию, пресет или свой"
                              style={{ width: "100%" }}
                              />
                            <Select.Content
                              position="popper"
                              className={styles.selectContentConstrained}
                            >
                              <Select.Item value="__none__">
                                <CardColorSelectOptionLabel
                                  label="По умолчанию"
                                  swatchStyle={CARD_COLOR_SWATCH_DEFAULT}
                                  />
                              </Select.Item>
                              <Select.Item value="__custom__">
                                <CardColorSelectOptionLabel
                                  label="Другое"
                                  swatchStyle={CARD_COLOR_SWATCH_CUSTOM}
                                  />
                              </Select.Item>
                              {RADIX_COLOR_9_PRESETS.map((p) => (
                                <Select.Item key={p.id} value={p.id}>
                                  <CardColorSelectOptionLabel
                                    label={p.label}
                                    swatchStyle={{ backgroundColor: p.hex }}
                                    />
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Root>
                        </Box>
                        <Box className={styles.colorInputWrap}>
                          <Box
                            className={styles.colorInputVisual}
                            style={cardColorPickerVisualStyle(
                              cardColor,
                              cardColorPickerPristine,
                            )}
                            aria-hidden
                            />
                          <input
                            id="deed-card-color"
                            type="color"
                            className={styles.colorInputNative}
                            aria-label="Свой цвет карточки (пикер)"
                            value={
                              /^#[0-9A-Fa-f]{6}$/.test(cardColor.trim())
                              ? cardColor.trim()
                              : "#888888"
                            }
                            onChange={(e) => {
                              setCardColor(e.target.value);
                              setCardColorPickerPristine(false);
                            }}
                            />
                        </Box>
                      </Flex>
                  </Flex>

                  {/* Оформление сетки теплокарты на карточке дела */}
                  <Flex direction="column" gap="3">
                    <Flex align="center" justify="between" gap="3">
                      <Text size="3">Подписи «Дни недели»</Text>
                      <Switch
                        size="3"
                        color="gray"
                        checked={analyticsConfig.heatmap.show_weekday_labels}
                        onCheckedChange={(checked) =>
                          setAnalyticsConfig((c) => ({
                            ...c,
                            heatmap: { ...c.heatmap, show_weekday_labels: checked },
                          }))
                        }
                      />
                    </Flex>
                    <Flex align="center" justify="between" gap="3">
                      <Text size="3">Подписи «Месяц»</Text>
                      <Switch
                        size="3"
                        color="gray"
                        checked={analyticsConfig.heatmap.show_month_labels}
                        onCheckedChange={(checked) =>
                          setAnalyticsConfig((c) => ({
                            ...c,
                            heatmap: { ...c.heatmap, show_month_labels: checked },
                          }))
                        }
                      />
                    </Flex>
                    <Flex align="center" justify="between" gap="3">
                      <Text size="3">Пик и легенда уровней</Text>
                      <Switch
                        size="3"
                        color="gray"
                        checked={analyticsConfig.heatmap.show_peak_and_legend}
                        onCheckedChange={(checked) =>
                          setAnalyticsConfig((c) => ({
                            ...c,
                            heatmap: { ...c.heatmap, show_peak_and_legend: checked },
                          }))
                        }
                      />
                    </Flex>
                  </Flex>

                  </>
                ) : null}
                </Flex>
              </Card>
            </Flex>
          </Tabs.Content>
        </Tabs.Root>
      </form>
    </Box>
  );
}
