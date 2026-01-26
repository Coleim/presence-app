# Usage Limits & Freemium Strategy

## Overview

Your app now has **database-level protection** against abuse and a **user-friendly freemium strategy** to encourage upgrades to a paid version.

## 🔒 Database Limits (Enforced)

These limits are **enforced at the database level** in `sql/add_rate_limits.sql`:

| Resource | Free Tier Limit | 
|----------|----------------|
| Clubs per user (owner) | **1** |
| Participants per club | **30** |
| Sessions per club | **10** |
| Club memberships per user | **5** |
| Attendance records per club per day | **1,000** |

### Security Features
- ✅ Limits enforced even if API keys are compromised
- ✅ Text field size limits to prevent spam
- ✅ Database triggers prevent bypass
- ✅ Monitoring views for admin oversight

## 📱 UI Implementation

### Files Created

1. **`lib/usageLimits.ts`** - Constants and helper functions
2. **`lib/usageService.ts`** - Fetch usage stats from database
3. **`components/UsageBadge.tsx`** - Progress bars showing usage
4. **`components/UpgradePrompt.tsx`** - Friendly upgrade prompts
5. **`docs/USAGE_LIMITS_EXAMPLES.tsx`** - Implementation examples

### Usage Patterns

#### 1. **Before Creating** (Prevent action)
```tsx
// In CreateClubScreen, AddParticipantScreen, etc.
const stats = await usageService.getUserUsageStats(userId);
if (hasReachedClubLimit(stats.clubsOwned)) {
  // Show upgrade prompt
}
```

#### 2. **Show Progress** (Visual feedback)
```tsx
// Show how many participants/sessions used
<UsageBadge
  current={participantCount}
  limit={30}
  label="Participants"
/>
```

#### 3. **Upgrade Prompt** (When limit reached)
```tsx
<UpgradePrompt
  message="Vous avez atteint la limite de 30 participants"
  onUpgrade={() => navigation.navigate('Upgrade')}
/>
```

## 🎨 UX Best Practices

### ✅ DO:
- Show limits **before** users hit them (progress bars)
- Use friendly, encouraging language
- Make upgrade path clear and easy
- Use color coding (green → yellow → red)
- Show value of premium ("unlimited clubs!")

### ❌ DON'T:
- Don't show upgrade prompts on every screen
- Don't block users from viewing their data
- Don't use aggressive/negative language
- Don't hide the limitations (be transparent)

## 📊 Monitoring

Admin views are created for monitoring:

```sql
-- See usage patterns
SELECT * FROM v_clubs_per_user;
SELECT * FROM v_participants_per_club;
SELECT * FROM v_sessions_per_club;
SELECT * FROM v_daily_attendance_per_club;
```

## 🚀 Next Steps

### 1. Apply Database Limits
```sql
-- In Supabase SQL Editor, run:
-- sql/add_rate_limits.sql
```

### 2. Add Usage UI to Key Screens

#### CreateClubScreen
- Check if user can create club
- Show upgrade prompt if limit reached
- Display "0/1 club used" subtly

#### AddParticipantScreen  
- Show participant count badge
- Warn when approaching 30
- Block + prompt at limit

#### AddSessionScreen
- Show session count badge
- Warn when approaching 10
- Block + prompt at limit

#### HomeScreen (optional)
- Show compact badges on clubs
- Subtle "1/1 club" indicator

### 3. Create Upgrade/Premium Screen
- Explain benefits of premium
- Pricing (if applicable)
- Contact/payment flow
- Or just a "Coming soon" message

### 4. Handle Database Errors Gracefully

When users hit limits, the database will throw errors like:
```
"User can only own 1 club maximum"
"Club cannot have more than 30 participants"
```

Make sure to catch these and show friendly messages:

```tsx
try {
  await dataService.saveClub(club);
} catch (error) {
  if (error.message.includes('only own 1 club')) {
    // Show upgrade prompt
  }
}
```

## 💡 Monetization Ideas

### Option 1: One-time Purchase
- "Premium Upgrade: $4.99"
- Unlock all limits permanently

### Option 2: Subscription
- "Premium: $2.99/month"
- Unlimited everything

### Option 3: Contact for Pricing
- "Contact us for unlimited access"
- Good for B2B/schools

### Option 4: Freemium Forever
- Keep limits to prevent abuse
- Don't charge, just protect your database
- Add "request increase" option

## 🔐 Security Notes

- Limits are **server-side enforced**
- Cannot be bypassed from client
- Even with stolen API keys, limits apply
- Text field limits prevent spam attacks

## Questions?

This strategy is very common and effective:
- ✅ Protects your infrastructure
- ✅ Encourages upgrades naturally
- ✅ Users understand the value
- ✅ Fair for everyone
