# Notification System

Система нотифікацій замінює стандартні `alert()` на красиві Bootstrap Vue алерти, які стакаються зверху справа сторінки.

## Особливості

- ✅ Стакаються зверху справа (400px ширина)
- ✅ Автоматично зникають через 6 секунд
- ✅ Плавна анімація появи/зникнення (fade)
- ✅ Підтримка всіх Bootstrap варіантів кольорів
- ✅ Responsive дизайн для мобільних пристроїв
- ✅ Можливість закрити вручну

## Використання

### Глобальний API

Система надає глобальний об'єкт `window.$notify` з наступними методами:

```javascript
// Success notification (зелений)
window.$notify.success('Success!', 'Operation completed successfully')

// Error notification (червоний)
window.$notify.error('Error!', 'Something went wrong')

// Warning notification (жовтий)
window.$notify.warning('Warning!', 'Please check your input')

// Info notification (синій)
window.$notify.info('Info', 'Additional information')

// Primary notification (основний синій)
window.$notify.primary('Primary', 'Primary message')

// Secondary notification (сірий)
window.$notify.secondary('Secondary', 'Secondary message')
```

### Приклади заміни alert()

**Було:**
```javascript
alert('Cannot move unit forward: ' + error.message)
```

**Стало:**
```javascript
window.$notify.error('Move Failed', `Cannot move unit forward: ${error.message}`)
```

## Варіанти кольорів

| Варіант | Колір | Використання |
|---------|-------|--------------|
| `success` | Зелений | Успішні операції |
| `error` | Червоний | Помилки |
| `warning` | Жовтий | Попередження |
| `info` | Синій | Інформаційні повідомлення |
| `primary` | Основний синій | Важливі повідомлення |
| `secondary` | Сірий | Другорядні повідомлення |

## Технічні деталі

### Компоненти
- `NotificationSystem.vue` - основний компонент системи
- `NotificationTest.vue` - тестовий компонент для демонстрації

### Стилі
- `notification-system.scss` - стилі для позиціонування та анімації
- Імпортується в `main.js`

### Залежності
- Bootstrap 5 CSS (лише класи `alert`/`btn-close`/`fade`/`show`) — компонент чисто Vue + CSS, без bootstrap-vue-next та Bootstrap JS

## Налаштування

### Зміна тривалості показу
За замовчуванням нотифікації показуються 6 секунд. Щоб змінити:

```javascript
// В NotificationSystem.vue, метод addNotification
const addNotification = (title, message = '', variant = 'info', duration = 6000) => {
  // duration в мілісекундах
}
```

### Зміна позиції
В `notification-system.scss`:

```scss
.notification-container {
  position: fixed;
  top: 20px;      // відступ зверху
  right: 20px;    // відступ справа
  max-width: 400px; // максимальна ширина
}
```

## Міграція з alert()

Всі `alert()` виклики в проекті замінено на відповідні нотифікації:

- `GameMapBlock.vue` - помилки переміщення юнітів
- `MovesListBlock.vue` - помилки додавання юнітів та дій
- `MovesTableBlock.vue` - помилки завантаження даних
- `LevelBuilder.vue` - помилки генерації мап
- `Playground.vue` - повідомлення про скидання гри
