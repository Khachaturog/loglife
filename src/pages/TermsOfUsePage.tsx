import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { Box, Flex, Heading, IconButton, Link, Separator, Text } from '@radix-ui/themes'
import layoutStyles from '@/styles/layout.module.css'

/** Публичная страница — доступна без авторизации (маршрут /terms). */
export function TermsOfUsePage() {
  const navigate = useNavigate()

  return (
    <Box>
      <Box
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'var(--color-background)',
        }}
      >
        <Flex align="center" gap="2" px="4" py="3" className={layoutStyles.pageContainer} style={{ maxWidth: '668px' }}>
          <IconButton
            size="3"
            color="gray"
            variant="surface"
            aria-label="Назад"
            onClick={() => navigate(-1)}
          >
            <ArrowLeftIcon />
          </IconButton>
          <Heading as="h1" size="5">
            Условия использования
          </Heading>
        </Flex>
      </Box>

      <Box p="4" className={layoutStyles.pageContainer}>
        <Flex direction="column" gap="5" pb="8">
          <Text size="2" color="gray">
            Последнее обновление: апрель 2026
          </Text>

          <Separator size="4" />

          <Section title="1. Сервис">
            <Text>
              Log Life — веб-приложение для учёта действий и привычек. Используя сервис, вы подтверждаете,
              что вам исполнилось 16 лет или вы действуете с согласия законного представителя.
            </Text>
          </Section>

          <Section title="2. Аккаунт и доступ">
            <Text>
              Вы обязаны хранить пароль в секрете и не передавать доступ к аккаунту третьим лицам.
              Вы несёте ответственность за действия, выполненные под вашей учётной записью.
            </Text>
          </Section>

          <Section title="3. Допустимое использование">
            <Text>Запрещается:</Text>
            <BulletList
              items={[
                'использовать сервис для нарушения законов или прав третьих лиц;',
                'пытаться получить несанкционированный доступ к данным других пользователей или к инфраструктуре;',
                'нагружать сервис автоматизированными запросами сверх разумного использования приложения.',
              ]}
            />
          </Section>

          <Section title="4. Доступность и изменения">
            <Text>
              Мы стремимся к стабильной работе сервиса, но не гарантируем бесперебойный доступ.
              Функции могут изменяться; существенные изменения условий отражаются на этой странице.
            </Text>
          </Section>

          <Section title="5. Ограничение ответственности">
            <Text>
              Сервис предоставляется «как есть». Мы не отвечаем за косвенный ущерб, упущенную выгоду
              или потерю данных по причинам вне нашего разумного контроля. Рекомендуем периодически
              экспортировать данные (CSV в профиле).
            </Text>
          </Section>

          <Separator size="4" />

          <Text size="2" color="gray">
            Вопросы по данным — см. также{' '}
            <Link asChild size="2" underline="hover">
              <RouterLink to="/privacy">Политику конфиденциальности</RouterLink>
            </Link>
            .
          </Text>
        </Flex>
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
        <Text key={item} size="2">
          • {item}
        </Text>
      ))}
    </Flex>
  )
}
