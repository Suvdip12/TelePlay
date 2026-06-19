"""
Shared business logic and database queries.
"""
import re
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from .models import File, WatchProgress, Folder

def escape_like(value: str) -> str:
    """Escape special LIKE/ILIKE characters to prevent SQL injection."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

def sanitize_filename(name: str) -> str:
    """
    Sanitize filename to prevent path traversal and XSS attacks.
    """
    if not name:
        return "unnamed_file"
    
    # Remove null bytes and path separators
    name = name.replace("\x00", "").replace("/", "_").replace("\\", "_")
    
    # Remove dangerous characters
    name = re.sub(r'[<>:"|?*\x00-\x1f]', '_', name)
    
    # Remove leading/trailing dots and spaces
    name = name.strip(". ")
    
    # Limit length
    if len(name) > 255:
        if "." in name:
            ext = name.rsplit(".", 1)[-1][:10]
            name = name[:255 - len(ext) - 1] + "." + ext
        else:
            name = name[:255]
    
    return name if name else "unnamed_file"

def add_urls_to_file(file: File) -> dict:
    """Add stream and thumbnail URLs to file response."""
    data = {
        "id": file.id,
        "user_id": file.user_id,
        "folder_id": file.folder_id,
        "file_id": file.file_id,
        "file_unique_id": file.file_unique_id,
        "file_name": file.file_name,
        "file_size": file.file_size,
        "mime_type": file.mime_type,
        "file_type": file.file_type,
        "duration": file.duration,
        "width": file.width,
        "height": file.height,
        "created_at": file.created_at,
        "updated_at": file.updated_at,
        "stream_url": f"/api/stream/{file.id}",
        "thumbnail_url": f"/api/stream/{file.id}/thumbnail" if file.thumbnail_file_id else None,
        "last_pos": file.watch_progress[0].position if file.watch_progress else 0,
    }
    
    if file.public_hash:
        data["public_hash"] = file.public_hash
        data["public_stream_url"] = f"/api/stream/s/{file.public_hash}"
        
    return data

async def fetch_recent_files(db: AsyncSession, user_id: int, limit: int) -> List[File]:
    """Get recently added files across all folders."""
    query = (
        select(File)
        .where(File.user_id == user_id)
        .options(selectinload(File.watch_progress))
        .order_by(desc(File.created_at))
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()

async def fetch_continue_watching_files(db: AsyncSession, user_id: int, limit: int) -> List[File]:
    """Get files with watch progress (not completed)."""
    query = (
        select(File)
        .join(WatchProgress, File.id == WatchProgress.file_id)
        .where(
            File.user_id == user_id,
            WatchProgress.user_id == user_id,
            WatchProgress.position > 0,
            WatchProgress.completed == False
        )
        .options(selectinload(File.watch_progress))
        .order_by(desc(WatchProgress.updated_at))
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().unique().all()

def extract_video_thumbnail(video_path: str) -> Optional[str]:
    """
    Extracts a frame from the video and saves it to a temp JPEG file.
    Requires opencv-python-headless.
    """
    try:
        import cv2
        import os
        import tempfile
        import secrets
    except ImportError:
        return None
        
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    
    try:
        # Read the duration or total frames
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        
        # Pick a frame at around 1 second, or 10% of the video
        target_frame = int(min(frame_count * 0.1, fps * 1.0))
        if target_frame >= frame_count:
            target_frame = 0
            
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
    finally:
        cap.release()
        
    if not ret:
        return None
        
    # Save to a temporary jpeg file
    tmp_dir = os.path.join(tempfile.gettempdir(), "teleplay_thumbnails")
    os.makedirs(tmp_dir, exist_ok=True)
    thumb_path = os.path.join(tmp_dir, f"thumb_{secrets.token_hex(4)}.jpg")
    
    # Save using cv2.imwrite
    cv2.imwrite(thumb_path, frame)
    return thumb_path

