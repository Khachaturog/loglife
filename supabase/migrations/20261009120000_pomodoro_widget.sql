-- Виджет помодоро: настройки «без проекта», проекты и сеансы фокуса.
-- Сеансы не связаны с делами и записями форм.

CREATE TABLE public.pomodoro_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_seconds int NOT NULL DEFAULT 1500
    CHECK (focus_seconds >= 60 AND focus_seconds <= 10800),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pomodoro_settings IS
  'Дефолтная длительность фокуса для режима «Без проекта». Одна строка на пользователя.';

CREATE TABLE public.pomodoro_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 80),
  emoji text NOT NULL CHECK (char_length(btrim(emoji)) > 0 AND char_length(emoji) <= 16),
  accent_color text NOT NULL CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  focus_seconds int NOT NULL
    CHECK (focus_seconds >= 60 AND focus_seconds <= 10800),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pomodoro_projects IS
  'Проект помодоро: имя, эмодзи, цвет и дефолт минут для будущих сеансов.';

CREATE TABLE public.pomodoro_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.pomodoro_projects(id) ON DELETE SET NULL,
  planned_seconds int NOT NULL CHECK (planned_seconds >= 300),
  actual_seconds int NOT NULL CHECK (actual_seconds > 0 AND actual_seconds <= planned_seconds),
  status text NOT NULL CHECK (status IN ('completed', 'stopped')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL CHECK (ended_at >= started_at),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pomodoro_sessions IS
  'Законченный фокус-сеанс. План короче 5 минут в таблицу не попадает.';

CREATE INDEX idx_pomodoro_projects_user_id
  ON public.pomodoro_projects (user_id, created_at DESC);

CREATE INDEX idx_pomodoro_sessions_user_started
  ON public.pomodoro_sessions (user_id, started_at DESC);

CREATE INDEX idx_pomodoro_sessions_project_id
  ON public.pomodoro_sessions (project_id);

ALTER TABLE public.pomodoro_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pomodoro_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pomodoro_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pomodoro_settings_select_own" ON public.pomodoro_settings
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_settings_insert_own" ON public.pomodoro_settings
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_settings_update_own" ON public.pomodoro_settings
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_settings_delete_own" ON public.pomodoro_settings
  FOR DELETE USING ((select auth.uid()) = user_id);

CREATE POLICY "pomodoro_projects_select_own" ON public.pomodoro_projects
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_projects_insert_own" ON public.pomodoro_projects
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_projects_update_own" ON public.pomodoro_projects
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_projects_delete_own" ON public.pomodoro_projects
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Сеанс можно привязать только к своему проекту или оставить без проекта.
CREATE POLICY "pomodoro_sessions_select_own" ON public.pomodoro_sessions
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "pomodoro_sessions_insert_own" ON public.pomodoro_sessions
  FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.pomodoro_projects p
        WHERE p.id = project_id AND p.user_id = (select auth.uid())
      )
    )
  );
CREATE POLICY "pomodoro_sessions_update_own" ON public.pomodoro_sessions
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.pomodoro_projects p
        WHERE p.id = project_id AND p.user_id = (select auth.uid())
      )
    )
  );
CREATE POLICY "pomodoro_sessions_delete_own" ON public.pomodoro_sessions
  FOR DELETE USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pomodoro_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pomodoro_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pomodoro_sessions TO authenticated;
