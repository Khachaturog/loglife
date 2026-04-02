/**
 * Страница создания и редактирования дела.
 * Маршрут: /deeds/new (создание) или /deeds/:id (редактирование).
 */
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CheckboxCards,
  Flex,
  Heading,
  IconButton,
  Select,
  Switch,
  Tabs,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  AutoGrowTextArea,
  AUTO_GROW_TEXTAREA_MAX_PX,
  AUTO_GROW_TEXTAREA_MIN_TWO_LINES_PX,
} from "@/components/AutoGrowTextArea";
import { AppBar } from "@/components/AppBar";
import { PageLoading } from "@/components/PageLoading";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { ArrowBottomRightIcon, ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api";
import {
  RADIX_COLOR_9_PRESETS,
  findRadixColor9PresetByHex,
} from "@/lib/radix-color9-presets";
import { blurActiveInputInForm, blurInputOnEnter } from "@/lib/ios-input-blur";
import type { BlockConfig, BlockType, DeedWithBlocks } from "@/types/database";
import type { DeedAnalyticsConfigV1 } from "@/types/deed-analytics-config";
import { DEFAULT_DEED_ANALYTICS_CONFIG } from "@/types/deed-analytics-config";
import { normalizeDeedAnalyticsConfig } from "@/lib/deed-analytics-config";
import layoutStyles from "@/styles/layout.module.css";
import styles from "./DeedFormPage.module.css";

/** Модель блока в UI — может не иметь id до сохранения в БД */
type UiBlock = {
  id?: string;
  title: string;
  block_type: BlockType;
  is_required: boolean;
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

/** Создаёт пустой блок с дефолтными значениями */
function createDefaultBlock(): UiBlock {
  return {
    title: "Значение",
    block_type: "number",
    is_required: false,
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
  return {
    options: [
      { id: createOptionId(), label: "Вариант 1", sort_order: 0 },
      { id: createOptionId(), label: "Вариант 2", sort_order: 1 },
    ],
  };
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
  const formRef = useRef<HTMLFormElement>(null);

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
            config,
          };
        }) ?? [createDefaultBlock()];
        setBlocks(mapped.length ? mapped : [createDefaultBlock()]);
        setAnalyticsConfig(normalizeDeedAnalyticsConfig(deed.analytics_config));
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

  // Если пользователь ввёл свою категорию, а она появилась в списке — сбрасываем custom
  useEffect(() => {
    if (category && categoryCustom && allCategories.includes(category))
      setCategoryCustom(false);
  }, [allCategories, category, categoryCustom]);

  /** Можно сохранить только при непустом названии и хотя бы одном блоке */
  const canSave = useMemo(
    () => name.trim().length > 0 && blocks.length > 0,
    [name, blocks],
  );

  /** Обновить блок по индексу — updater получает текущий блок и возвращает новый */
  function updateBlock(index: number, updater: (block: UiBlock) => UiBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? updater(b) : b)));
  }

  /** Поменять блок местами с соседом (вверх/вниз) */
  function moveBlock(index: number, direction: "up" | "down") {
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
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, createDefaultBlock()]);
  }

  /** Отправка формы: создание или обновление дела через API */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // без этого страница перезагрузится
    blurActiveInputInForm(e.currentTarget);
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // Преобразуем UI-блоки в формат API (добавляем sort_order)
      const payloadBlocks = blocks.map((b, index) => ({
        id: b.id,
        sort_order: index,
        title: b.title || "Блок",
        block_type: b.block_type,
        is_required: b.is_required,
        config: b.config ?? null,
      }));

      // Цвет heatmap всегда из card_color / темы; отдельный accent_hex в UI не задаём.
      const analyticsPayload: DeedAnalyticsConfigV1 = {
        ...analyticsConfig,
        heatmap: {
          ...analyticsConfig.heatmap,
          use_card_color: true,
          accent_hex: null,
        },
      };

      if (isNew) {
        const deed = await api.deeds.create({
          emoji: emoji || "📋",
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || null,
          card_color: cardColor.trim() || null,
          analytics_config: analyticsPayload,
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
        actionsReserveCount={1}
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
          <IconButton
            size="3"
            variant="classic"
            radius='full'
            disabled={!canSave || saving}
            onClick={() => formRef.current?.requestSubmit()}
            aria-label={saving ? "Сохранение…" : "Сохранить дело"}
          >
            <CheckIcon width={18} height={18} />
          </IconButton>
        }
      />

      <form ref={formRef} onSubmit={handleSubmit}>

        <Tabs.Root value={editorTab} onValueChange={(v) => setEditorTab(v as "deed" | "analytics")}>
          <Tabs.List>
            <Tabs.Trigger value="deed">Дело</Tabs.Trigger>
            <Tabs.Trigger value="analytics">Аналитика</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="deed">
        <Flex direction="column" gap="4">

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
                value={name}
                onKeyDown={blurInputOnEnter}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                />
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

          <Heading size="5" mt="4" mb="-1">
            Блоки
          </Heading>

          <Flex direction="column" gap="4">
            {/* key = block.id ?? index: у новых блоков нет id, используем индекс */}
            {blocks.map((block, index) => (
              <Box
                key={block.id ?? index}
                p="3"
                className={styles.blockCard}
              >
                <Flex align="center" gap="3" mb="2">
                  <Box
                    className={styles.blockTitle}
                  >
                    <Text size="3" color="gray">
                      Блок {index + 1}
                    </Text>
                  </Box>
                  <CheckboxCards.Root
                    value={block.is_required ? ["required"] : []}
                    onValueChange={(values) =>
                      updateBlock(index, (b) => ({
                        ...b,
                        is_required: values.includes("required"),
                      }))
                    }
                    size="1"
                    columns="1"
                  >
                    <CheckboxCards.Item value="required">
                      Обязательно
                    </CheckboxCards.Item>
                  </CheckboxCards.Root>
                  
                  <Flex gap="1">
                    <IconButton
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
                    onValueChange={(nextType) =>
                      updateBlock(index, (b) => {
                        let nextConfig: BlockConfig | null = b.config;
                        if (nextType === "scale")
                          nextConfig = createDefaultScaleConfig();
                        else if (
                          nextType === "single_select" ||
                          nextType === "multi_select"
                        ) {
                          nextConfig = b.config?.options?.length
                            ? { options: [...b.config!.options!] }
                            : createDefaultSelectConfig();
                        } else nextConfig = null;
                        return {
                          ...b,
                          block_type: nextType as BlockType,
                          config: nextConfig,
                        };
                      })
                    }
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
                    value={block.title}
                    onKeyDown={blurInputOnEnter}
                    onChange={(e) =>
                      updateBlock(index, (b) => ({
                        ...b,
                        title: e.target.value,
                      }))
                    }
                    placeholder="Вопрос"
                  />
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
                    {(block.config?.options ?? []).map((opt, optIndex) => (
                      <Flex key={opt.id} gap="1" align="center">
                        <TextField.Root
                          className={styles.single_select_textField}
                          size="3"
                          value={opt.label}
                          onKeyDown={blurInputOnEnter}
                          onChange={(e) =>
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
                            })
                          }
                          placeholder="Введите название..."
                        />
                        <IconButton
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
                          <TrashIcon />
                        </IconButton>
                      </Flex>
                    ))}
                    <Button
                      type="button"
                      color="gray"
                      variant="surface"
                      size="3"
                      aria-label="Добавить вариант"
                      onClick={() =>
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
                                  label: `Вариант ${current.length + 1}`,
                                  sort_order: current.length,
                                },
                              ],
                            },
                          };
                        })
                      }
                    >
                      <PlusIcon /> 
                      Добавить вариант
                    </Button>
                  </Flex>
                )}
              </Box>
            ))}
          </Flex>

          <Button 
          type="button" 
          color="gray" 
          variant="surface" 
          size="3" 
          onClick={addBlock} 
          aria-label="Добавить блок">
            <PlusIcon /> 
            Добавить блок
          </Button>
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
                    checked={analyticsConfig.summary.enabled}
                    onCheckedChange={(checked) =>
                      setAnalyticsConfig((c) => ({
                        ...c,
                        summary: { ...c.summary, enabled: checked },
                      }))
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
                        <Text size="2">Блок «Сегодня»</Text>
                        <Switch
                          checked={analyticsConfig.summary.show_today}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              summary: { ...c.summary, show_today: checked },
                            }))
                          }
                        />
                      </Flex>
                      <Flex align="center" justify="between" gap="3">
                        <Text size="2">Блок «За месяц»</Text>
                        <Switch
                          checked={analyticsConfig.summary.show_month}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              summary: { ...c.summary, show_month: checked },
                            }))
                          }
                        />
                      </Flex>
                      <Flex align="center" justify="between" gap="3">
                        <Text size="2">Блок «Всего»</Text>
                        <Switch
                          checked={analyticsConfig.summary.show_total}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              summary: { ...c.summary, show_total: checked },
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
                    checked={analyticsConfig.activity.enabled}
                    onCheckedChange={(checked) =>
                      setAnalyticsConfig((c) => ({
                        ...c,
                        activity: { ...c.activity, enabled: checked },
                      }))
                    }
                  />
                </Flex>
                {analyticsConfig.activity.enabled ? (
                    <Flex direction="column" gap="3">
                      <Flex align="center" justify="between" gap="3">
                        <Text size="2">Блок «Текущий стрик»</Text>
                        <Switch
                          checked={analyticsConfig.activity.streak_enabled}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              activity: { ...c.activity, streak_enabled: checked },
                            }))
                          }
                        />
                      </Flex>
                      {analyticsConfig.activity.streak_enabled ? (
                        <Flex align="center" justify="between" gap="3" pl="4">
                          <Text size="2">Счётчик «Максимальный стрик»</Text>
                          <Switch
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
                      <Flex align="center" justify="between" gap="3">
                        <Text size="2">Блок «Всего записей»</Text>
                        <Switch
                          checked={analyticsConfig.activity.record_count_enabled}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              activity: { ...c.activity, record_count_enabled: checked },
                            }))
                          }
                        />
                      </Flex>
                      <Flex align="center" justify="between" gap="3" pl="4">
                        <Text size="2">Счётчик «Будни · Выходные»</Text>
                        <Switch
                          checked={analyticsConfig.activity.workday_weekend_enabled}
                          onCheckedChange={(checked) =>
                            setAnalyticsConfig((c) => ({
                              ...c,
                              activity: { ...c.activity, workday_weekend_enabled: checked },
                            }))
                          }
                        />
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
                      <Text size="2">Подписи «Дни недели»</Text>
                      <Switch
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
                      <Text size="2">Подписи «Месяц»</Text>
                      <Switch
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
                      <Text size="2">Пик и легенда уровней «Меньше — Больше»</Text>
                      <Switch
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
