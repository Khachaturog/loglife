-- Факт короче 5 минут не храним: досрочный выход не должен копить пустые строки.
-- Первая миграция уже могла быть применена со старым CHECK (actual_seconds > 0).

DELETE FROM public.pomodoro_sessions
WHERE actual_seconds < 300;

ALTER TABLE public.pomodoro_sessions
  DROP CONSTRAINT IF EXISTS pomodoro_sessions_actual_seconds_check;

ALTER TABLE public.pomodoro_sessions
  ADD CONSTRAINT pomodoro_sessions_actual_seconds_check
  CHECK (actual_seconds >= 300 AND actual_seconds <= planned_seconds);

COMMENT ON TABLE public.pomodoro_sessions IS
  'Законченный фокус-сеанс. План и факт короче 5 минут в таблицу не попадают.';
