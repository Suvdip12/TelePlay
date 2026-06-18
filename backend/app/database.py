"""
Database setup with SQLAlchemy async support.
Uses Neon PostgreSQL exclusively.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.engine import make_url
from .config import get_settings

settings = get_settings()

# Convert database URL for async driver (asyncpg)
url = make_url(settings.database_url)

# Force PostgreSQL async driver
if url.drivername in ("postgresql", "postgres"):
    url = url.set(drivername="postgresql+asyncpg")
elif url.drivername == "postgresql+asyncpg":
    pass  # Already correct
else:
    # Fallback: assume PostgreSQL
    url = url.set(drivername="postgresql+asyncpg")

import ssl

# Remove query params that asyncpg doesn't support
query = dict(url.query)
for unsupported_key in ("schema", "channel_binding", "sslmode"):
    query.pop(unsupported_key, None)
url = url.set(query=query)

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

engine = create_async_engine(
    url, 
    echo=False,
    pool_pre_ping=True,
    pool_recycle=1800,  # Recycle connections every 30 minutes
    pool_size=40,       # Increased pool size for high concurrency
    max_overflow=20,    # Allow more overflow connections
    connect_args={"ssl": ssl_context}
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """Dependency for getting database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
