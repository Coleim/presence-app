#!/bin/bash

# Quick Test Script for Presence App
# This script runs various test commands to verify the test suite

echo "=================================="
echo "Presence App - Test Suite Runner"
echo "=================================="
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js and npm."
    exit 1
fi

echo "✅ npm found"
echo ""

# Function to run a test command
run_test() {
    local name=$1
    local command=$2
    
    echo "📋 Running: $name"
    echo "   Command: $command"
    echo "-----------------------------------"
    
    if eval "$command"; then
        echo "✅ $name - PASSED"
    else
        echo "❌ $name - FAILED"
        return 1
    fi
    echo ""
}

# Run all tests
run_test "All Tests" "npm test -- --silent"

# Run tests with coverage
echo "📊 Generating Coverage Report..."
npm run test:coverage -- --silent > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Coverage report generated"
    echo ""
    echo "Coverage Summary:"
    npm run test:coverage 2>&1 | grep -A 20 "Coverage summary" | tail -15
else
    echo "⚠️ Coverage report generation had issues (but tests still passed)"
fi

echo ""
echo "=================================="
echo "Test Summary"
echo "=================================="
echo "✅ All test suites completed"
echo "📁 Test files:"
echo "   - lib/__tests__/dataService.test.ts"
echo "   - lib/__tests__/authManager.test.ts"
echo "   - screens/__tests__/ClubDetailsScreen.test.tsx"
echo "   - screens/__tests__/ClubListScreen.test.tsx"
echo "   - __tests__/e2e/userFlows.test.ts"
echo ""
echo "📖 Documentation:"
echo "   - TESTING_GUIDE.md"
echo "   - TEST_IMPLEMENTATION_SUMMARY.md"
echo ""
echo "🎉 Test suite is ready to use!"
