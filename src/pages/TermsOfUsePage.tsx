import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Flex, Heading, Link, Separator, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import layoutStyles from '@/styles/layout.module.css'

/** Публичная страница — доступна без авторизации (маршрут /terms). */
export function TermsOfUsePage() {
  const navigate = useNavigate()

  return (
    <Box
      className={layoutStyles.pageContainer}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <AppBar onBack={() => navigate(-1)} title="Условия использования" />

      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Box pb="8">
          <Flex direction="column" gap="5">
          <Text size="2" color="gray">
            Последнее обновление: апрель 2026
          </Text>

          <Section title="1. Сервис">
            <Text>
              Log Life — веб-приложение для\u00a0учёта действий и привычек. Используя сервис, вы подтверждаете,
              что вам исполнилось 16 лет или вы действуете с\u00a0согласия законного представителя.
            </Text>
          </Section>

          <Section title="2. Аккаунт и доступ">
            <Text>
              Вы обязаны хранить пароль в\u00a0секрете и не передавать доступ к\u00a0аккаунту третьим лицам.
              Вы несёте ответственность за\u00a0действия, выполненные под\u00a0вашей учётной записью.
            </Text>
          </Section>

          <Section title="3. Допустимое использование">
            <Text>Запрещается:</Text>
            <BulletList
              items={[
                'использовать сервис для\u00a0нарушения законов или прав третьих лиц;',
                'пытаться получить несанкционированный доступ к\u00a0данным других пользователей или\u00a0к\u00a0инфраструктуре;',
                'нагружать сервис автоматизированными запросами сверх\u00a0разумного использования приложения.',
              ]}
            />
          </Section>

          <Section title="4. Доступность и изменения">
            <Text>
              Мы стремимся к\u00a0стабильной работе сервиса, но не гарантируем бесперебойный доступ.
              Функции могут изменяться; существенные изменения условий отражаются на\u00a0этой странице.
            </Text>
          </Section>

          <Section title="5. Ограничение ответственности">
            <Text>
              Сервис предоставляется «как есть». Мы не отвечаем за\u00a0косвенный ущерб, упущенную выгоду
              или потерю данных по\u00a0причинам вне\u00a0нашего разумного контроля. Рекомендуем периодически
              экспортировать данные (CSV в\u00a0профиле).
            </Text>
          </Section>

          <Separator size="4" />

          <Text size="2" color="gray">
            Вопросы по\u00a0данным — см.\u00a0также{' '}
            <Link asChild size="2" underline="hover">
              <RouterLink to="/privacy">Политику конфиденциальности</RouterLink>
            </Link>
            .
          </Text>
          </Flex>
        </Box>
      </Box>
    </Box>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="3" weight="medium">
        {title}
      </Heading>
      {children}
    </Flex>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <Flex direction="column" gap="1" pl="3">
      {items.map((item) => (
        <Text key={item} size="3">
          • {item}
        </Text>
      ))}
    </Flex>
  )
}
