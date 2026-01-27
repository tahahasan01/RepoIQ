"""
Alembic environment configuration for RepoIQ migrations.

This file handles database connection and migration execution.
Supports both online (connected) and offline (SQL script) migrations.
"""
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, create_engine
from alembic import context

# Add the Backend directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# This is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Get database URL from environment
# Note: Supabase uses PostgreSQL, so we need the direct connection string
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Construct from Supabase URL if DATABASE_URL not provided
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    if SUPABASE_URL:
        # Extract the project reference from Supabase URL
        # Format: https://[project-ref].supabase.co
        import re
        match = re.search(r'https://([^.]+)\.supabase\.co', SUPABASE_URL)
        if match:
            project_ref = match.group(1)
            # Construct PostgreSQL connection string
            # Note: You'll need to get the actual password from Supabase dashboard
            DATABASE_URL = f"postgresql://postgres:[YOUR-PASSWORD]@db.{project_ref}.supabase.co:5432/postgres"

# Override sqlalchemy.url in alembic.ini
if DATABASE_URL:
    config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Add your models here for autogenerate support
# from app.models import Base
# target_metadata = Base.metadata
target_metadata = None


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    
    This generates SQL script without connecting to the database.
    Useful for generating migration scripts to run manually.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.
    
    Creates an engine and connects to the database.
    """
    # Get connection URL
    url = config.get_main_option("sqlalchemy.url")
    
    if not url or "[YOUR-PASSWORD]" in url:
        print("ERROR: DATABASE_URL not configured properly")
        print("Please set DATABASE_URL environment variable with your Supabase connection string")
        print("You can find this in Supabase Dashboard > Settings > Database > Connection String")
        return
    
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
