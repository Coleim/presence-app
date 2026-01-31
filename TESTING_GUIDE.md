# Testing Documentation for Presence App

## Overview

This document describes the comprehensive test suite for the Presence App, with a special focus on **club ownership features** to ensure that future changes don't break existing functionality, especially when the user is the owner of a club.

## Test Structure

```
presence-app/
├── jest.config.js              # Jest configuration
├── jest.setup.js               # Test setup and mocks
├── __tests__/
│   └── e2e/
│       └── userFlows.test.ts   # End-to-end user flow tests
├── lib/
│   └── __tests__/
│       ├── dataService.test.ts # Unit tests for data service
│       └── authManager.test.ts # Unit tests for auth manager
└── screens/
    └── __tests__/
        ├── ClubDetailsScreen.test.tsx  # Component tests
        └── ClubListScreen.test.tsx     # Component tests
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test Suites
```bash
# Unit tests only
npm run test:unit

# Component tests only
npm run test:components

# E2E tests only
npm run test:e2e

# CI/CD mode
npm run test:ci
```

## Test Coverage

### 1. Unit Tests - Data Service (`lib/__tests__/dataService.test.ts`)

**Club Ownership Tests:**
- ✅ Owner can delete club from cloud
- ✅ Non-owner cannot delete club from cloud (only local)
- ✅ Offline mode allows local-only deletion
- ✅ Cascade deletion of sessions, participants, and attendance when owner deletes club

**CRUD Operations:**
- ✅ Create new club with local ID
- ✅ Update existing club
- ✅ Retrieve all clubs
- ✅ Retrieve specific club by ID
- ✅ Join club using share code

**Session Management:**
- ✅ Get sessions for a specific club
- ✅ Save new session

**Participant Management:**
- ✅ Get participants for a club
- ✅ Save new participant

### 2. Unit Tests - Auth Manager (`lib/__tests__/authManager.test.ts`)

**Authentication State:**
- ✅ Check if user is authenticated
- ✅ Return false when not authenticated
- ✅ Get current user ID
- ✅ Return null when no user is logged in
- ✅ Cache session for 5 seconds
- ✅ Invalidate cache when requested

### 3. Component Tests - Club Details Screen (`screens/__tests__/ClubDetailsScreen.test.tsx`)

**Owner Permissions:**
- ✅ Owner can delete their club
- ✅ Deletion works in offline mode (local-only)
- ✅ Non-owner restrictions are enforced

**Session Management:**
- ✅ Display sessions for the club
- ✅ Owner can delete sessions

**Participant Management:**
- ✅ Display participants for the club

**Share Code:**
- ✅ Display share code for the club

### 4. Component Tests - Club List Screen (`screens/__tests__/ClubListScreen.test.tsx`)

**Display:**
- ✅ Display list of clubs
- ✅ Show empty state when no clubs exist
- ✅ Navigate to club details when club is tapped

**Navigation:**
- ✅ Navigate to create club screen
- ✅ Navigate to join club screen
- ✅ Auto-navigate to club details when only one club exists

**Refresh:**
- ✅ Refresh clubs when screen comes into focus

### 5. End-to-End Tests (`__tests__/e2e/userFlows.test.ts`)

**Complete Club Lifecycle as Owner:**
- ✅ User creates a new club
- ✅ Owner adds sessions to the club
- ✅ Owner adds participants
- ✅ Owner retrieves all data
- ✅ Owner deletes club (with cascade)

**Non-Owner Behavior:**
- ✅ Member joins club using share code
- ✅ Member can view club but cannot delete from cloud
- ✅ Local deletion works for non-owners

**Offline Mode:**
- ✅ Full permissions granted in offline mode
- ✅ Create and delete clubs without server calls

**Session and Attendance:**
- ✅ Manage sessions as club owner
- ✅ Add participants
- ✅ Record attendance

## Critical Club Ownership Scenarios Covered

### Scenario 1: Owner Deletes Club
**What's tested:**
- Owner authentication is verified
- Cloud deletion is attempted
- All related data (sessions, participants, attendance) is cascade deleted
- Local storage is cleaned up
- Navigation returns to previous screen

**Why it matters:**
- Ensures data integrity
- Prevents orphaned records
- Maintains consistent state across local and cloud storage

### Scenario 2: Non-Owner Attempts to Delete Club
**What's tested:**
- User authentication is verified
- Ownership is checked
- Cloud deletion is skipped
- Only local deletion occurs
- User is notified appropriately

**Why it matters:**
- Prevents unauthorized deletions
- Protects club data from being removed by members
- Maintains multi-user collaboration

### Scenario 3: Offline Mode Operations
**What's tested:**
- All operations work without server connection
- Local storage is used exclusively
- No errors occur from failed server calls
- User has full control over local data

**Why it matters:**
- Supports offline-first architecture
- Ensures app remains functional without internet
- Provides seamless user experience

## Key Testing Principles

1. **Isolation**: Each test is independent and doesn't rely on others
2. **Mocking**: External dependencies (AsyncStorage, Supabase) are mocked
3. **Coverage**: Focus on critical paths, especially ownership logic
4. **Regression Prevention**: Tests prevent breaking existing features
5. **Documentation**: Tests serve as living documentation

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:

```bash
npm run test:ci
```

This command:
- Runs all tests
- Generates coverage report
- Uses limited workers for CI environments
- Fails if coverage thresholds aren't met

## Coverage Thresholds

Minimum coverage requirements (defined in `jest.config.js`):
- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 50%
- **Statements**: 50%

## Future Testing Considerations

### Areas to Expand:
1. **Integration Tests**: Test actual Supabase interactions (with test database)
2. **Visual Regression Tests**: Ensure UI doesn't break
3. **Performance Tests**: Test with large datasets
4. **Accessibility Tests**: Ensure app is accessible to all users

### Recommended Additions:
- Tests for stats calculation and display
- Tests for usage limits and premium features
- Tests for sync service operations
- Tests for localization/translation
- Tests for error handling and edge cases

## Troubleshooting

### Common Issues:

**Issue**: Tests fail with "Cannot find module"
**Solution**: Run `npm install` to ensure all dependencies are installed

**Issue**: Tests timeout
**Solution**: Increase Jest timeout in test files: `jest.setTimeout(10000)`

**Issue**: Mocks not working
**Solution**: Verify mock paths in `jest.setup.js` match actual file locations

**Issue**: React Native specific errors
**Solution**: Ensure `preset: 'react-native'` is set in `jest.config.js`

## Best Practices for Adding New Tests

1. **Follow the AAA Pattern**: Arrange, Act, Assert
2. **Use Descriptive Test Names**: Clearly state what is being tested
3. **Mock External Dependencies**: Keep tests fast and reliable
4. **Test One Thing**: Each test should verify a single behavior
5. **Clean Up**: Use `beforeEach` and `afterEach` to reset state
6. **Focus on Behavior**: Test what the code does, not how it does it

## Example Test Pattern

```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Arrange: Set up test conditions
    jest.clearAllMocks();
    // Mock necessary dependencies
  });

  it('should perform expected behavior when condition is met', async () => {
    // Arrange: Set up specific test data
    const mockData = { /* ... */ };
    
    // Act: Execute the code being tested
    const result = await functionUnderTest(mockData);
    
    // Assert: Verify expected outcomes
    expect(result).toBe(expectedValue);
    expect(mockFunction).toHaveBeenCalledWith(expectedArgs);
  });
});
```

## Contributing

When adding new features:
1. Write tests first (TDD approach recommended)
2. Ensure all existing tests pass
3. Add tests for new functionality
4. Update this documentation if needed
5. Run coverage report to ensure thresholds are met

## Monitoring Test Health

Regularly check:
- Test execution time (should remain fast)
- Flaky tests (tests that sometimes fail)
- Coverage trends (should improve or stay stable)
- Test maintenance burden (remove obsolete tests)

---

**Last Updated**: January 30, 2026
**Test Suite Version**: 1.0.0
**Maintained By**: Development Team
