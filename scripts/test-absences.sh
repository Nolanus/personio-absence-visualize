#!/bin/bash

echo "🔍 Testing Personio Absences API..."
echo ""

# Check if backend is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Backend is not running!"
    echo "Please start it with: npm start"
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Test debug endpoint
echo "📊 Testing available endpoints..."
echo ""
curl -s http://localhost:3001/api/absences/debug | python3 -m json.tool

echo ""
echo ""
echo "📅 Testing absences with date range..."
START_DATE=$(date -v-30d +%Y-%m-%d)
END_DATE=$(date -v+30d +%Y-%m-%d)
echo "Date range: $START_DATE to $END_DATE"
echo ""

curl -s "http://localhost:3001/api/absences?start_date=$START_DATE&end_date=$END_DATE" | python3 -m json.tool

echo ""
echo "✅ Test complete!"
echo ""
echo "Check the backend terminal for detailed logs."
