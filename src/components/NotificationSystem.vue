<template>
  <div class="notification-container">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      :class="`alert alert-${notification.variant} alert-dismissible fade show`"
      role="alert"
    >
      <strong>{{ notification.title }}</strong>
      <div v-if="notification.message">{{ notification.message }}</div>
      <button
        type="button"
        class="btn-close"
        @click="removeNotification(notification.id)"
        aria-label="Close"
      ></button>
    </div>
  </div>
</template>

<script>
import { ref, onBeforeUnmount } from 'vue'

export default {
  name: 'NotificationSystem',
  setup() {
    const notifications = ref([])
    let nextId = 1
    const autoCloseTimers = new Map()

    const notificationText = (value) => {
      if (value == null) return ''
      return typeof value === 'string' ? value : String(value)
    }

    const addNotification = (title, message = '', variant = 'info', duration = 6000) => {
      const notification = {
        id: nextId++,
        title: notificationText(title),
        message: notificationText(message),
        variant,
        show: true
      }

      notifications.value.push(notification)

      // Auto dismiss after duration
      const timerId = setTimeout(() => {
        autoCloseTimers.delete(notification.id)
        removeNotification(notification.id)
      }, duration)
      autoCloseTimers.set(notification.id, timerId)
    }

    const removeNotification = (id) => {
      const timerId = autoCloseTimers.get(id)
      if (timerId !== undefined) {
        clearTimeout(timerId)
        autoCloseTimers.delete(id)
      }
      const index = notifications.value.findIndex(n => n.id === id)
      if (index > -1) {
        notifications.value.splice(index, 1)
      }
    }

    // Warn if a second instance mounts while one is already registered
    if (typeof window !== 'undefined' && window.$notify) {
      console.warn('NotificationSystem: window.$notify already defined — mount NotificationSystem only once (in App.vue). The previous instance\'s handlers will be overwritten.')
    }

    // Expose methods globally
    const api = {
      success: (title, message) => addNotification(title, message, 'success'),
      error: (title, message) => addNotification(title, message, 'danger'),
      warning: (title, message) => addNotification(title, message, 'warning'),
      info: (title, message) => addNotification(title, message, 'info'),
      primary: (title, message) => addNotification(title, message, 'primary'),
      secondary: (title, message) => addNotification(title, message, 'secondary')
    }

    if (typeof window !== 'undefined') {
      window.$notify = api
    }

    onBeforeUnmount(() => {
      // Clear all pending auto-close timers so they don't fire on a dead ref
      for (const timerId of autoCloseTimers.values()) {
        clearTimeout(timerId)
      }
      autoCloseTimers.clear()
      // Remove the global reference only if it still points to our own api
      if (typeof window !== 'undefined' && window.$notify === api) {
        delete window.$notify
      }
    })

    return {
      notifications,
      addNotification,
      removeNotification
    }
  }
}
</script>

<style>
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  max-width: 400px;
}

.notification-container .alert {
  margin-bottom: 10px;
  padding: 14px 44px 14px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  color: #1f2937;
  font-size: 14px;
  line-height: 1.45;
}

.notification-container .alert strong {
  display: block;
  margin-bottom: 2px;
  color: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.notification-container .alert .btn-close {
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.58;
}

.notification-container .alert .btn-close:hover {
  opacity: 0.84;
}

.notification-container .alert-success {
  background: #e8f5e8;
  border-color: #9bcf9d;
  color: #1f5e24;
}

.notification-container .alert-warning {
  background: #fff7e6;
  border-color: #f2c46d;
  color: #7a4b00;
}

.notification-container .alert-danger {
  background: #fff1f0;
  border-color: #f0a6a6;
  color: #8a1f17;
}

.notification-container .alert-info {
  background: #eaf4ff;
  border-color: #9fc7ee;
  color: #164b75;
}

.notification-container .alert-primary {
  background: #e8f5e8;
  border-color: #9bcf9d;
  color: #1f5e24;
}

.notification-container .alert-secondary {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #374151;
}

.notification-container .alert:last-child {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .notification-container {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
  }
}
</style>
