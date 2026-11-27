# Фабрика задач mu-boxer-2

Три роли перенесены и адаптированы из
[`enikey87/mu-sim@6e716b6`](https://github.com/enikey87/mu-sim/tree/6e716b66a2f86e0123e276bf2707fbe1f664a109/.claude/skills).
Лицензия исходных инструкций: [MIT](licenses/mu-sim-skills.txt).

- [factory-lead](../.claude/skills/factory-lead/SKILL.md) — ТЗ, декомпозиция,
  зависимости и приёмка. Только постановщик; аудит и процессы mu-sim не перенесены.
- [agent-task](../.claude/skills/agent-task/SKILL.md) — одна задача из `task`,
  восстановление работы, реализация, проверки и PR/мерж.
- [agent-task-loop](../.claude/skills/agent-task-loop/SKILL.md) — цикл исполнителя
  с новым рабочим контекстом на задачу и ожиданием пустой очереди.

Claude: `/factory-lead <идея>`, `/agent-task <имя>`, `/agent-task-loop <имя>`.
Codex: `$factory-lead`, `$agent-task <имя>`, `$agent-task-loop <имя>`.
Канонический текст — `.claude/skills/`; `.agents/skills/` и `.claude/commands/`
ссылаются на него. Копии вне репозитория для этих ролей не нужны.
Перенос навыков сам по себе не запускает рой или расписание.

## Очередь

Задачи создаются от имени владельца `enikey87`. Исполнители берут только его
открытые issues с `task`; `blocked`, `idea`, `design` и незакрытая зависимость
исключают задачу из работы. Метка `for:<имя>` — рекомендация роли,
`agent:<имя>` — аннотация текущего исполнителя.
Метки `task`, `blocked`, `idea`, `design` уже созданы в репозитории;
свою `agent:<имя>` исполнитель создаёт при первом захвате.

Все роли конкурируют за **одну** удалённую ветку `feature/agent-issue-N`.
Первый обычный push пустого `claim:` от свежего `main` захватывает задачу;
последний `claim:`/`adopt:` хранит UUID запуска. Аренда — 60 минут тишины
в ветке и PR. Принятие — обычный push `adopt:` от точного увиденного tip;
force push запрещён. Локальные ветки и worktree уникальны для каждого запуска.
В отличие от исходного протокола, имя роли не входит в удалённый ref: иначе
две разные роли могли одновременно захватить одну issue.

## Доступ к issues

27 ноября 2026 через GitHub API включено `collaborators_only` на шесть месяцев.
Повторный GET подтвердил `expires_at: 2027-05-27T10:05:41Z`.
На момент настройки единственный участник организации и collaborator —
`enikey87` с ролью admin. Поэтому сейчас новые issues доступны владельцу.

Это временное **общее ограничение взаимодействий** GitHub: оно также касается
комментариев и создания PR. Оно пропускает пользователей с write-доступом;
добавление collaborators изменит круг допущенных. GitHub не предоставляет
бессрочную отдельную ACL «создание issues только одному логину».
Проверка автора в навыке исполнителя сохраняет очередь владельца даже после
истечения настройки, но не запрещает посторонним открыть issue на GitHub.

Состояние: `gh api repos/gorecode/mu-boxer-2/interaction-limits`.
Продление владельцем (максимум шесть месяцев, автоматическое продление не настроено):

```sh
gh api --method PUT repos/gorecode/mu-boxer-2/interaction-limits \
  -f limit=collaborators_only -f expiry=six_months
```

Основание: [GitHub — interaction limits](https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository).

## Рабочие копии и проверки

Приложение и npm-команды находятся в `scene-lab/`, не в корне. CI:
`npm run check` и браузерные тесты; Pages публикует успешный `main`.
Рабочие ветки начинаются с `feature/`, чтобы попадать также под push-триггер CI.
Правки только инструкций проверяются чтением, ссылками и diff, без тестов игры.

LFS не требует нового пароля в worktree. В нём достаточно `git lfs pull`.
В отдельном checkout на VPS используйте существующий helper:

```sh
git lfs install --local
git config --local credential.helper ''
git config --local --add credential.helper /home/enikey/projects/mu-boxer-rnd/migration/private/git-lfs-credential.py
git config --local credential.useHttpPath true
git config --local lfs.https://lfs.77-42-113-122.nip.io/api/gorecode/mu-boxer-2.locksverify false
git lfs pull
```

Путь helper специфичен для VPS; на другой машине используйте системное хранилище
по корневому README. Не читайте/не выводите ответ helper или файл пароля.
