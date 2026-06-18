"""
Authentication API endpoints.
Simplified for Neon Auth — most auth is handled client-side.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import UserResponse, BotInfoResponse
from ..auth import get_current_user
from ..telegram import tg_client
from ..config import get_settings

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/bot/info", response_model=BotInfoResponse)
async def get_bot_info_endpoint():
    """Get bot username and name for the login screen."""
    try:
        me = await tg_client.get_me()
        return BotInfoResponse(
            username=me.username,
            name=f"{me.first_name} {me.last_name or ''}".strip(),
            server_version="2.0.0"
        )
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get current authenticated user information."""
    return UserResponse(
        id=current_user.id,
        telegram_id=current_user.telegram_id,
        neon_auth_id=current_user.neon_auth_id,
        username=current_user.username,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        email=current_user.email,
        created_at=current_user.created_at,
        last_active=current_user.last_active,
    )


@router.get("/neon-auth-url")
async def get_neon_auth_url():
    """Return the Neon Auth URL for the frontend to redirect to."""
    return {
        "auth_url": settings.neon_auth_url,
    }
