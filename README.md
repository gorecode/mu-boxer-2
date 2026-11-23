# Месть Боксёра 2

[Открыть сборку в GitHub Pages](https://gorecode.github.io/mu-boxer-2/)

Свежая копия `gorecode/mu-boxer`, ветка `main`, снимок
`89478438de3e9f4b80afb41c0f0473a4556320f3`. История старого репозитория не переносилась.

## Запуск игры

Нужны Node.js 24 или новее и установленный Git LFS. После клонирования
настройте доступ и скачайте готовые WebP; исходные PNG для запуска не нужны.

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/gorecode/mu-boxer-2.git
cd mu-boxer-2
git lfs install --local
git config credential.useHttpPath true
git config credential.https://lfs.77-42-113-122.nip.io/api/gorecode/mu-boxer-2.username mu-boxer-2
git config lfs.https://lfs.77-42-113-122.nip.io/api/gorecode/mu-boxer-2.locksverify false
git lfs pull --include="*.webp" --exclude=""
cd scene-lab
npm ci
npm run dev -- --port 3000
```

При скачивании Git запросит пароль LFS. Бой: http://localhost:3000/fight.html.
Подробнее об управлении и стенде: [scene-lab/README.md](scene-lab/README.md).

## Изображения в Git LFS

PNG в `assets/` и все WebP хранятся на собственном LFS-сервере. `.lfsconfig` содержит
адрес сервера, `.gitattributes` — правила хранения. Пароли в репозиторий не добавляются.

Для скачивания всех изображений, включая исходные PNG, выполните в корне репозитория:

```bash
git lfs install --local
git config credential.useHttpPath true
git config credential.https://lfs.77-42-113-122.nip.io/api/gorecode/mu-boxer-2.username mu-boxer-2
git config lfs.https://lfs.77-42-113-122.nip.io/api/gorecode/mu-boxer-2.locksverify false
git lfs pull
```

Пароль вводится по запросу Git. Для сохранения используйте системное хранилище
учётных данных (например, Git Credential Manager); пароль нужно получить у владельца.
Обычный `git push` отправляет новые LFS-объекты через установленный pre-push hook.
Блокировки файлов сервером не поддерживаются.

В GitHub Actions используются repository secrets `LFS_USERNAME` и `LFS_PASSWORD`.
Проверка LFS скачивает исходный PNG и сверяет SHA-256. Workflow приложения
скачивает WebP из LFS перед сборкой и проверяет, что это изображения, а не указатели.
Для проверки соответствия ходьбы утверждённым кадрам workflow приложения также скачивает четыре PNG из `walk-keypose-preview/frames/`; остальные исходные PNG для сборки не скачиваются. Для CI в PR из fork потребуется отдельно
решить доступ к LFS: repository secrets в такие PR не передаются.

Основной workflow также публикует успешный `main` в GitHub Pages.
