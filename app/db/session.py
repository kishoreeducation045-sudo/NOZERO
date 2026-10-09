import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings


url = settings.normalized_database_url
engine_kwargs = {"echo": False}

if "sqlite" in url:
    from sqlalchemy.pool import StaticPool
    engine_kwargs["poolclass"] = StaticPool
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    connect_args = {}
    if "pooler.supabase.com" in url or "6543" in url or "pgbouncer=true" in url:
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_cache_size"] = 0
    
    engine_kwargs["connect_args"] = connect_args
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        from sqlalchemy.pool import NullPool
        engine_kwargs["poolclass"] = NullPool
    else:
        engine_kwargs["pool_size"] = 5
        engine_kwargs["max_overflow"] = 10

engine = create_async_engine(
    url,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

_tables_initialized = False


async def ensure_tables():
    """Ensure database tables are created (especially for SQLite or fresh DB instances)."""
    global _tables_initialized
    if not _tables_initialized:
        try:
            from app.db.base import Base
            import app.models  # noqa: F401 - ensure all models are registered on Base
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            _tables_initialized = True
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("ensure_tables note: %s", e)


async def get_db() -> AsyncSession:  # type: ignore[return]
    if not _tables_initialized:
        await ensure_tables()

    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
