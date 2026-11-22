# Источники рисунков

Первая генерация: встроенный `image_gen`, прозрачный фон, 22 ноября 2026 года. Эталон — `scene-lab/public/art/fight/boxer-0.webp`. Выход без изменений: `inputs/walk-generation-v1.png`.

**Вариант отклонён при собственном отсмотре.** Даже после возврата исходного верха тела стопы почти не компенсировали поступательное движение корня. Замена рисунков меняла складки и оставляла скольжение. Параметры первого совмещения сохранены в `generation-v1-registration.json`. Итоговые GIF не используют пиксели генерации: четыре рисунка запечены из исходной стойки нативным ригом `rig.mjs`.

## Точный промпт

```
Use case: precise-object-edit. Asset type: registered 2D sprite animation source sheet for the existing fighting-game boxer. The attached boxer-0.webp is the authoritative master for appearance, anatomy, ink hatching, faded pink/brown palette, trousers and work boots. Make ONE transparent 2 by 2 sheet of FOUR full-body poses of this EXACT man, facing screen right, in boxing guard. Same native-scale rough detailed Comix Zone / gritty criminal comic ink, no redesign, no smoothing, no glossy digital paint. Each quadrant has identical image scale, head size, hips origin and floor baseline, ample transparent padding. Ideal sheet 1024 x 1152, four equal cells 512 x 576, figure roughly 493 pixels tall in each. No labels, no panel borders, no floor, no shadows, real transparency.
This is a SHORT BOXING STEP-AND-SLIDE forward, not a normal walk, not running, not an attack. His front (screen right) foot always remains in front of the rear (screen left) foot; never cross legs. Fists stay close to the face in guard; do not punch or swing arms. Upper body and face stay essentially identical to the reference, same bent elbows, torso angle and belt height. Tiny weight transfer only. Both boots face generally right.
TOP LEFT A: EXACT original neutral wide guard, both boots grounded, matching reference.
TOP RIGHT B: first half-step forward: rear boot planted at its original position, front boot advanced a SMALL amount and lifted only 6 pixels off the floor, slightly bent knee, hips stable. This is the front foot transfer, not a high knee.
BOTTOM LEFT C: front boot has landed about 35-40 pixels forward from its original position, rear boot still planted in original place, stance a little wider, weight stable, knees softly bent.
BOTTOM RIGHT D: front boot planted; rear heel and rear boot slide forward to restore original stance width, rear boot lifted only 4 pixels, hips and shoulders stable. The next pose is A shifted forward.
Keep the two legs visibly separate, the crotch and hips joined anatomically, trouser folds inked like the reference, boots intact and same length, no extra limbs or floating pieces. Avoid huge strides, bouncing, squatting, whole-body rotation, changing identity, motion blur, tweening, double contours or soft edges. The generated legs and hips will be locally composited with the original upper body, so prioritize compatible waist shape and faithfully matching original lower-body hatching.
```
