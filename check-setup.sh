#!/bin/bash

echo "🔍 Checking setup..."
echo ""

# Check if .env exists
if [ ! -f backend/.env ]; then
    echo "❌ backend/.env file not found!"
    echo ""
    echo "To set up your environment:"
    echo "  1. Copy the example file:"
    echo "     cp backend/.env.example backend/.env"
    echo ""
    echo "  2. Edit backend/.env and add your Personio credentials:"
    echo "     PERSONIO_CLIENT_ID=your_client_id_here"
    echo "     PERSONIO_CLIENT_SECRET=your_client_secret_here"
    echo ""
    exit 1
else
    echo "✅ backend/.env file found"
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "⚠️  Root dependencies not installed"
    echo "   Run: npm install"
else
    echo "✅ Root dependencies installed"
fi

if [ ! -d "backend/node_modules" ]; then
    echo "⚠️  Backend dependencies not installed"
    echo "   Run: cd backend && npm install"
else
    echo "✅ Backend dependencies installed"
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "⚠️  Frontend dependencies not installed"
    echo "   Run: cd frontend && npm install"
else
    echo "✅ Frontend dependencies installed"
fi

echo ""
echo "✨ Setup complete! Run 'npm start' to launch the application."
