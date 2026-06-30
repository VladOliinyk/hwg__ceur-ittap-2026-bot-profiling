<template>
  <div class="notification-test">
    <h3>Notification system test</h3>
    <p>Click buttons to test different notification types:</p>
    
    <div class="test-buttons">
      <button @click="testSuccess" class="btn btn-success me-2">Success</button>
      <button @click="testError" class="btn btn-danger me-2">Error</button>
      <button @click="testWarning" class="btn btn-warning me-2">Warning</button>
      <button @click="testInfo" class="btn btn-info me-2">Info</button>
      <button @click="testPrimary" class="btn btn-primary me-2">Primary</button>
      <button @click="testSecondary" class="btn btn-secondary me-2">Secondary</button>
    </div>
    
    <div class="mt-3">
      <button @click="testMultiple" class="btn btn-outline-primary">Test multiple notifications</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NotificationTest',
  methods: {
    testSuccess() {
      window.$notify.success('Success!', 'This is a success notification')
    },
    
    testError() {
      window.$notify.error('Error!', 'This is an error notification')
    },
    
    testWarning() {
      window.$notify.warning('Warning!', 'This is a warning notification')
    },
    
    testInfo() {
      window.$notify.info('Info', 'This is an info notification')
    },
    
    testPrimary() {
      window.$notify.primary('Primary', 'This is a primary notification')
    },
    
    testSecondary() {
      window.$notify.secondary('Secondary', 'This is a secondary notification')
    },
    
    testMultiple() {
      window.$notify.success('First', 'First notification')
      setTimeout(() => window.$notify.error('Second', 'Second notification'), 500)
      setTimeout(() => window.$notify.warning('Third', 'Third notification'), 1000)
      setTimeout(() => window.$notify.info('Fourth', 'Fourth notification'), 1500)
    }
  }
}
</script>

<style scoped>
.notification-test {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.test-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}
</style>
