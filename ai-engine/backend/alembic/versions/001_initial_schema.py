"""Initial schema - users, pipelines, jobs

Revision ID: 001
Revises:
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=True, default='user'),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # Pipelines table
    op.create_table(
        'pipelines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version', sa.String(length=50), nullable=True, default='1.0.0'),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('requires_approval', sa.Boolean(), nullable=True, default=True),
        sa.Column('graph_config', sa.JSON(), nullable=False, default=dict),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pipelines_id'), 'pipelines', ['id'], unique=False)

    # Pipeline nodes table
    op.create_table(
        'pipeline_nodes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pipeline_id', sa.Integer(), nullable=False),
        sa.Column('node_id', sa.String(length=100), nullable=False),
        sa.Column('node_type', sa.String(length=50), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False, default=dict),
        sa.Column('is_required', sa.Boolean(), nullable=True, default=True),
        sa.Column('timeout_seconds', sa.Integer(), nullable=True, default=3600),
        sa.Column('max_retries', sa.Integer(), nullable=True, default=3),
        sa.Column('position_x', sa.Integer(), nullable=True, default=0),
        sa.Column('position_y', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['pipeline_id'], ['pipelines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pipeline_nodes_id'), 'pipeline_nodes', ['id'], unique=False)

    # Pipeline edges table
    op.create_table(
        'pipeline_edges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pipeline_id', sa.Integer(), nullable=False),
        sa.Column('source_node_id', sa.String(length=100), nullable=False),
        sa.Column('target_node_id', sa.String(length=100), nullable=False),
        sa.Column('source_handle', sa.String(length=50), nullable=True),
        sa.Column('target_handle', sa.String(length=50), nullable=True),
        sa.Column('condition', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['pipeline_id'], ['pipelines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pipeline_edges_id'), 'pipeline_edges', ['id'], unique=False)

    # Jobs table
    op.create_table(
        'jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pipeline_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('pending', 'queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', name='jobstatus'), nullable=True, default='pending'),
        sa.Column('current_node_id', sa.String(length=100), nullable=True),
        sa.Column('input_data', sa.JSON(), nullable=False, default=dict),
        sa.Column('output_data', sa.JSON(), nullable=True),
        sa.Column('node_results', sa.JSON(), nullable=True, default=dict),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_details', sa.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['pipeline_id'], ['pipelines.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_jobs_id'), 'jobs', ['id'], unique=False)

    # Job approvals table
    op.create_table(
        'job_approvals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('node_id', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('decision', sa.String(length=20), nullable=True),
        sa.Column('comments', sa.Text(), nullable=True),
        sa.Column('preview_data', sa.JSON(), nullable=True),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_job_approvals_id'), 'job_approvals', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_job_approvals_id'), table_name='job_approvals')
    op.drop_table('job_approvals')
    op.drop_index(op.f('ix_jobs_id'), table_name='jobs')
    op.drop_table('jobs')
    op.drop_index(op.f('ix_pipeline_edges_id'), table_name='pipeline_edges')
    op.drop_table('pipeline_edges')
    op.drop_index(op.f('ix_pipeline_nodes_id'), table_name='pipeline_nodes')
    op.drop_table('pipeline_nodes')
    op.drop_index(op.f('ix_pipelines_id'), table_name='pipelines')
    op.drop_table('pipelines')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
