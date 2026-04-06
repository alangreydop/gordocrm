"""Utilidades de seguridad y autenticación."""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import hmac
import hashlib
import base64
import json

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Shared secret para validar JWT desde CRM
CRM_SHARED_SECRET = "gordo-ai-engine-secret-key-2026"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica una contraseña contra un hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hashea una contraseña."""
    return pwd_context.hash(password)


def create_access_token(
    data: dict, expires_delta: Optional[timedelta] = None
) -> str:
    """Crea un JWT token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decodifica un JWT token."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def verify_crm_jwt(token: str) -> Optional[dict]:
    """
    Valida un JWT proveniente del CRM usando el shared secret.

    El CRM crea tokens con HMAC-SHA256 usando el shared secret.
    Este función valida la firma y devuelve el payload si es válido.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None

        header_b64, payload_b64, signature_b64 = parts

        # Decodificar base64url
        def base64url_decode(data: str) -> bytes:
            # Añadir padding si es necesario
            padding = 4 - len(data) % 4
            if padding != 4:
                data += '=' * padding
            return base64.urlsafe_b64decode(data)

        header = json.loads(base64url_decode(header_b64))
        payload = json.loads(base64url_decode(payload_b64))
        signature = base64url_decode(signature_b64)

        # Verificar algoritmo
        if header.get('alg') != 'HS256':
            return None

        # Verificar expiración
        if 'exp' in payload and payload['exp'] < datetime.utcnow().timestamp():
            return None

        # Verificar firma
        message = f"{header_b64}.{payload_b64}".encode('utf-8')
        key = CRM_SHARED_SECRET.encode('utf-8')

        expected_signature = hmac.new(key, message, hashlib.sha256).digest()

        if not hmac.compare_digest(signature, expected_signature):
            return None

        return payload
    except Exception:
        return None


def create_webhook_signature(payload: str, secret: str) -> str:
    """
    Crea una firma HMAC-SHA256 para un webhook.

    Args:
        payload: El cuerpo del webhook como string
        secret: El secreto compartido para firmar

    Returns:
        Firma en base64url
    """
    key = secret.encode('utf-8')
    message = payload.encode('utf-8')

    signature = hmac.new(key, message, hashlib.sha256).digest()

    # Codificar como base64url
    return base64.urlsafe_b64encode(signature).rstrip(b'=').decode('utf-8')
