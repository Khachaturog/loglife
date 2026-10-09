import { useEffect, useState } from 'react'
import { AlertDialog, Box, Button, Dialog, Flex, IconButton, Select, Slider, Text, TextField } from '@radix-ui/themes'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'
import { EmojiPickerButton } from '@/components/EmojiPickerButton'
import { api } from '@/lib/api'
import {
  formatFocusClock,
  POMODORO_FALLBACK_EMOJI,
  POMODORO_FREE_LABEL,
  POMODORO_MAX_FOCUS_SECONDS,
  POMODORO_MIN_RECORDED_SECONDS,
  textOnAccent,
} from '@/lib/pomodoro'
import { findRadixColor9PresetByHex, RADIX_COLOR_9_PRESETS } from '@/lib/radix-color9-presets'
import type { PomodoroProjectRow } from '@/types/database'
import styles from './PomodoroProjectsSheet.module.css'

type FormDraft = {
  id: string | null
  name: string
  emoji: string
  accentColor: string
  focusSeconds: number
}

type SheetView = 'list' | 'form' | 'ruler'

type PomodoroProjectsSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: PomodoroProjectRow[]
  settingsFocusSeconds: number
  selectedProjectId: string | null
  onSelect: (projectId: string | null) => void
  onChanged: () => Promise<void>
}

const DEFAULT_ACCENT = RADIX_COLOR_9_PRESETS.find((preset) => preset.id === 'orange')?.hex ?? RADIX_COLOR_9_PRESETS[0].hex

/**
 * Лист проектов поверх таймера: выбор, создание, правка минут, цвета и эмодзи.
 * «Без проекта» хранит длительность в настройках пользователя.
 */
export function PomodoroProjectsSheet({
  open,
  onOpenChange,
  projects,
  settingsFocusSeconds,
  selectedProjectId,
  onSelect,
  onChanged,
}: PomodoroProjectsSheetProps) {
  const [view, setView] = useState<SheetView>('list')
  const [draft, setDraft] = useState<FormDraft | null>(null)
  const [rulerMinutes, setRulerMinutes] = useState(25)
  const [rulerTarget, setRulerTarget] = useState<'form' | 'settings'>('form')
  const [deleteTarget, setDeleteTarget] = useState<PomodoroProjectRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setView('list')
    setDraft(null)
    setError(null)
  }, [open])

  function openCreate() {
    setError(null)
    setDraft({
      id: null,
      name: '',
      emoji: '🎯',
      accentColor: DEFAULT_ACCENT,
      focusSeconds: settingsFocusSeconds,
    })
    setView('form')
  }

  function openEdit(project: PomodoroProjectRow) {
    setError(null)
    setDraft({
      id: project.id,
      name: project.name,
      emoji: project.emoji,
      accentColor: project.accent_color,
      focusSeconds: project.focus_seconds,
    })
    setView('form')
  }

  function openRuler(seconds: number, target: 'form' | 'settings') {
    const minMinutes = POMODORO_MIN_RECORDED_SECONDS / 60
    const maxMinutes = POMODORO_MAX_FOCUS_SECONDS / 60
    setRulerTarget(target)
    // Старые значения короче 5 минут на ползунке не показываем, в базу не пишем до «Готово».
    setRulerMinutes(Math.min(maxMinutes, Math.max(minMinutes, Math.round(seconds / 60))))
    setView('ruler')
  }

  async function applyRuler() {
    const seconds = rulerMinutes * 60
    if (rulerTarget === 'form' && draft) {
      setDraft({ ...draft, focusSeconds: seconds })
      setView('form')
    } else {
      setBusy(true)
      setError(null)
      try {
        await api.pomodoro.updateSettings(seconds)
        await onChanged()
        setView('list')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось сохранить длительность')
        return
      } finally {
        setBusy(false)
      }
    }
  }

  async function saveDraft() {
    if (!draft || busy) return
    setBusy(true)
    setError(null)
    try {
      if (draft.id) {
        await api.pomodoro.updateProject(draft.id, draft)
      } else {
        const created = await api.pomodoro.createProject(draft)
        onSelect(created.id)
      }
      await onChanged()
      setView('list')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить проект')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.pomodoro.deleteProject(deleteTarget.id)
      if (selectedProjectId === deleteTarget.id) onSelect(null)
      setDeleteTarget(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект')
    } finally {
      setBusy(false)
    }
  }

  const title = view === 'ruler' ? 'Длительность' : view === 'form' ? (draft?.id ? 'Проект' : 'Новый проект') : 'Проекты'

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Content className={`${styles.sheetContent} pomodoroSheetContent`} size="3" width="100%" maxWidth="600px">
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              {view === 'list' ? (
                <span className={styles.headerSlot} />
              ) : (
                <IconButton
                  type="button"
                  size="3"
                  color="gray"
                  variant="surface"
                  aria-label="Назад"
                  onClick={() => setView(view === 'ruler' && rulerTarget === 'form' ? 'form' : 'list')}
                >
                  <ArrowLeft size={16} />
                </IconButton>
              )}
              <Dialog.Title size="4" mb="0" align="center" style={{ flex: 1 }}>{title}</Dialog.Title>
              <IconButton
                type="button"
                size="3"
                color="gray"
                variant="surface"
                aria-label="Закрыть"
                onClick={() => onOpenChange(false)}
              >
                <X size={16} />
              </IconButton>
            </Flex>
            {view === 'form' && (
              <Dialog.Description size="2" color="gray">
                Эмодзи и цвет видны на таймере и в списке.
              </Dialog.Description>
            )}

            {error && (
              <Text size="2" color="red">{error}</Text>
            )}

            {view === 'list' && (
              <Flex direction="column" gap="2">
                <ProjectRow
                  emoji={POMODORO_FALLBACK_EMOJI}
                  name={POMODORO_FREE_LABEL}
                  focusSeconds={settingsFocusSeconds}
                  accentColor={null}
                  selected={selectedProjectId == null}
                  onSelect={() => {
                    onSelect(null)
                    onOpenChange(false)
                  }}
                  onEdit={() => openRuler(settingsFocusSeconds, 'settings')}
                />
                {projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    emoji={project.emoji}
                    name={project.name}
                    focusSeconds={project.focus_seconds}
                    accentColor={project.accent_color}
                    selected={selectedProjectId === project.id}
                    onSelect={() => {
                      onSelect(project.id)
                      onOpenChange(false)
                    }}
                    onEdit={() => openEdit(project)}
                  />
                ))}
                <Button type="button" size="3" variant="surface" color="gray" onClick={openCreate}>
                  Новый проект
                </Button>
              </Flex>
            )}

            {view === 'form' && draft && (
              <Flex direction="column" gap="3">
                <Flex align="center" gap="3">
                  <EmojiPickerButton value={draft.emoji} onChange={(emoji) => setDraft({ ...draft, emoji })} />
                  <Box flexGrow="1">
                    <TextField.Root
                      size="3"
                      placeholder="Название"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </Box>
                </Flex>

                <ProjectColorField
                  value={draft.accentColor}
                  onChange={(accentColor) => setDraft({ ...draft, accentColor })}
                />

                <button
                  type="button"
                  className={styles.durationRow}
                  onClick={() => openRuler(draft.focusSeconds, 'form')}
                >
                  <Text weight="medium">Длительность</Text>
                  <Text color="gray">{formatFocusClock(draft.focusSeconds)}</Text>
                </button>

                <Flex gap="2">
                  {draft.id && (
                    <IconButton
                      type="button"
                      size="3"
                      color="red"
                      variant="surface"
                      aria-label="Удалить проект"
                      onClick={() => {
                        const project = projects.find((item) => item.id === draft.id)
                        if (project) setDeleteTarget(project)
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                  <Button
                    type="button"
                    size="3"
                    variant="solid"
                    style={{ flex: 1 }}
                    disabled={busy || !draft.name.trim()}
                    onClick={() => void saveDraft()}
                  >
                    Сохранить
                  </Button>
                </Flex>
              </Flex>
            )}

            {view === 'ruler' && (
              <Flex direction="column" gap="4" align="center">
                <Text className={styles.rulerValue} weight="bold">{formatFocusClock(rulerMinutes * 60)}</Text>
                <Box width="100%">
                  <Slider
                    size="3"
                    min={POMODORO_MIN_RECORDED_SECONDS / 60}
                    max={POMODORO_MAX_FOCUS_SECONDS / 60}
                    step={1}
                    value={[rulerMinutes]}
                    onValueChange={(next) => setRulerMinutes(next[0] ?? rulerMinutes)}
                    aria-label="Минуты фокуса"
                  />
                </Box>
                <Flex justify="between" width="100%">
                  <Text size="2" color="gray">{POMODORO_MIN_RECORDED_SECONDS / 60}</Text>
                  <Text size="2" color="gray">180 минут</Text>
                </Flex>
                <Button type="button" size="3" radius="full" variant="solid" disabled={busy} onClick={() => void applyRuler()}>
                  Готово
                </Button>
              </Flex>
            )}
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root open={deleteTarget != null} onOpenChange={(next) => { if (!next) setDeleteTarget(null) }}>
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>Удалить проект?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Сеансы останутся в общей статистике без этого проекта.
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button type="button" size="3" variant="surface" color="gray">Отмена</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button type="button" size="3" color="red" variant="solid" disabled={busy} onClick={() => void confirmDelete()}>
                Удалить
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}

function accentSelectValue(hex: string): string {
  return findRadixColor9PresetByHex(hex)?.id ?? '__custom__'
}

function colorInputValue(hex: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim()) ? hex.trim() : '#888888'
}

/** Тот же приём, что у цвета карточки дела: пресет в Select и нативный пикер. */
function ProjectColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <Flex align="center" gap="3">
      <Box className={styles.colorSelectWrap}>
        <Select.Root
          size="3"
          value={accentSelectValue(value)}
          onValueChange={(next) => {
            const preset = RADIX_COLOR_9_PRESETS.find((item) => item.id === next)
            if (preset) onChange(preset.hex)
          }}
        >
          <Select.Trigger aria-label="Цвет проекта" style={{ width: '100%' }} />
          <Select.Content position="popper">
            {accentSelectValue(value) === '__custom__' && (
              <Select.Item value="__custom__">Свой цвет</Select.Item>
            )}
            {RADIX_COLOR_9_PRESETS.map((preset) => (
              <Select.Item key={preset.id} value={preset.id}>
                <Flex align="center" gap="2">
                  <span className={styles.optionSwatch} style={{ backgroundColor: preset.hex }} aria-hidden />
                  {preset.label}
                </Flex>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Box>
      <label className={styles.colorInputWrap} style={{ backgroundColor: colorInputValue(value) }}>
        <span className={styles.visuallyHidden}>Свой цвет</span>
        <input
          type="color"
          className={styles.colorInputNative}
          aria-label="Свой цвет проекта"
          value={colorInputValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </Flex>
  )
}

type ProjectRowProps = {
  emoji: string
  name: string
  focusSeconds: number
  accentColor: string | null
  selected: boolean
  onSelect: () => void
  onEdit: () => void
}

function ProjectRow({ emoji, name, focusSeconds, accentColor, selected, onSelect, onEdit }: ProjectRowProps) {
  const fill = selected && accentColor ? accentColor : undefined
  const ink = fill ? textOnAccent(fill) : undefined
  return (
    <Flex
      align="center"
      gap="2"
      className={selected && !accentColor ? styles.rowSelectedNeutral : styles.row}
      style={fill ? { backgroundColor: fill, color: ink } : undefined}
    >
      <button type="button" className={styles.rowMain} onClick={onSelect}>
        <span className={styles.rowEmoji} aria-hidden>{emoji}</span>
        <span className={styles.rowText}>
          <Text weight="medium" style={ink ? { color: ink } : undefined}>{name}</Text>
          <Text size="2" style={ink ? { color: ink, opacity: 0.8 } : undefined} color={ink ? undefined : 'gray'}>
            {formatFocusClock(focusSeconds)}
          </Text>
        </span>
      </button>
      <IconButton
        type="button"
        size="3"
        variant="surface"
        color="gray"
        aria-label={`Изменить ${name}`}
        onClick={onEdit}
      >
        <Pencil size={16} />
      </IconButton>
    </Flex>
  )
}
