import type { BlockConfig, BlockType, MeasurementUnit, ValueJson } from '@/types/database'

export interface TemplateBlock {
  title: string
  block_type: BlockType
  config: BlockConfig | null
  default_value: ValueJson | null
}

export interface DeedTemplate {
  id: string
  name: string
  emoji: string
  category: string
  description: string
  blocks: TemplateBlock[]
}

function field(title: string, block_type: BlockType): TemplateBlock {
  return { title, block_type, config: null, default_value: null }
}
const text = (title: string) => field(title, 'text_paragraph')
const duration = (title: string) => field(title, 'duration')
const yesNo = (title: string) => field(title, 'yes_no')
const image = (title: string) => field(title, 'image')
const url = (title: string) => field(title, 'url')
function number(title: string, unit?: MeasurementUnit, defaultNumber?: number): TemplateBlock {
  return {
    ...field(title, 'number'),
    config: unit ? { unit } : null,
    default_value: defaultNumber === undefined ? null : { number: defaultNumber },
  }
}
const rub = (title: string) => number(title, { kind: 'preset', code: 'rub' })
function select(title: string, labels: string[], multiple = false): TemplateBlock {
  return {
    ...field(title, multiple ? 'multi_select' : 'single_select'),
    config: {
      // Идентификаторы заменяются при применении: шаблоны не разделяют опции с делами.
      options: labels.map((label, sort_order) => ({ id: `option-${sort_order}`, label, sort_order })),
      ...(multiple ? {} : { singleSelectUi: 'select' as const }),
    },
  }
}
function template(id: string, name: string, emoji: string, category: string, description: string, blocks: TemplateBlock[]): DeedTemplate {
  return { id, name, emoji, category, description, blocks }
}

/** Каталог без пользовательских данных; выбор только заполняет черновик редактора. */
export const DEED_TEMPLATES: DeedTemplate[] = [
  template('water', 'Вода', '💧', 'Здоровье', 'Добавляйте выпитую воду, чтобы видеть общее количество за день.', [number('Сколько выпили?', { kind: 'preset', code: 'ml' }, 250)]),
  template('meal', 'Приём пищи', '🍽️', 'Питание', 'Сохраняйте блюда и отмечайте, где вы едите.', [select('Какой приём пищи?', ['Завтрак', 'Обед', 'Ужин', 'Перекус']), text('Что ели?'), select('Где?', ['Дома', 'В заведении', 'С собой']), image('Фото')]),
  template('cooking', 'Приготовление еды', '🍳', 'Питание', 'Собирайте историю приготовленных блюд и удачные рецепты.', [text('Что приготовили?'), number('Сколько порций?'), url('Ссылка на рецепт')]),
  template('vegetables', 'Овощи и фрукты', '🥦', 'Питание', 'Отмечайте овощи и фрукты в своём питании.', [text('Что съели?'), select('Вид', ['Овощи', 'Фрукты', 'Ягоды', 'Зелень'], true)]),
  template('coffee', 'Кофе', '☕', 'Питание', 'Записывайте кофе, чтобы видеть количество чашек за день.', [text('Какой кофе?'), number('Сколько чашек?', { kind: 'custom', label: 'чашки', short: 'чаш.' }, 1)]),
  template('alcohol', 'Алкоголь', '🍷', 'Здоровье', 'Отмечайте употребление и дни без алкоголя.', [yesNo('Употребляли алкоголь?'), text('Что и сколько?')]),
  template('vitamins', 'Приём витаминов', '💊', 'Здоровье', 'Фиксируйте приём витаминов из своей схемы.', [text('Что приняли?'), yesNo('Приняли по своей схеме?')]),
  template('sleep', 'Сон', '🌙', 'Здоровье', 'Записывайте продолжительность сна вручную, если не используете автоматический трекер.', [duration('Сколько спали?')]),
  template('wake-up', 'Подъём вовремя', '⏰', 'Распорядок', 'Отмечайте, получается ли придерживаться выбранного времени подъёма.', [yesNo('Удалось встать в выбранное время?')]),
  template('phone-free', 'Время без телефона', '📵', 'Распорядок', 'Выделяйте время для занятий без телефона.', [duration('Сколько времени?'), text('Чем занимались?')]),
  template('shower', 'Душ', '🚿', 'Уход за собой', 'Отмечайте повседневный уход за собой.', [select('Когда?', ['Утром', 'Днём', 'Вечером'])]),
  template('teeth', 'Уход за зубами', '🪥', 'Уход за собой', 'Отмечайте выполненные шаги ухода за зубами.', [select('Что сделали?', ['Утренняя чистка', 'Вечерняя чистка', 'Зубная нить'], true)]),
  template('skincare', 'Уход за кожей', '🧴', 'Уход за собой', 'Сохраняйте историю ухода и используемых средств.', [select('Когда?', ['Утром', 'Вечером']), text('Какие средства использовали?')]),
  template('hair', 'Уход за волосами', '💇', 'Уход за собой', 'Записывайте процедуры по уходу за волосами.', [select('Что сделали?', ['Мытьё', 'Маска', 'Укладка', 'Стрижка'], true), text('Средства')]),
  template('makeup', 'Макияж', '💄', 'Уход за собой', 'Сохраняйте образы, которые хочется повторить.', [image('Фото образа'), text('Какие средства использовали?')]),
  template('reading', 'Чтение', '📚', 'Обучение', 'Отмечайте прочитанное и следите за продвижением по книге.', [text('Что читаете?'), number('Сколько страниц прочитали?', { kind: 'custom', label: 'страницы', short: 'стр.' })]),
  template('language', 'Изучение языка', '🗣️', 'Обучение', 'Сохраняйте занятия и виды языковой практики.', [text('Какой язык?'), select('Что практиковали?', ['Слова', 'Чтение', 'Аудирование', 'Разговор', 'Письмо', 'Грамматика'], true), duration('Сколько занимались?')]),
  template('course', 'Онлайн-курс', '🎓', 'Обучение', 'Запоминайте, что уже прошли и где продолжить обучение.', [text('Какой курс?'), text('Какой урок прошли?'), url('Ссылка на курс')]),
  template('music', 'Музыкальный инструмент', '🎸', 'Хобби', 'Записывайте практику и произведения, над которыми работаете.', [text('На чём играли?'), text('Что разучивали?'), duration('Сколько занимались?')]),
  template('creativity', 'Творчество', '🎨', 'Хобби', 'Собирайте свои творческие работы в одном месте.', [text('Что создали?'), select('Вид занятия', ['Рисунок', 'Текст', 'Фотография', 'Рукоделие', 'Другое']), image('Фото работы')]),
  template('project', 'Личный проект', '🛠️', 'Хобби', 'Сохраняйте конкретные шаги в своём проекте.', [text('Какой проект?'), text('Что сделали?'), duration('Сколько времени потратили?')]),
  template('planning', 'Планирование дня', '📝', 'Продуктивность', 'Запишите главные задачи перед началом дня.', [text('Что нужно сделать сегодня?')]),
  template('focus', 'Работа без отвлечений', '🎯', 'Работа', 'Учитывайте время сосредоточенной работы над задачами.', [text('Над какой задачей работали?'), duration('Сколько времени?')]),
  template('inbox', 'Разбор входящих', '📥', 'Продуктивность', 'Отмечайте разбор накопившихся писем, сообщений и задач.', [select('Что разбирали?', ['Почта', 'Сообщения', 'Задачи', 'Документы'], true), yesNo('Разбор завершён?')]),
  template('cleaning', 'Уборка', '🧹', 'Дом', 'Сохраняйте выполненные дела по уборке дома.', [select('Где навели порядок?', ['Кухня', 'Ванная', 'Спальня', 'Рабочее место', 'Другое']), text('Что сделали?')]),
  template('dishes', 'Мытьё посуды', '🧽', 'Дом', 'Отмечайте завершённую работу с посудой.', [select('Что сделали?', ['Помыли посуду', 'Загрузили посудомойку', 'Разобрали посудомойку'], true)]),
  template('clothes', 'Уход за одеждой', '👕', 'Дом', 'Записывайте стирку и другие дела по уходу за одеждой.', [select('Что сделали?', ['Стирка', 'Сушка', 'Глажка', 'Ремонт'], true), text('Какие вещи?')]),
  template('declutter', 'Разбор вещей', '📦', 'Дом', 'Отмечайте вещи, от которых освободили дом.', [text('Что разобрали?'), number('Сколько вещей убрали?'), select('Куда отправили?', ['Отдали', 'Продали', 'Переработка', 'Утилизация'], true)]),
  template('plants', 'Уход за растениями', '🪴', 'Дом', 'Сохраняйте историю ухода за каждым растением.', [text('Какое растение?'), select('Что сделали?', ['Полив', 'Пересадка', 'Подкормка', 'Обрезка'], true)]),
  template('groceries', 'Покупка продуктов', '🛒', 'Дом', 'Записывайте покупки и расходы на продукты.', [text('Что купили?'), rub('Сколько потратили?'), text('Где покупали?')]),
  template('repair', 'Мелкий ремонт', '🔧', 'Дом', 'Сохраняйте выполненный ремонт и расходы на него.', [text('Что починили?'), rub('Расходы на материалы'), image('Фото результата')]),
  template('expense', 'Расход', '💳', 'Финансы', 'Добавляйте расходы, чтобы понимать, куда уходят деньги.', [text('На что потратили?'), rub('Сумма'), select('Категория', ['Продукты', 'Транспорт', 'Дом', 'Развлечения', 'Другое'])]),
  template('subscriptions', 'Проверка подписок', '🔄', 'Финансы', 'Проверяйте платные сервисы и отмечайте решения по подпискам.', [text('Какая подписка?'), select('Решение', ['Оставить', 'Отменить', 'Подумать']), rub('Стоимость в месяц')]),
  template('savings', 'Накопления', '🐷', 'Финансы', 'Записывайте пополнения накоплений на выбранную цель.', [text('На какую цель?'), rub('Сколько отложили?')]),
  template('no-spend', 'День без покупок', '🪙', 'Финансы', 'Отмечайте дни, в которые ничего не покупали.', [yesNo('Удалось обойтись без покупок?')]),
  template('connection', 'Общение с близкими', '💬', 'Семья', 'Сохраняйте встречи и общие занятия с семьёй и друзьями.', [text('С кем?'), select('Как общались?', ['Встреча', 'Звонок', 'Видеозвонок', 'Переписка']), text('Что делали вместе?')]),
  template('mood', 'Настроение', '🙂', 'Самочувствие', 'Замечайте своё состояние и события, которые на него влияют.', [select('Как вы себя чувствуете?', ['Отлично', 'Хорошо', 'Обычно', 'Грустно', 'Тревожно']), text('Что повлияло?')]),
  template('weekly-review', 'Итоги недели', '📓', 'Самочувствие', 'Раз в неделю отмечайте главное и выбирайте, что изменить дальше.', [text('Что получилось?'), text('Что хочется изменить?')]),
]

/** Каждый выбор создаёт независимые конфиги и новые id вариантов. Ответы по умолчанию включены только там, где заданы явно. */
export function createBlocksFromTemplate(template: DeedTemplate) {
  return template.blocks.map((block) => {
    const config = block.config ? structuredClone(block.config) : null
    if (config?.options) {
      config.options = config.options.map((option) => ({
        ...option,
        // randomUUID недоступен в некоторых браузерах при открытии по LAN через HTTP.
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
      }))
    }
    return {
      title: block.title,
      block_type: block.block_type,
      config,
      is_required: false,
      recent_suggestions_enabled: true,
      show_in_preview: true,
      default_value_enabled: block.default_value !== null,
      default_value: block.default_value ? structuredClone(block.default_value) : null,
    }
  })
}

export const TEMPLATE_BLOCK_LABELS: Record<BlockType, string> = {
  number: 'Число', text_paragraph: 'Текст', single_select: 'Один из списка',
  multi_select: 'Несколько из списка', scale: 'Шкала', yes_no: 'Да/Нет',
  duration: 'Время', url: 'Ссылка URL', image: 'Картинка',
}
