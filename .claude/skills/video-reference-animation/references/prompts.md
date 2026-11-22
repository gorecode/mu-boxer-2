# Промпты испробованных методов

Использован встроенный imagegen, режим редактирования. Для новых иллюстраций продолжай использовать доступный генератор; риг и упаковка используют код. Эти промпты не являются гарантией точного сохранения пикселей.

## Лист из оригинальных концов движения — отбраковка

Вход 1: неизменённый исходный idle с полями. Вход 2: исходный контактный рисунок с полями. Запрошена прозрачность.

```text
IMAGE 1 is the EXACT established character artwork and idle endpoint.
IMAGE 2 is the EXACT established straight-punch contact endpoint.
Create a transparent 4-column 2-row sprite sheet with eight equal cells:
exact idle; early far-arm motion; half extension; exact contact;
initial recoil; half retracted; nearly idle; exact idle repeat.
Preserve original face, shirt folds, boots, proportions, coarse ink texture,
muted colors and line thickness. No new master, finer detail or beautification.
Only the far arm punches; the near fist stays at the chest.
Arm lengths and maximum fist reach come from IMAGE 2. Keep planted feet
and fixed padding. No background, floor, shadow, labels or motion blur.
```

Наблюдение: модель всё равно перерисовала части фигуры и оставила полупрозрачный фон. Повторная генерация ради удаления фона не исправляет дрейф внешности.

## Локальный ремонт рига — ограниченный эксперимент

Вход 1: запечённый промежуточный кадр рига из исходных текстур. Вход 2: оригинальная стойка. Запрошена прозрачность.

```text
IMAGE 1 is the EDIT TARGET, an original-texture sprite prototype.
IMAGE 2 is the definitive original style reference.
Repair only the moving arm's elbow join and wrist anatomy. Keep exactly
its shoulder, elbow, wrist and fist positions, lengths and silhouette.
Preserve the guard arm and every other part of IMAGE 1: exact face,
shirt folds, pants, boots, colors, coarse linework and canvas framing.
Do not redraw or enhance the whole character. Actual alpha transparency,
no matte, halo, ground shadow or blur. Only the repaired elbow/wrist artwork
will be composited locally over the original sprite.
```

Наблюдение: нужная малая область может быть полезна; полный результат генерации не следует подставлять вместо исходного тела. В данном джебе чистый риг после исправления проекции оказался предпочтительнее ремонта.
