"""
Neon Auth JWT verification using JWKS.
Replaces the old custom JWT system with Neon Auth's public key verification.
"""
import logging
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .config import get_settings
from .database import get_db
from .models import User

logger = logging.getLogger(__name__)

settings = get_settings()
security = HTTPBearer(auto_error=False)

# Initialize JWKS client for Neon Auth (caches keys automatically)
_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> PyJWKClient:
    """Lazy-initialize the JWKS client."""
    global _jwks_client
    if _jwks_client is None:
        jwks_url = settings.neon_auth_jwks_url
        logger.info(f"Initializing JWKS client with URL: {jwks_url}")
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def verify_neon_auth_token(token: str) -> Optional[dict]:
    """
    Verify a Neon Auth JWT token using JWKS.
    Returns the decoded payload if valid, None otherwise.
    """
    try:
        client = get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "EdDSA", "ES256"],
            options={
                "verify_exp": True,
                "verify_aud": False,  # Neon Auth may not set audience
            },
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Neon Auth token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid Neon Auth token: {e}")
        return None
    except Exception as e:
        logger.error(f"JWKS verification error: {e}")
        return None


async def get_current_user(
    request: Request = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency to get current authenticated user via Neon Auth JWT.
    Supports Bearer token in header or ?token= query param.
    Auto-creates user on first login.
    """
    token = None
    
    # Try getting token from Authorization header
    if credentials:
        token = credentials.credentials
    
    # If not in header, try query parameter (for streaming/images)
    if not token and request and "token" in request.query_params:
        token = request.query_params["token"]
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify token via Neon Auth JWKS
    payload = verify_neon_auth_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract user identity from Neon Auth JWT
    neon_auth_id = payload.get("sub")
    if not neon_auth_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )
    
    # Look up user by neon_auth_id
    result = await db.execute(select(User).where(User.neon_auth_id == neon_auth_id))
    user = result.scalar_one_or_none()
    
    if not user:
        # Auto-create user on first Neon Auth login
        email = payload.get("email")
        name = payload.get("name", "")
        name_parts = name.split(" ", 1) if name else ["", ""]
        
        user = User(
            neon_auth_id=neon_auth_id,
            email=email,
            first_name=name_parts[0] if name_parts else None,
            last_name=name_parts[1] if len(name_parts) > 1 else None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info(f"Auto-created user for Neon Auth ID: {neon_auth_id}")
    
    return user
