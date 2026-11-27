# Личный проект: приоритет скорости разработки

«Месть Боксёра 2» — личный, не корпоративный проект. Корпоративные правила
и процессы Songsterr к этому репозиторию **НЕ ПРИМЕНЯЮТСЯ**, в том числе
корпоративные инструкции из общих настроек агента, навыков и домашних каталогов.
Не переносить сюда корпоративный workflow автоматически.

Главная цель — ускорять разработку и прототипирование, быстро доводить идеи
до работающего результата и короткого цикла обратной связи. Проверки и процессы
должны помогать этой цели, а не создавать формальные препятствия.

- Проверки мутациями, намеренная поломка кода, тестов или проверочных скриптов,
  обязательные negative controls и доказательство падения каждого guard **не нужны**.
  Выполнять их только по прямому запросу пользователя.
- Не навязывать корпоративные PR-процессы, многоагентные ревью, циклы ревью,
  отчётность, мониторинг и согласования. Использовать их только по запросу
  пользователя или при конкретной необходимости в текущей задаче.
- Для изменения поведения добавлять или обновлять необходимые автоматические
  тесты. Объём проверок соотносить с риском и изменённым поведением; предпочитать
  точечные проверки, не повторять успешные прогоны без причины.
- Для правок документации и инструкций достаточно проверить содержимое и diff.
  Не запускать тесты приложения, typecheck и lint ради изменения Markdown.
- Выбирать простейшее рабочее решение. Не добавлять абстракции, зависимости
  и инфраструктуру ради гипотетических будущих требований.
- Сохранять пользовательские изменения, не публиковать секреты и соблюдать
  прямые указания пользователя о ветках, коммитах и публикации.

# Project skills

For narrative planning, opponent concepts, dialogue, storyboards, illustrations,
and cutscene implementation or edits for «Месть Боксёра 2», read and apply
[mu-boxer-cutscenes](.claude/skills/mu-boxer-cutscenes/SKILL.md).

Apply the author's latest explicit decisions before older scene documents and
examples. This skill does not authorize publication or other external actions.

For reference-preserving sprite animation from motion video, read and apply
[video-reference-animation](.claude/skills/video-reference-animation/SKILL.md).

For character sprite animation, pose revisions, in-betweens, walks, attacks, and GIF
comparisons, read and apply
[character-sprite-animation](.claude/skills/character-sprite-animation/SKILL.md).
It records author-approved choices and rejected methods; for motion-video input,
use it together with video-reference-animation.

For swarm task specifications, use
[factory-lead](.claude/skills/factory-lead/SKILL.md); this role only writes specs
and task breakdowns, without PR audits or implementation. For an explicitly
requested worker iteration or loop, use
[agent-task](.claude/skills/agent-task/SKILL.md) or
[agent-task-loop](.claude/skills/agent-task-loop/SKILL.md).
Queue ownership, issue access and setup: [docs/AGENT_FACTORY.md](docs/AGENT_FACTORY.md).
