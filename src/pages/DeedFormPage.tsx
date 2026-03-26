/**
 * Страница создания и редактирования дела.
 * Маршрут: /deeds/new (создание) или /deeds/:id (редактирование).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Separator } from "@radix-ui/themes";
import {
  Box,
  Button,
  CheckboxCards,
  Flex,
  Heading,
  IconButton,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { AppBar } from "@/components/AppBar";
import { PageLoading } from "@/components/PageLoading";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { ArrowBottomRightIcon, ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api";
import { blurActiveInputInForm, blurInputOnEnter } from "@/lib/ios-input-blur";
import type { BlockConfig, BlockType, DeedWithBlocks } from "@/types/database";
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
  text_short: "Текст (строка)",
  text_paragraph: "Текст (абзац)",
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

const PASTEL_COLORS = [
  "#fce4ec",
  "#f3e5f5",
  "#e8eaf6",
  "#e3f2fd",
  "#e0f2f1",
  "#e8f5e9",
  "#f1f8e9",
  "#fffde7",
  "#fff8e1",
  "#fbe9e7",
];

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
  const [blocks, setBlocks] = useState<UiBlock[]>([createDefaultBlock()]);
  const formRef = useRef<HTMLFormElement>(null);

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
        setCardColor(deed.card_color ?? "");
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

      if (isNew) {
        const deed = await api.deeds.create({
          emoji: emoji || "📋",
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || null,
          card_color: cardColor.trim() || null,
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

      <form ref={formRef} onSubmit={handleSubmit} style={{ marginTop: "var(--space-4)" }}>

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
            <TextArea
              id="description"
              size="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите дело"
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
              <Select.Content>
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

          {/* Палитра: готовые цвета + native color picker + hex-поле */}
          {/* <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Цвет карточки
            </Text>
            <Flex gap="1" gapY="2" wrap="wrap" align="center">
                  <input
                    type="color"
                    value={
                      /^#[0-9A-Fa-f]{6}$/.test(cardColor)
                        ? cardColor
                        : "#f0f0f0"
                    }
                    onChange={(e) => setCardColor(e.target.value)}
                    className={styles.colorInput}
                  />
	             <Separator orientation="vertical" ml="1" mr="1" />
              {PASTEL_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => setCardColor(hex)}
                  className={styles.colorButton}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </Flex>
          </Flex> */}


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
                    <Select.Content>
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
      </form>
    </Box>
  );
}
