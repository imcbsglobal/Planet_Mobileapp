# Daily Notifications Setup

## What Was Implemented

Simple daily notifications to remind users to punch in and out:

### Notifications Schedule:
- **9:30 AM**: "Don't forget to punch in!" - Start your workday
- **6:00 PM**: "Don't forget to punch out!" - End your workday

## How It Works

1. **First Login**: App requests notification permission (one-time popup)
2. **Auto-Schedule**: Both notifications are scheduled to repeat daily
3. **Tap Action**: Tapping notification opens the Punch screen
4. **Background**: Works even when app is closed

## Testing

### Test Immediately (Without Waiting):
```javascript
// Add this temporarily in home-new.tsx setupNotifications function:

// Test notification in 5 seconds
await Notifications.scheduleNotificationAsync({
  content: {
    title: "Test: Don't forget to punch in!",
    body: 'This is a test notification',
    sound: true,
  },
  trigger: {
    seconds: 5,
  },
});
```

### Check Scheduled Notifications:
```javascript
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
console.log('Scheduled notifications:', scheduled);
```

## User Experience

- Notifications appear even if app is closed
- User can disable from phone settings (Settings > Apps > MY IMC > Notifications)
- Notifications persist until app is uninstalled
- No internet required

## Files Modified

1. `app.json` - Added expo-notifications plugin
2. `app/home-new.tsx` - Added notification setup and scheduling
3. `package.json` - Added expo-notifications dependency

## Troubleshooting

**Notifications not showing?**
- Check phone notification settings
- Ensure permission was granted
- Check Do Not Disturb mode
- Restart the app

**Want to change times?**
- Edit `hour` and `minute` values in `setupNotifications()` function
- hour: 0-23 (24-hour format)
- minute: 0-59
