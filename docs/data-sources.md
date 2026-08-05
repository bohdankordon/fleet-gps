# Источники данных eQuGPS

## Подтверждённые источники

| Хост | Endpoint | Назначение MVP |
| --- | --- | --- |
| `trace.equgps.com` | `POST /session` | Получение session token в памяти процесса |
| `trace.equgps.com` | `GET /devices` | Список и статус устройств |
| `trace.equgps.com` | `GET /positions` | Последние позиции |
| `trace.equgps.com` | исторический `GET /positions` | Резервный источник маршрута и приблизительного пробега |
| `gps.equgps.com` | `POST /api/devices/runs` | Быстрый дневной пробег dashboard |
| `gps.equgps.com` | `POST /api/devices/info`, `mode1` | Подробная статистика машины |
| `gps.equgps.com` | `POST /api/devices/info`, `mode2` | События скорости |
| `gps.equgps.com` | `POST /api/devices/routes-new` | Детальный маршрут по запросу пользователя |

Официальные `/reports/route` и `/reports/summary` в исследовании оказались ненадёжными, поэтому в MVP не используются.

`/runs` используется для быстрого dashboard. `mode1.dataPositions.distance` — основной источник подробной статистики; `routes-new` загружается только при открытии маршрута. В `mode2` скорость уже измеряется в км/ч. `mode1.maxSpeed` — числовая строка в узлах. Дистанция приходит в метрах.

Web API недокументирован и изолируется адаптером `equgps`: остальная система работает с нормализованными контрактами, а не с transport-форматами web API.

## Fallback

| Недоступный источник | Действие |
| --- | --- |
| `/runs` | Загрузить `mode1` по выбранной машине |
| `mode1` | Рассчитать приблизительный пробег по historical positions |
| `mode2` | Использовать собственные сохранённые нарушения |
| `routes-new` | Построить маршрут по historical positions |

Fallback помечается в API как деградированный источник: приблизительный результат не должен выдаваться за точную отчётную величину.
