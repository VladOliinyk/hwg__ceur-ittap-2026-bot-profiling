# Hexagonal Game Engine — utils layer

Низькорівневий набір утиліт для гексагональної варгейм-механіки. Authoritative API живе в `GameState`; легасі окремої `MovementSystem` прибрано — рух/атаки/turnable виконує `GameState` напряму.

## Структура

```
src/utils/
├── hexUtils.js              # Гексагональна сітка (axial q/r, distance, neighbours)
├── gameUnits.js             # Класи юнітів + UNIT_TYPES реєстр
├── gameHex.js               # Розширений клас гекса
├── gameState.js             # Authoritative engine state + mutation API
├── gamePersistence.js       # localStorage save/load
├── actionEconomy.js         # Cost розрахунки та turntable matching
├── diceUi.js                # Helpers для відображення d6 у UI
├── uiMoveTable.js           # Нормалізація moves table
├── movesTableScope.js       # Highlighting / table scope для UI
└── index.js                 # Re-export
```

## Основні компоненти

### 1. Гексагональна сітка (`hexUtils.js`)

- **Координати:** axial (q, r) — odd-r offset
- `hexDistanceOffset(a, b)` — відстань між гексами в offset координатах (коректна odd-r формула)
- `hexNeighbors(hex)` — шість сусідів
- `hexesInRing(center, radius)` — гекси в кільці навколо центра
- **Напрямки:** 6 напрямків (0–5), 0 = північ (↑), pointy-top

### 2. Ігрові юніти (`gameUnits.js`)

`createUnit(typeId, overrides)` повертає об'єкт юніта; `UNIT_TYPES` зберігає базові статистики.

```javascript
const armored = createUnit('armored', {
  name: 'My Tank',
  player: 'player1',
  position: { q: 2, r: 3 },
  facing: 0
})
```

Властивості: `position`, `facing`, `health`, `movement`, `attackRange`, `attackPower`.
Методи юніта (на класі `GameUnit`): `moveTo`, `turnTo`, `attack`, `canMove`, `canAttack` — використовуються engine-ом, не UI-ом напряму.

### 3. Розширені гекси (`gameHex.js`)

`GameHex` несе terrain, overlay-прапорці (`spawn`, `base`), reachability, movement cost, текстуру для рендера.

### 4. Authoritative engine (`gameState.js`)

`GameState` — єдина мутувальна точка для правил гри. UI-шар і headless simulation викликають його через `gameController` / `applyCommand`.

```javascript
const gameState = new GameState({
  width: 8,
  height: 6,
  currentPlayer: 'player1',
  mapData,
  terrainTypes,
  unitsData,
  turntableData
})
```

Основні методи (мутувальні): `moveUnit`, `updateUnitFacing`, `performAttack`, `performReload`, `rollDice`, `endTurn`, `revertTo`, `loadHistoryJSON`.
Read-only: `getAllUnits`, `getHex`, `canPerformAction`, `getAuthoritativePathCost`, `getDirectionalReachableCosts`, `getAllowedActions`.

### 5. Action economy (`actionEconomy.js`)

Чисті функції для розрахунку cost / terrain difficulty та зіставлення turntable рядків. Engine викликає їх з `canPerformAction` / `moveUnit`.

## Приклад

```javascript
import { GameState, createUnit } from './utils/index.js'

const gameState = new GameState({ width: 8, height: 6, currentPlayer: 'player1' })

const armored = createUnit('armored', {
  name: 'My Tank',
  player: 'player1',
  position: { q: 2, r: 2 }
})

gameState.addUnit(armored, 2, 2)
gameState.resetPlayerTurn('player1')
gameState.rollDice(3)
gameState.moveUnit(armored.id, 3, 2)
gameState.updateUnitFacing(armored.id, 2)
gameState.performAttack(armored.id, 5, 3, { diceResult: 3 })
```

## Типи юнітів (`UNIT_TYPES`)

- **armored** — health 100, movement 2, attack 50
- **infantry** — health 60, movement 3, attack 30
- **artillery** — health 80, movement 1, attack 70, range 3
- **scout** — health 40, movement 4, attack 20

## Типи місцевості (defaults)

- **plains** — cost 1
- **forest** — cost 2
- **water** — cost 3
- **mountain** — cost 4
- **desert** — cost 2
- **mud** — cost 3

Конкретні значення для рівня — у `<level>_terrain.json`; engine читає `terrainTypes` під час init.

### Прохідність на рівнях

На дошках рівня (`mapData` + `terrainTypes`) тип терену блокує LOS прямого вогню, розміщення юніта і рух як «стіна» **лише** коли він явно задає `passable: false` (opt-in). Тип без поля `passable` завжди прохідний — назва (`water`, `mountain`) сама собою нічого не блокує. Звичайна складність руху моделюється через `terrainDifficulty` терену проти `maxTerrainDifficulty` юніта (гекс недосяжний, коли `terrainDifficulty > maxTerrainDifficulty`), а не через `passable`.

## Headless simulation

Для batch-прогонів використовуй `src/domain/simulation/runMatch.js`. Він обгортає той самий `GameState` через `applyCommand` і RNG з `createRng(seed)`, без UI.

## Інтеграція з Vue

UI-шар не мутує `GameState` напряму. Vue-компоненти диспатчать команди через `src/ui/playground/gameController.js`. Спільні precondition guards + notifications живуть у `src/ui/playground/commandReactions.js`.
