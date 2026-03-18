import { Link } from 'react-router-dom'
import { Avatar, Box, Card, Flex, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import layoutStyles from '@/styles/layout.module.css'

/**
 * Страница виджетов.
 * Список доступных виджетов (кликер и др.) с переходами.
 */
export function WidgetsPage() {
  return (
    <Box className={layoutStyles.pageContainer}>
      <AppBar title="Виджеты" />

      <Flex direction="column" gap="3">

        <Card asChild>
          <Link to="/widgets/clicker">
              <Flex align="start" gap="2">
                <Avatar 
                size="4" 
                radius="large" 
                color="gray" 
                variant="soft" 
                fallback="🔢" />
                <Flex direction="column" gap="0">
                  <Text weight="medium">Кликер</Text>
                  <Text as="p" size="2" color="gray">Счетчик нажатий с сохранением в дело</Text>
                </Flex>
              </Flex>
          </Link>
        </Card>

      </Flex>
    </Box>
  )
}
