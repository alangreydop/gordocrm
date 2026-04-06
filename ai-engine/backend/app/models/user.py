"""Modelos de base de datos para usuarios."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func

from ..core.database import Base


class User(Base):
    """Usuario del sistema."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # Auth
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    # Perfil
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="user")  # 'admin', 'user', 'viewer'

    # Estado
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)
