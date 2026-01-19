#!/bin/bash

# CodeRabbit Backend Setup Script

echo "================================"
echo "CodeRabbit Backend Setup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
echo -e "${YELLOW}Checking Python version...${NC}"
python_version=$(python3 --version 2>&1 | awk '{print $2}')
required_version="3.11"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then 
    echo "Error: Python 3.11+ is required. You have $python_version"
    exit 1
fi
echo -e "${GREEN}✓ Python $python_version detected${NC}"
echo ""

# Create virtual environment
echo -e "${YELLOW}Creating virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi
echo ""

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source venv/bin/activate
echo -e "${GREEN}✓ Virtual environment activated${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Edit .env file and add your credentials:${NC}"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_KEY"
    echo "  - SUPABASE_SERVICE_KEY"
    echo "  - DATABASE_URL"
    echo "  - GITHUB_CLIENT_ID"
    echo "  - GITHUB_CLIENT_SECRET"
    echo "  - OPENAI_API_KEY"
    echo "  - SECRET_KEY (generate with: openssl rand -hex 32)"
    echo ""
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
    echo ""
fi

# Create logs directory
if [ ! -d "logs" ]; then
    mkdir logs
    echo -e "${GREEN}✓ Logs directory created${NC}"
else
    echo -e "${GREEN}✓ Logs directory already exists${NC}"
fi
echo ""

echo "================================"
echo -e "${GREEN}Setup completed successfully!${NC}"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your credentials"
echo "2. Run 'make dev' to start the development server"
echo "3. Visit http://localhost:8000/docs for API documentation"
echo ""
echo "For Docker setup:"
echo "1. Run 'make docker-build' to build the image"
echo "2. Run 'make docker-up' to start containers"
echo ""
