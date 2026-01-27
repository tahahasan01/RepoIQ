"""Initial schema setup

Revision ID: 0001
Revises: 
Create Date: 2026-01-23

This migration documents the initial schema.
The actual tables should already exist in Supabase.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Initial schema - tables should already exist in Supabase.
    This migration serves as a baseline/documentation.
    
    Tables:
    - users: User accounts with GitHub integration
    - repositories: Synced GitHub repositories
    - analysis_results: Code analysis results
    - issues: Individual issues found during analysis
    - chat_messages: Conversational AI history
    - improvement_roadmaps: Generated improvement plans
    """
    # Tables created via Supabase dashboard/SQL editor
    # This migration serves as documentation
    pass


def downgrade() -> None:
    """Downgrade - drop all tables (DESTRUCTIVE)."""
    # WARNING: This will delete all data!
    # Only use in development
    # op.drop_table('improvement_roadmaps')
    # op.drop_table('chat_messages')
    # op.drop_table('issues')
    # op.drop_table('analysis_results')
    # op.drop_table('repositories')
    # op.drop_table('users')
    pass
